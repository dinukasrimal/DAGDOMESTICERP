import React, { useState, useCallback } from 'react';
import { useSupabaseProductionData } from '../hooks/useSupabaseProductionData';
import { SchedulingBoard } from './SchedulingBoard';
import { PendingOrdersSidebar } from './PendingOrdersSidebar';
import { AdminPanel } from './AdminPanel';
import { GoogleSheetsConfig } from './GoogleSheetsConfig';
import { Header } from './Header';
import { LineFilter } from './LineFilter';
import { Button } from './ui/button';
import { RefreshCw, FileText } from 'lucide-react';
import { TooltipProvider } from './ui/tooltip';
import { Order, ProductionLine } from '../types/scheduler';
import { ReportDialog } from './reports/ReportDialog';
import { CuttingReportContent } from './reports/CuttingReportContent';
import { DeliveryReportContent } from './reports/DeliveryReportContent';
import { LinePlanReportDialog } from './reports/LinePlanReportDialog';
import { downloadElementAsPdf } from '../lib/pdfUtils';
import { toast } from "@/hooks/use-toast";
import { dataService } from "../services/dataService";

export const ProductionScheduler: React.FC = () => {
  const [userRole, setUserRole] = useState<'planner' | 'superuser'>('planner');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCuttingReport, setShowCuttingReport] = useState(false);
  const [showDeliveryReport, setShowDeliveryReport] = useState(false);
  const [showLinePlanReport, setShowLinePlanReport] = useState(false);
  const [selectedProductionLine, setSelectedProductionLine] = useState<ProductionLine | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  
  const {
    orders,
    productionLines,
    holidays,
    rampUpPlans,
    isLoading,
    error,
    isGoogleSheetsConfigured,
    setOrders,
    setProductionLines,
    setHolidays,
    setRampUpPlans,
    fetchOrdersFromGoogleSheets,
    configureGoogleSheets,
    updateOrderInDatabase,
    createOrderInDatabase,
    deleteOrderFromDatabase,
    clearError
  } = useSupabaseProductionData();

  // Initialize selected lines when production lines are loaded
  React.useEffect(() => {
    if (productionLines.length > 0 && selectedLineIds.length === 0) {
      setSelectedLineIds(productionLines.map(line => line.id));
    }
  }, [productionLines, selectedLineIds.length]);

  const handleToggleAdmin = () => {
    setShowAdminPanel(!showAdminPanel);
  };

  const handleRoleChange = (role: 'planner' | 'superuser') => {
    setUserRole(role);
    if (role === 'planner') {
      setShowAdminPanel(false);
    }
  };

  const handleLineToggle = (lineId: string, checked: boolean) => {
    if (checked) {
      setSelectedLineIds(prev => [...prev, lineId]);
    } else {
      setSelectedLineIds(prev => prev.filter(id => id !== lineId));
    }
  };

  const handleSelectAll = () => {
    setSelectedLineIds(productionLines.map(line => line.id));
  };

  const handleDeselectAll = () => {
    setSelectedLineIds([]);
  };

  // Filter production lines based on selection
  const filteredProductionLines = productionLines.filter(line => 
    selectedLineIds.includes(line.id)
  );

  // Helper function to find magnetically connected orders
  const findMagneticChain = useCallback((startOrder: Order, allOrders: Order[]): Order[] => {
    const chain: Order[] = [startOrder];
    const visited = new Set([startOrder.id]);
    
    // Find orders that are magnetically connected (end-to-end scheduling)
    const findConnected = (currentOrder: Order, direction: 'forward' | 'backward') => {
      const currentEndDate = currentOrder.planEndDate;
      const currentStartDate = currentOrder.planStartDate;
      
      if (!currentEndDate || !currentStartDate || !currentOrder.assignedLineId) return;
      
      for (const order of allOrders) {
        if (visited.has(order.id) || !order.planStartDate || !order.planEndDate || order.assignedLineId !== currentOrder.assignedLineId) continue;
        
        if (direction === 'forward') {
          // Check if this order starts the day after current order ends
          const nextDay = new Date(currentEndDate);
          nextDay.setDate(nextDay.getDate() + 1);
          if (order.planStartDate.toDateString() === nextDay.toDateString()) {
            visited.add(order.id);
            chain.push(order);
            findConnected(order, 'forward');
          }
        } else {
          // Check if this order ends the day before current order starts
          const prevDay = new Date(currentStartDate);
          prevDay.setDate(prevDay.getDate() - 1);
          if (order.planEndDate.toDateString() === prevDay.toDateString()) {
            visited.add(order.id);
            chain.unshift(order); // Add to beginning for backward chain
            findConnected(order, 'backward');
          }
        }
      }
    };
    
    findConnected(startOrder, 'forward');
    findConnected(startOrder, 'backward');
    
    return chain;
  }, []);

  const refreshPlan = useCallback(async () => {
    setIsRefreshing(true);
    try {
      console.log('🔄 Refreshing plan to reschedule around holidays...');
      
      // Get all scheduled orders
      const scheduledOrders = orders.filter(order => 
        order.status === 'scheduled' && 
        order.planStartDate && 
        order.planEndDate &&
        order.assignedLineId
      );

      // Find orders with holiday conflicts
      const ordersWithConflicts: Order[] = [];
      
      for (const order of scheduledOrders) {
        if (!order.planStartDate || !order.planEndDate || !order.assignedLineId) continue;
        
        // Check if any production day falls on a holiday
        const hasHolidayConflict = Object.keys(order.actualProduction || {}).some(dateStr => {
          const productionQty = order.actualProduction?.[dateStr] || 0;
          if (productionQty === 0) return false;
          
          const productionDate = new Date(dateStr);
          return holidays.some(holiday => 
            holiday.date.toDateString() === productionDate.toDateString()
          );
        });
        
        if (hasHolidayConflict) {
          ordersWithConflicts.push(order);
        }
      }

      if (ordersWithConflicts.length === 0) {
        console.log('✅ No orders need rescheduling - no holiday conflicts found');
        return;
      }

      console.log(`📅 Found ${ordersWithConflicts.length} orders with holiday conflicts`);
      
      // Process each conflicting order and its magnetic chain
      const processedOrders = new Set<string>();
      
      for (const conflictOrder of ordersWithConflicts) {
        if (processedOrders.has(conflictOrder.id)) continue;
        
        // Find the magnetic chain for this order
        const magneticChain = findMagneticChain(conflictOrder, scheduledOrders);
        console.log(`🧲 Found magnetic chain of ${magneticChain.length} orders starting with ${conflictOrder.poNumber}`);
        
        // Mark all orders in chain as processed
        magneticChain.forEach(order => processedOrders.add(order.id));
        
        // Move the entire magnetic chain to avoid holidays
        await rescheduleMagneticChain(magneticChain);
      }
      
      console.log('✅ Plan refresh completed successfully');
      
    } catch (error) {
      console.error('❌ Error refreshing plan:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [orders, holidays, findMagneticChain, updateOrderInDatabase]);

  // Function to reschedule a magnetic chain of orders
  const rescheduleMagneticChain = useCallback(async (magneticChain: Order[]) => {
    if (magneticChain.length === 0) return;
    
    const firstOrder = magneticChain[0];
    if (!firstOrder.assignedLineId || !firstOrder.planStartDate) return;
    
    const line = productionLines.find(l => l.id === firstOrder.assignedLineId);
    if (!line) return;
    
    console.log(`🔄 Rescheduling magnetic chain starting with ${firstOrder.poNumber}`);
    
    // Find next available date after holidays for the first order
    let newStartDate = new Date(firstOrder.planStartDate);
    
    // Keep moving forward until we find a date without holiday conflicts
    while (true) {
      const hasHoliday = holidays.some(h => h.date.toDateString() === newStartDate.toDateString());
      if (!hasHoliday) break;
      newStartDate.setDate(newStartDate.getDate() + 1);
    }
    
    // If start date changed, reschedule the entire chain
    if (newStartDate.toDateString() !== firstOrder.planStartDate.toDateString()) {
      let currentStartDate = new Date(newStartDate);
      
      for (const order of magneticChain) {
        // Check for overlaps at new position
        const overlappingOrders = orders.filter(o => 
          o.status === 'scheduled' &&
          o.assignedLineId === order.assignedLineId &&
          o.id !== order.id &&
          !magneticChain.some(chainOrder => chainOrder.id === o.id) &&
          o.planStartDate && o.planEndDate &&
          currentStartDate <= o.planEndDate
        );
        
        // Move overlapping orders backward
        for (const overlapping of overlappingOrders) {
          console.log(`📤 Moving overlapping order ${overlapping.poNumber} backward`);
          await handleOrderMovedToPending(overlapping);
        }
        
        // Calculate new production plan avoiding holidays
        const newDailyPlan = await calculateHolidayAwareProduction(order, line, currentStartDate);
        const planDates = Object.keys(newDailyPlan);
        const newEndDate = planDates.length > 0 
          ? new Date(Math.max(...planDates.map(d => new Date(d).getTime())))
          : currentStartDate;
        
        // Update order with new schedule
        await updateOrderInDatabase(order.id, {
          planStartDate: currentStartDate,
          planEndDate: newEndDate,
          actualProduction: newDailyPlan
        });
        
        console.log(`✅ Rescheduled ${order.poNumber} from ${currentStartDate.toDateString()} to ${newEndDate.toDateString()}`);
        
        // Next order starts the day after this one ends
        currentStartDate = new Date(newEndDate);
        currentStartDate.setDate(currentStartDate.getDate() + 1);
      }
    }
  }, [productionLines, holidays, orders, updateOrderInDatabase]);

  // Helper function to calculate production avoiding holidays
  const calculateHolidayAwareProduction = useCallback(async (order: Order, line: any, startDate: Date) => {
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);
    
    while (remainingQty > 0) {
      const isHoliday = holidays.some(h => h.date.toDateString() === currentDate.toDateString());
      
      if (!isHoliday) {
        const dailyCapacity = line.capacity;
        const plannedQty = Math.min(remainingQty, dailyCapacity);
        
        if (plannedQty > 0) {
          dailyPlan[currentDate.toISOString().split('T')[0]] = plannedQty;
          remainingQty -= plannedQty;
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Safety check
      if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        break;
      }
    }
    
    return dailyPlan;
  }, [holidays]);

  const handleOrderScheduled = useCallback(async (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => {
    try {
      console.log('Scheduling order:', order.poNumber, 'from', startDate, 'to', endDate);
      console.log('Daily plan:', dailyPlan);
      
      // Update the order with schedule dates, daily production plan, and line assignment
      const updatedOrderData: Partial<Order> = {
        planStartDate: startDate,
        planEndDate: endDate,
        status: 'scheduled' as const,
        actualProduction: dailyPlan,
        assignedLineId: order.assignedLineId
      };

      // Update in database
      await updateOrderInDatabase(order.id, updatedOrderData);

      console.log('Order scheduled successfully:', order.poNumber, 'on line:', order.assignedLineId);
    } catch (error) {
      console.error('Failed to schedule order:', error);
    }
  }, [updateOrderInDatabase]);

  const handleOrderMovedToPending = useCallback(async (order: Order) => {
    try {
      console.log('Moving order back to pending:', order.poNumber);
      
      const updatedOrder: Partial<Order> = {
        planStartDate: null,
        planEndDate: null,
        status: 'pending' as const,
        actualProduction: {},
        assignedLineId: undefined
      };

      await updateOrderInDatabase(order.id, updatedOrder);
      console.log('Order moved back to pending:', order.poNumber);
    } catch (error) {
      console.error('Failed to move order to pending:', error);
    }
  }, [updateOrderInDatabase]);

  const handleOrderSplit = useCallback(async (orderId: string, splitQuantity: number) => {
    try {
      const orderToSplit = orders.find(o => o.id === orderId);
      if (!orderToSplit || splitQuantity >= orderToSplit.orderQuantity) {
        return;
      }

      const remainingQuantity = orderToSplit.orderQuantity - splitQuantity;
      
      // Get the base PO number (without any existing "Split X" suffix)
      let basePONumber = orderToSplit.poNumber;
      if (basePONumber.includes(' Split ')) {
        basePONumber = basePONumber.split(' Split ')[0];
      }
      
      // Find all orders that share the same base PO number to determine next split number
      const relatedOrders = orders.filter(o => {
        const orderBasePO = o.poNumber.includes(' Split ') ? o.poNumber.split(' Split ')[0] : o.poNumber;
        return orderBasePO === basePONumber;
      });
      
      // Count existing splits to determine the next split number
      const existingSplitNumbers = relatedOrders
        .filter(o => o.poNumber.includes(' Split '))
        .map(o => {
          const match = o.poNumber.match(/ Split (\d+)$/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => num > 0);
      
      // Find the next available split number
      const nextSplitNumber = existingSplitNumbers.length > 0 ? Math.max(...existingSplitNumbers) + 1 : 1;
      
      // Create the split order with proper numbering
      const splitOrderData: Omit<Order, 'id'> = {
        poNumber: `${basePONumber} Split ${nextSplitNumber}`,
        styleId: orderToSplit.styleId,
        orderQuantity: splitQuantity,
        smv: orderToSplit.smv,
        moCount: orderToSplit.moCount,
        cutQuantity: Math.round((orderToSplit.cutQuantity / orderToSplit.orderQuantity) * splitQuantity),
        issueQuantity: Math.round((orderToSplit.issueQuantity / orderToSplit.orderQuantity) * splitQuantity),
        status: 'pending',
        planStartDate: null,
        planEndDate: null,
        actualProduction: {},
        assignedLineId: undefined,
        basePONumber: basePONumber,
        splitNumber: nextSplitNumber
      };

      // Create the split order in database
      await createOrderInDatabase(splitOrderData);

      // Update the original order
      const updatedOriginalOrder: Partial<Order> = {
        orderQuantity: remainingQuantity,
        cutQuantity: orderToSplit.cutQuantity - splitOrderData.cutQuantity,
        issueQuantity: orderToSplit.issueQuantity - splitOrderData.issueQuantity,
        basePONumber: basePONumber,
        splitNumber: orderToSplit.splitNumber || 0
      };

      // If the original order doesn't have a split number and we're creating splits, mark it as the base
      if (!orderToSplit.poNumber.includes(' Split ')) {
        updatedOriginalOrder.poNumber = `${basePONumber} Split 0`;
        updatedOriginalOrder.splitNumber = 0;
      }

      await updateOrderInDatabase(orderId, updatedOriginalOrder);

      console.log(`Split order created: ${splitOrderData.poNumber} (qty: ${splitQuantity})`);
      console.log(`Original order updated: ${updatedOriginalOrder.poNumber} (qty: ${remainingQuantity})`);
    } catch (error) {
      console.error('Failed to split order:', error);
    }
  }, [orders, createOrderInDatabase, updateOrderInDatabase]);

  // Filter pending orders - exclude orders that have plan dates (are scheduled)
  const pendingOrders = orders.filter(order => 
    order.status === 'pending' && !order.planStartDate && !order.planEndDate
  );

  const handleOrderDelete = useCallback(async (orderId: string) => {
    try {
      await deleteOrderFromDatabase(orderId);
      // Optionally: show a toast notification if available
    } catch (err: any) {
      // Optionally: show a destructive toast notification
      // toast({ title: "Failed to delete", description: err?.message || "An error occurred.", variant: "destructive" });
    }
  }, [deleteOrderFromDatabase]);

  const handleLinePlanReport = (productionLine: ProductionLine) => {
    setSelectedProductionLine(productionLine);
    setShowLinePlanReport(true);
  };

  if (showAdminPanel) {
    return (
      <TooltipProvider>
        <AdminPanel
          orders={orders}
          productionLines={productionLines}
          holidays={holidays}
          rampUpPlans={rampUpPlans}
          onOrdersChange={setOrders}
          onProductionLinesChange={setProductionLines}
          onHolidaysChange={setHolidays}
          onRampUpPlansChange={setRampUpPlans}
          onClose={() => setShowAdminPanel(false)}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background">
        <Header
          userRole={userRole}
          onToggleAdmin={handleToggleAdmin}
          onRoleChange={handleRoleChange}
        />
        
        {/* Line Filter */}
        <div className="p-4 border-b border-border bg-card">
          <LineFilter
            productionLines={productionLines}
            selectedLineIds={selectedLineIds}
            onLineToggle={handleLineToggle}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
          />
        </div>
        
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar container: Now scrollable if content overflows, fix width */}
          <div className="w-80 h-full border-r border-border bg-card flex flex-col overflow-y-auto">
            {/* Top section: Google Sheets Config and Refresh Plan */}
            <div className="p-4 border-b border-border space-y-4 flex-shrink-0">
              <GoogleSheetsConfig
                isLoading={isLoading}
                error={error}
                isConfigured={isGoogleSheetsConfigured}
                onSync={fetchOrdersFromGoogleSheets}
                onConfigure={configureGoogleSheets}
                onClearError={clearError}
              />
              
              <Button
                onClick={refreshPlan}
                disabled={isRefreshing || isLoading}
                className="w-full"
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing Plan...' : 'Refresh Plan'}
              </Button>
            </div>
            
            {/* Middle section: Pending Orders */}
            <div className="flex-1 min-h-[350px] max-h-[none] overflow-y-auto py-4">
              <PendingOrdersSidebar
                orders={pendingOrders}
                onOrderSplit={handleOrderSplit}
                onOrderDelete={handleOrderDelete}
              />
            </div>

            {/* Bottom section: Reports */}
            <div className="p-4 border-t border-border space-y-2 mt-auto flex-shrink-0">
              <h4 className="text-sm font-medium text-muted-foreground pt-2">Reports</h4>
              <Button
                onClick={() => setShowCuttingReport(true)}
                className="w-full"
                variant="outline"
              >
                <FileText className="h-4 w-4 mr-2" />
                Cutting Report
              </Button>
              <Button
                onClick={() => setShowDeliveryReport(true)}
                className="w-full"
                variant="outline"
              >
                <FileText className="h-4 w-4 mr-2" />
                Delivery Report
              </Button>
              
              {/* Line Reports */}
              <div className="space-y-1">
                <h5 className="text-xs font-medium text-muted-foreground">Line Reports</h5>
                {productionLines.map(line => (
                  <Button
                    key={line.id}
                    onClick={() => handleLinePlanReport(line)}
                    className="w-full text-xs"
                    variant="outline"
                    size="sm"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    {line.name} Plan
                  </Button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <SchedulingBoard
              orders={orders}
              productionLines={filteredProductionLines}
              holidays={holidays}
              rampUpPlans={rampUpPlans}
              onOrderScheduled={handleOrderScheduled}
              onOrderMovedToPending={handleOrderMovedToPending}
              onOrderSplit={handleOrderSplit}
            />
          </div>
        </div>
      </div>

      {/* Report Dialogs */}
      <ReportDialog
        isOpen={showCuttingReport}
        onClose={() => setShowCuttingReport(false)}
        title="Cutting Report"
        onDownloadPdf={() => downloadElementAsPdf('cutting-report-content', 'Cutting_Report')}
      >
        <CuttingReportContent
          orders={orders.filter(o => o.planStartDate && (o.status === 'scheduled' || o.status === 'in_progress'))}
          holidays={holidays}
          reportId="cutting-report-content"
        />
      </ReportDialog>

      <ReportDialog
        isOpen={showDeliveryReport}
        onClose={() => setShowDeliveryReport(false)}
        title="Delivery Report"
        onDownloadPdf={() => downloadElementAsPdf('delivery-report-content', 'Delivery_Report')}
      >
        <DeliveryReportContent
          orders={orders.filter(o => o.status === 'completed' && o.planEndDate)}
          reportId="delivery-report-content"
        />
      </ReportDialog>

      {/* Line Plan Report Dialog */}
      {selectedProductionLine && (
        <LinePlanReportDialog
          isOpen={showLinePlanReport}
          onClose={() => {
            setShowLinePlanReport(false);
            setSelectedProductionLine(null);
          }}
          productionLine={selectedProductionLine}
          orders={orders}
          holidays={holidays}
        />
      )}
    </TooltipProvider>
  );
};

export default ProductionScheduler;

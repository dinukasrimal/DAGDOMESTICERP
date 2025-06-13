
import React, { useState, useCallback } from 'react';
import { useSupabaseProductionData } from '../hooks/useSupabaseProductionData';
import { SchedulerBoard } from './scheduler/SchedulerBoard';
import { PendingOrdersSidebar } from './PendingOrdersSidebar';
import { AdminPanel } from './AdminPanel';
import { GoogleSheetsConfig } from './GoogleSheetsConfig';
import { Header } from './Header';
import { Button } from './ui/button';
import { RefreshCw } from 'lucide-react';
import { TooltipProvider } from './ui/tooltip';
import { Order } from '../types/scheduler';

export const ProductionScheduler: React.FC = () => {
  const [userRole, setUserRole] = useState<'planner' | 'superuser'>('planner');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
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
    updateOrderSchedule,
    updateOrderInDatabase,
    createOrderInDatabase,
    clearError
  } = useSupabaseProductionData();

  const handleToggleAdmin = () => {
    setShowAdminPanel(!showAdminPanel);
  };

  const handleRoleChange = (role: 'planner' | 'superuser') => {
    setUserRole(role);
    if (role === 'planner') {
      setShowAdminPanel(false);
    }
  };

  // Enhanced refresh plan with strict capacity constraints and magnetic behavior
  const refreshPlan = useCallback(async () => {
    setIsRefreshing(true);
    try {
      console.log('🔄 Starting enhanced magnetic refresh plan...');
      
      const scheduledOrders = orders.filter(order => 
        order.status === 'scheduled' && 
        order.planStartDate && 
        order.planEndDate &&
        order.assignedLineId
      );

      // Group orders by line and sort by start date
      const ordersByLine = scheduledOrders.reduce((acc, order) => {
        const lineId = order.assignedLineId!;
        if (!acc[lineId]) acc[lineId] = [];
        acc[lineId].push(order);
        return acc;
      }, {} as { [lineId: string]: Order[] });

      // Process each line with magnetic snapping and capacity constraints
      for (const [lineId, lineOrders] of Object.entries(ordersByLine)) {
        const line = productionLines.find(l => l.id === lineId);
        if (!line) continue;

        console.log(`🔧 Processing line ${line.name} with ${lineOrders.length} orders`);

        // Sort orders by start date to maintain chronological order
        const sortedOrders = lineOrders.sort((a, b) => {
          const dateA = a.planStartDate ? new Date(a.planStartDate).getTime() : 0;
          const dateB = b.planStartDate ? new Date(b.planStartDate).getTime() : 0;
          return dateA - dateB;
        });

        // Reschedule orders with magnetic behavior and strict capacity limits
        let currentDate = sortedOrders[0]?.planStartDate ? new Date(sortedOrders[0].planStartDate) : new Date();
        
        // Skip holidays for starting date
        while (isHoliday(currentDate)) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        for (const order of sortedOrders) {
          const newDailyPlan = await rescheduleOrderWithCapacityConstraints(order, line, currentDate);
          
          if (Object.keys(newDailyPlan).length > 0) {
            const planDates = Object.keys(newDailyPlan);
            const newEndDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
            
            await updateOrderInDatabase(order.id, {
              planStartDate: currentDate,
              planEndDate: newEndDate,
              actualProduction: newDailyPlan
            });

            // Next order starts immediately after this one (magnetic behavior)
            currentDate = new Date(newEndDate);
            currentDate.setDate(currentDate.getDate() + 1);
            
            // Skip holidays
            while (isHoliday(currentDate)) {
              currentDate.setDate(currentDate.getDate() + 1);
            }
            
            console.log(`✅ Rescheduled ${order.poNumber}: ${currentDate.toDateString()} - ${newEndDate.toDateString()}`);
          }
        }
      }
      
      console.log('✅ Enhanced magnetic refresh completed');
      
    } catch (error) {
      console.error('❌ Error during enhanced magnetic refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [orders, productionLines, holidays, updateOrderInDatabase]);

  // Helper function to check if date is holiday
  const isHoliday = useCallback((date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  }, [holidays]);

  // Enhanced rescheduling with strict capacity constraints
  const rescheduleOrderWithCapacityConstraints = useCallback(async (order: Order, line: any, startDate: Date) => {
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);

    // Get existing capacity usage for other orders (excluding this order)
    const getExistingCapacity = (date: Date) => {
      const dateStr = date.toISOString().split('T')[0];
      return orders
        .filter(o => 
          o.status === 'scheduled' && 
          o.assignedLineId === line.id && 
          o.id !== order.id &&
          o.actualProduction?.[dateStr] > 0
        )
        .reduce((sum, o) => sum + (o.actualProduction?.[dateStr] || 0), 0);
    };

    while (remainingQty > 0) {
      if (!isHoliday(currentDate)) {
        const existingCapacity = getExistingCapacity(currentDate);
        const availableCapacity = Math.max(0, line.capacity - existingCapacity);
        const plannedQty = Math.min(remainingQty, availableCapacity);
        
        if (plannedQty > 0) {
          dailyPlan[currentDate.toISOString().split('T')[0]] = plannedQty;
          remainingQty -= plannedQty;
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Safety check to prevent infinite loops
      if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        console.error('Rescheduling took too long, breaking');
        break;
      }
    }

    return dailyPlan;
  }, [orders, holidays]);

  const handleOrderScheduled = useCallback(async (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => {
    try {
      console.log('✅ Scheduling order:', order.poNumber, 'from', startDate, 'to', endDate);
      
      const updatedOrderData: Partial<Order> = {
        planStartDate: startDate,
        planEndDate: endDate,
        status: 'scheduled' as const,
        actualProduction: dailyPlan,
        assignedLineId: order.assignedLineId
      };

      await updateOrderInDatabase(order.id, updatedOrderData);

      if (isGoogleSheetsConfigured) {
        const updatedOrder = { ...order, ...updatedOrderData };
        await updateOrderSchedule(updatedOrder, startDate, endDate);
      }

      console.log('✅ Order scheduled successfully:', order.poNumber);
    } catch (error) {
      console.error('❌ Failed to schedule order:', error);
    }
  }, [updateOrderInDatabase, updateOrderSchedule, isGoogleSheetsConfigured]);

  const handleOrderMovedToPending = useCallback(async (order: Order) => {
    try {
      console.log('🔄 Moving order to pending:', order.poNumber);
      
      const updatedOrder: Partial<Order> = {
        planStartDate: null,
        planEndDate: null,
        status: 'pending' as const,
        actualProduction: {},
        assignedLineId: undefined
      };

      await updateOrderInDatabase(order.id, updatedOrder);
      console.log('✅ Order moved to pending:', order.poNumber);
    } catch (error) {
      console.error('❌ Failed to move order to pending:', error);
    }
  }, [updateOrderInDatabase]);

  const handleOrderSplit = useCallback(async (orderId: string, splitQuantity: number) => {
    try {
      const orderToSplit = orders.find(o => o.id === orderId);
      if (!orderToSplit || splitQuantity >= orderToSplit.orderQuantity) {
        return;
      }

      const remainingQuantity = orderToSplit.orderQuantity - splitQuantity;
      
      // Generate split order name
      let basePONumber = orderToSplit.poNumber;
      if (basePONumber.includes(' Split ')) {
        basePONumber = basePONumber.split(' Split ')[0];
      }
      
      const relatedOrders = orders.filter(o => {
        const orderBasePO = o.poNumber.includes(' Split ') ? o.poNumber.split(' Split ')[0] : o.poNumber;
        return orderBasePO === basePONumber;
      });
      
      const existingSplitNumbers = relatedOrders
        .filter(o => o.poNumber.includes(' Split '))
        .map(o => {
          const match = o.poNumber.match(/ Split (\d+)$/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => num > 0);
      
      const nextSplitNumber = existingSplitNumbers.length > 0 ? Math.max(...existingSplitNumbers) + 1 : 1;
      
      // Create new split order
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

      await createOrderInDatabase(splitOrderData);

      // Update original order
      const updatedOriginalOrder: Partial<Order> = {
        orderQuantity: remainingQuantity,
        cutQuantity: orderToSplit.cutQuantity - splitOrderData.cutQuantity,
        issueQuantity: orderToSplit.issueQuantity - splitOrderData.issueQuantity,
        basePONumber: basePONumber,
        splitNumber: orderToSplit.splitNumber || 0
      };

      if (!orderToSplit.poNumber.includes(' Split ')) {
        updatedOriginalOrder.poNumber = `${basePONumber} Split 0`;
        updatedOriginalOrder.splitNumber = 0;
      }

      await updateOrderInDatabase(orderId, updatedOriginalOrder);

      console.log(`✅ Split order created: ${splitOrderData.poNumber} (qty: ${splitQuantity})`);
    } catch (error) {
      console.error('❌ Failed to split order:', error);
    }
  }, [orders, createOrderInDatabase, updateOrderInDatabase]);

  const pendingOrders = orders.filter(order => 
    order.status === 'pending' && !order.planStartDate && !order.planEndDate
  );

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
        
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 border-r border-border bg-card flex flex-col shadow-sm">
            <div className="p-4 border-b border-border space-y-4">
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
            
            <div className="flex-1 overflow-hidden">
              <PendingOrdersSidebar
                orders={pendingOrders}
                onOrderSplit={handleOrderSplit}
              />
            </div>
          </div>
          
          {/* Main Scheduler */}
          <div className="flex-1 overflow-hidden">
            <SchedulerBoard
              orders={orders}
              productionLines={productionLines}
              holidays={holidays}
              onOrderScheduled={handleOrderScheduled}
              onOrderMovedToPending={handleOrderMovedToPending}
              onOrderSplit={handleOrderSplit}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

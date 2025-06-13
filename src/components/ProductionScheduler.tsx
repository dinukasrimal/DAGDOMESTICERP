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

  // Enhanced refresh plan with targeted magnetic behavior for holiday changes
  const refreshPlan = useCallback(async () => {
    setIsRefreshing(true);
    try {
      console.log('🔄 Starting targeted magnetic refresh plan...');
      
      const scheduledOrders = orders.filter(order => 
        order.status === 'scheduled' && 
        order.planStartDate && 
        order.planEndDate &&
        order.assignedLineId
      );

      // Group orders by line
      const ordersByLine = scheduledOrders.reduce((acc, order) => {
        const lineId = order.assignedLineId!;
        if (!acc[lineId]) acc[lineId] = [];
        acc[lineId].push(order);
        return acc;
      }, {} as { [lineId: string]: Order[] });

      // Process each line with targeted approach
      for (const [lineId, lineOrders] of Object.entries(ordersByLine)) {
        const line = productionLines.find(l => l.id === lineId);
        if (!line) continue;

        console.log(`🔧 Processing line ${line.name} with ${lineOrders.length} orders`);

        // Sort orders by start date
        const sortedOrders = lineOrders.sort((a, b) => {
          const dateA = a.planStartDate ? new Date(a.planStartDate).getTime() : 0;
          const dateB = b.planStartDate ? new Date(b.planStartDate).getTime() : 0;
          return dateA - dateB;
        });

        // FIXED: Only reschedule orders that are affected by holiday changes
        const affectedOrders = findOrdersAffectedByHolidayChanges(sortedOrders);
        
        if (affectedOrders.length === 0) {
          console.log(`✅ No orders affected by holiday changes in line ${line.name}`);
          continue;
        }

        console.log(`🎯 Found ${affectedOrders.length} orders affected by holiday changes`);

        // Find the earliest affected order to start rescheduling from there
        const firstAffectedOrder = affectedOrders[0];
        const startIndex = sortedOrders.findIndex(o => o.id === firstAffectedOrder.id);
        
        // Reschedule from the first affected order onwards
        let currentDate = firstAffectedOrder.planStartDate ? new Date(firstAffectedOrder.planStartDate) : new Date();
        
        for (let i = startIndex; i < sortedOrders.length; i++) {
          const order = sortedOrders[i];
          const newDailyPlan = await rescheduleOrderMagnetically(order, line, currentDate);
          
          if (Object.keys(newDailyPlan).length > 0) {
            const planDates = Object.keys(newDailyPlan);
            const newEndDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
            
            await updateOrderInDatabase(order.id, {
              planStartDate: currentDate,
              planEndDate: newEndDate,
              actualProduction: newDailyPlan
            });

            // Next order starts the day after this one ends
            currentDate = new Date(newEndDate);
            currentDate.setDate(currentDate.getDate() + 1);
            
            console.log(`✅ Rescheduled ${order.poNumber}: ${currentDate.toDateString()} - ${newEndDate.toDateString()}`);
          }
        }
      }
      
      console.log('✅ Targeted magnetic refresh completed');
      
    } catch (error) {
      console.error('❌ Error during targeted magnetic refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [orders, productionLines, holidays, updateOrderInDatabase]);

  // Helper function to identify orders affected by holiday changes
  const findOrdersAffectedByHolidayChanges = useCallback((orders: Order[]) => {
    const affectedOrders: Order[] = [];
    
    for (const order of orders) {
      if (!order.planStartDate || !order.planEndDate || !order.actualProduction) continue;
      
      // Check if any production days fall on current holidays
      const productionDays = Object.keys(order.actualProduction);
      const hasHolidayConflict = productionDays.some(dateStr => {
        const date = new Date(dateStr);
        return holidays.some(h => h.date.toDateString() === date.toDateString());
      });
      
      if (hasHolidayConflict) {
        affectedOrders.push(order);
        // Also include all subsequent orders in the line for magnetic effect
        const subsequentOrders = orders.filter(o => 
          o.planStartDate && 
          order.planEndDate &&
          new Date(o.planStartDate) > new Date(order.planEndDate)
        );
        affectedOrders.push(...subsequentOrders);
        break; // Once we find the first affected order, we include all subsequent ones
      }
    }
    
    return [...new Set(affectedOrders)]; // Remove duplicates
  }, [holidays]);

  // Enhanced magnetic rescheduling with capacity optimization
  const rescheduleOrderMagnetically = useCallback(async (order: Order, line: any, startDate: Date) => {
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);

    const isHoliday = (date: Date) => {
      return holidays.some(h => h.date.toDateString() === date.toDateString());
    };

    // FIXED: Enhanced capacity handling for magnetic rescheduling
    while (remainingQty > 0) {
      if (!isHoliday(currentDate)) {
        // Get available capacity for this day
        const dateStr = currentDate.toISOString().split('T')[0];
        const usedCapacity = orders
          .filter(o => 
            o.status === 'scheduled' && 
            o.assignedLineId === line.id && 
            o.id !== order.id && // Exclude current order
            o.actualProduction?.[dateStr] > 0
          )
          .reduce((sum, o) => sum + (o.actualProduction?.[dateStr] || 0), 0);
        
        const availableCapacity = Math.max(0, line.capacity - usedCapacity);
        const plannedQty = Math.min(remainingQty, availableCapacity);
        
        if (plannedQty > 0) {
          dailyPlan[dateStr] = plannedQty;
          remainingQty -= plannedQty;
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        break;
      }
    }

    return dailyPlan;
  }, [holidays, orders]);

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
          <div className="w-80 border-r border-border bg-card flex flex-col">
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
          
          <div className="flex-1 overflow-auto">
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

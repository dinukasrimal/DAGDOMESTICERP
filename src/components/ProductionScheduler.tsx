import React, { useState, useCallback } from 'react';
import { useSupabaseProductionData } from '../hooks/useSupabaseProductionData';
import { SchedulingBoard } from './SchedulingBoard';
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

  const refreshPlan = useCallback(async () => {
    setIsRefreshing(true);
    try {
      console.log('🔄 Refreshing plan to avoid holidays...');
      
      // Get all scheduled orders
      const scheduledOrders = orders.filter(order => 
        order.status === 'scheduled' && 
        order.planStartDate && 
        order.planEndDate &&
        order.assignedLineId
      );

      // Check each scheduled order against holidays
      const ordersToReschedule: Order[] = [];
      
      for (const order of scheduledOrders) {
        if (!order.planStartDate || !order.planEndDate) continue;
        
        // Check if any day in the order's plan falls on a holiday
        const orderStartTime = new Date(order.planStartDate).getTime();
        const orderEndTime = new Date(order.planEndDate).getTime();
        
        const hasHolidayConflict = holidays.some(holiday => {
          const holidayTime = new Date(holiday.date).getTime();
          return holidayTime >= orderStartTime && holidayTime <= orderEndTime;
        });
        
        if (hasHolidayConflict) {
          ordersToReschedule.push(order);
        }
      }

      if (ordersToReschedule.length === 0) {
        console.log('✅ No orders need rescheduling - no holiday conflicts found');
        return;
      }

      console.log(`📅 Found ${ordersToReschedule.length} orders with holiday conflicts, moving to pending...`);
      
      // Move conflicting orders back to pending
      for (const order of ordersToReschedule) {
        await updateOrderInDatabase(order.id, {
          planStartDate: null,
          planEndDate: null,
          status: 'pending' as const,
          actualProduction: {},
          assignedLineId: undefined
        });
        
        console.log(`⏪ Moved ${order.poNumber} back to pending due to holiday conflict`);
      }
      
      console.log('✅ Plan refresh completed successfully');
      
    } catch (error) {
      console.error('❌ Error refreshing plan:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [orders, holidays, updateOrderInDatabase]);

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

      // Update the schedule in Google Sheets if configured
      if (isGoogleSheetsConfigured) {
        const updatedOrder = { ...order, ...updatedOrderData };
        await updateOrderSchedule(updatedOrder, startDate, endDate);
      }

      console.log('Order scheduled successfully:', order.poNumber, 'on line:', order.assignedLineId);
    } catch (error) {
      console.error('Failed to schedule order:', error);
    }
  }, [updateOrderInDatabase, updateOrderSchedule, isGoogleSheetsConfigured]);

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
          {/* Simple sidebar - always visible */}
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
              
              {/* Refresh Plan Button */}
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
            <SchedulingBoard
              orders={orders}
              productionLines={productionLines}
              holidays={holidays}
              rampUpPlans={rampUpPlans}
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

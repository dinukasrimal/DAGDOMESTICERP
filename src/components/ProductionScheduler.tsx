import React, { useState, useCallback } from 'react';
import { useProductionData } from '../hooks/useProductionData';
import { SchedulingBoard } from './SchedulingBoard';
import { PendingOrdersSidebar } from './PendingOrdersSidebar';
import { AdminPanel } from './AdminPanel';
import { GoogleSheetsConfig } from './GoogleSheetsConfig';
import { Header } from './Header';
import { TooltipProvider } from './ui/tooltip';
import { Order } from '../types/scheduler';

export const ProductionScheduler: React.FC = () => {
  const [userRole, setUserRole] = useState<'planner' | 'superuser'>('planner');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
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
    updateOrderStatus,
    clearError
  } = useProductionData();

  const handleToggleAdmin = () => {
    setShowAdminPanel(!showAdminPanel);
  };

  const handleRoleChange = (role: 'planner' | 'superuser') => {
    setUserRole(role);
    if (role === 'planner') {
      setShowAdminPanel(false);
    }
  };

  const handleOrderScheduled = useCallback(async (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => {
    try {
      // Update the order with schedule dates, daily production plan, and line assignment
      const updatedOrder = {
        ...order,
        planStartDate: startDate,
        planEndDate: endDate,
        status: 'scheduled' as const,
        actualProduction: dailyPlan,
        assignedLineId: order.assignedLineId // Preserve the line assignment
      };

      // Update the orders list
      setOrders(prevOrders => 
        prevOrders.map(o => o.id === order.id ? updatedOrder : o)
      );

      // Update the schedule in Google Sheets if configured
      if (isGoogleSheetsConfigured) {
        await updateOrderSchedule(updatedOrder, startDate, endDate);
      }

      console.log('Order scheduled successfully:', order.poNumber, 'on line:', order.assignedLineId);
    } catch (error) {
      console.error('Failed to schedule order:', error);
    }
  }, [setOrders, updateOrderSchedule, isGoogleSheetsConfigured]);

  const handleOrderMovedToPending = useCallback((order: Order) => {
    const updatedOrder = {
      ...order,
      planStartDate: null,
      planEndDate: null,
      status: 'pending' as const,
      actualProduction: {},
      assignedLineId: undefined // Clear the line assignment when moving back to pending
    };

    setOrders(prevOrders => 
      prevOrders.map(o => o.id === order.id ? updatedOrder : o)
    );

    console.log('Order moved back to pending:', order.poNumber);
  }, [setOrders]);

  // Completely redone split functionality with proper numbering
  const handleOrderSplit = useCallback((orderId: string, splitQuantity: number) => {
    setOrders(prevOrders => {
      const orderToSplit = prevOrders.find(o => o.id === orderId);
      if (!orderToSplit || splitQuantity >= orderToSplit.orderQuantity) {
        return prevOrders;
      }

      const remainingQuantity = orderToSplit.orderQuantity - splitQuantity;
      
      // Get the base PO number (without any existing "Split X" suffix)
      let basePONumber = orderToSplit.poNumber;
      if (basePONumber.includes(' Split ')) {
        basePONumber = basePONumber.split(' Split ')[0];
      }
      
      // Find all orders that share the same base PO number to determine next split number
      const relatedOrders = prevOrders.filter(o => {
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
      const splitOrder: Order = {
        ...orderToSplit,
        id: `${orderId}-split-${Date.now()}`,
        poNumber: `${basePONumber} Split ${nextSplitNumber}`,
        orderQuantity: splitQuantity,
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

      // Update the original order
      const updatedOriginalOrder: Order = {
        ...orderToSplit,
        orderQuantity: remainingQuantity,
        cutQuantity: orderToSplit.cutQuantity - splitOrder.cutQuantity,
        issueQuantity: orderToSplit.issueQuantity - splitOrder.issueQuantity,
        // If original was not a split, make it Split 0 (or keep existing split number)
        basePONumber: basePONumber,
        splitNumber: orderToSplit.splitNumber || 0
      };

      // If the original order doesn't have a split number and we're creating splits, mark it as the base
      if (!orderToSplit.poNumber.includes(' Split ')) {
        updatedOriginalOrder.poNumber = `${basePONumber} Split 0`;
        updatedOriginalOrder.splitNumber = 0;
      }

      console.log(`Split order created: ${splitOrder.poNumber} (qty: ${splitQuantity})`);
      console.log(`Original order updated: ${updatedOriginalOrder.poNumber} (qty: ${remainingQuantity})`);

      return prevOrders.map(o => 
        o.id === orderId ? updatedOriginalOrder : o
      ).concat(splitOrder);
    });
  }, [setOrders]);

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
            <div className="p-4 border-b border-border">
              <GoogleSheetsConfig
                isLoading={isLoading}
                error={error}
                isConfigured={isGoogleSheetsConfigured}
                onSync={fetchOrdersFromGoogleSheets}
                onConfigure={configureGoogleSheets}
                onClearError={clearError}
              />
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

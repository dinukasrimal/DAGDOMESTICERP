import React, { useState, useCallback, useMemo } from 'react';
import { Order, ProductionLine, Holiday } from '../../types/scheduler';
import { SchedulerHeader } from './SchedulerHeader';
import { SchedulerGrid } from './SchedulerGrid';
import { PlacementDialog } from './PlacementDialog';
import { SchedulingDialog } from './SchedulingDialog';

interface SchedulerBoardProps {
  orders: Order[];
  productionLines: ProductionLine[];
  holidays: Holiday[];
  onOrderScheduled: (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => Promise<void>;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
}

export const SchedulerBoard: React.FC<SchedulerBoardProps> = ({
  orders,
  productionLines,
  holidays,
  onOrderScheduled,
  onOrderMovedToPending,
  onOrderSplit
}) => {
  // Generate 30 days from today
  const dates = useMemo(() => 
    Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() + i);
      return date;
    }), []
  );

  // State for dialogs
  const [placementDialog, setPlacementDialog] = useState<{
    isOpen: boolean;
    draggedOrder: Order | null;
    targetLine: string;
    targetDate: Date | null;
    overlappingOrders: Order[];
  }>({
    isOpen: false,
    draggedOrder: null,
    targetLine: '',
    targetDate: null,
    overlappingOrders: []
  });

  const [schedulingDialog, setSchedulingDialog] = useState<{
    isOpen: boolean;
    order: Order | null;
    lineId: string;
    startDate: Date | null;
  }>({
    isOpen: false,
    order: null,
    lineId: '',
    startDate: null
  });

  // Helper functions
  const isHoliday = useCallback((date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  }, [holidays]);

  const getOrdersForCell = useCallback((lineId: string, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return orders.filter(order => 
      order.status === 'scheduled' &&
      order.assignedLineId === lineId &&
      order.actualProduction?.[dateStr] > 0
    );
  }, [orders]);

  const getUsedCapacity = useCallback((lineId: string, date: Date) => {
    const ordersInCell = getOrdersForCell(lineId, date);
    const dateStr = date.toISOString().split('T')[0];
    return ordersInCell.reduce((sum, order) => 
      sum + (order.actualProduction?.[dateStr] || 0), 0
    );
  }, [getOrdersForCell]);

  const getAvailableCapacity = useCallback((lineId: string, date: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return 0;
    const usedCapacity = getUsedCapacity(lineId, date);
    return Math.max(0, line.capacity - usedCapacity);
  }, [productionLines, getUsedCapacity]);

  // Find overlapping orders when dropping
  const findOverlappingOrders = useCallback((order: Order, lineId: string, targetDate: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return [];

    // Calculate estimated duration
    const estimatedDays = Math.ceil(order.orderQuantity / line.capacity);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + estimatedDays - 1);

    // Find overlapping scheduled orders
    return orders.filter(scheduledOrder => 
      scheduledOrder.status === 'scheduled' &&
      scheduledOrder.assignedLineId === lineId &&
      scheduledOrder.id !== order.id &&
      scheduledOrder.planStartDate &&
      scheduledOrder.planEndDate &&
      targetDate <= new Date(scheduledOrder.planEndDate) &&
      endDate >= new Date(scheduledOrder.planStartDate)
    );
  }, [orders, productionLines]);

  // Handle drop from pending orders or within scheduler
  const handleDrop = useCallback((e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    
    if (isHoliday(date)) {
      console.log('Cannot drop on holiday');
      return;
    }

    try {
      const orderData = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (!orderData?.id || !orderData?.poNumber) return;

      const overlappingOrders = findOverlappingOrders(orderData, lineId, date);
      
      if (overlappingOrders.length > 0) {
        // Show placement dialog for overlaps
        setPlacementDialog({
          isOpen: true,
          draggedOrder: orderData,
          targetLine: lineId,
          targetDate: date,
          overlappingOrders
        });
      } else {
        // Direct scheduling without overlaps
        setSchedulingDialog({
          isOpen: true,
          order: orderData,
          lineId,
          startDate: date
        });
      }
    } catch (error) {
      console.error('Failed to parse dropped order:', error);
    }
  }, [isHoliday, findOverlappingOrders]);

  // Enhanced placement choice handler for "Before" behavior
  const handlePlacementChoice = useCallback(async (placement: 'before' | 'after') => {
    const { draggedOrder, targetLine, targetDate, overlappingOrders } = placementDialog;
    
    if (!draggedOrder || !targetDate) return;

    if (placement === 'before') {
      // FIXED: Place dragged order first, then reschedule overlapping orders to follow it
      console.log('🔧 Placing order BEFORE overlapping orders');
      
      // First, schedule the dragged order at the target date
      setSchedulingDialog({
        isOpen: true,
        order: draggedOrder,
        lineId: targetLine,
        startDate: targetDate
      });
      
      // After the dragged order is scheduled, we'll reschedule overlapping orders
      // This will be handled in the handleScheduleConfirm function
      
    } else {
      // Enhanced "After" behavior - find last capacity and fill remaining space first
      console.log('🔧 Placing order AFTER overlapping orders with capacity optimization');
      
      const line = productionLines.find(l => l.id === targetLine);
      if (!line) return;
      
      // Find the latest end date among overlapping orders
      const latestEndDate = overlappingOrders.reduce((latest, order) => {
        const endDate = order.planEndDate ? new Date(order.planEndDate) : latest;
        return endDate > latest ? endDate : latest;
      }, targetDate);
      
      // Check if the last day has remaining capacity
      const lastDayCapacity = getUsedCapacity(targetLine, latestEndDate);
      const remainingCapacity = line.capacity - lastDayCapacity;
      
      let startDate = new Date(latestEndDate);
      
      if (remainingCapacity > 0 && remainingCapacity < draggedOrder.orderQuantity) {
        // Start on the same day to use remaining capacity
        console.log(`📊 Using remaining capacity of ${remainingCapacity} on ${latestEndDate.toDateString()}`);
      } else {
        // Start the next day
        startDate.setDate(latestEndDate.getDate() + 1);
      }
      
      setSchedulingDialog({
        isOpen: true,
        order: draggedOrder,
        lineId: targetLine,
        startDate: startDate
      });
    }
    
    setPlacementDialog(prev => ({ ...prev, isOpen: false }));
  }, [placementDialog, productionLines, getUsedCapacity]);

  // Enhanced scheduling with "Before" support and capacity optimization
  const handleScheduleConfirm = useCallback(async () => {
    const { order, lineId, startDate } = schedulingDialog;
    
    if (!order || !lineId || !startDate) return;

    const line = productionLines.find(l => l.id === lineId);
    if (!line) return;

    console.log('📅 Scheduling order with enhanced capacity handling');

    // Calculate daily plan with capacity optimization
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);

    while (remainingQty > 0) {
      if (!isHoliday(currentDate)) {
        const availableCapacity = getAvailableCapacity(lineId, currentDate);
        const plannedQty = Math.min(remainingQty, availableCapacity);
        
        if (plannedQty > 0) {
          dailyPlan[currentDate.toISOString().split('T')[0]] = plannedQty;
          remainingQty -= plannedQty;
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Safety check
      if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        console.error('Scheduling took too long, breaking');
        break;
      }
    }

    const planDates = Object.keys(dailyPlan);
    if (planDates.length === 0) {
      console.error('No valid dates found for scheduling');
      return;
    }

    const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
    const updatedOrder = { ...order, assignedLineId: lineId };

    try {
      await onOrderScheduled(updatedOrder, startDate, endDate, dailyPlan);
      
      // FIXED: Handle "Before" placement - reschedule overlapping orders after this one
      if (placementDialog.overlappingOrders.length > 0) {
        console.log('🔄 Rescheduling overlapping orders after "Before" placement');
        
        // Calculate the end date of the newly placed order
        const newOrderEndDate = new Date(endDate);
        newOrderEndDate.setDate(newOrderEndDate.getDate() + 1);
        
        // Reschedule overlapping orders to start after the new order
        for (const overlappingOrder of placementDialog.overlappingOrders) {
          await rescheduleOrderToDate(overlappingOrder, lineId, newOrderEndDate);
          
          // Update the start date for the next order
          const rescheduledEndDate = await getOrderEndDate(overlappingOrder.id);
          if (rescheduledEndDate) {
            newOrderEndDate.setTime(rescheduledEndDate.getTime());
            newOrderEndDate.setDate(newOrderEndDate.getDate() + 1);
          }
        }
      }
      
      setSchedulingDialog(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      console.error('Failed to schedule order:', error);
    }
  }, [schedulingDialog, productionLines, isHoliday, getAvailableCapacity, onOrderScheduled, placementDialog.overlappingOrders]);

  // Helper function to reschedule an order to a specific date
  const rescheduleOrderToDate = useCallback(async (order: Order, lineId: string, startDate: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return;

    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);

    while (remainingQty > 0) {
      if (!isHoliday(currentDate)) {
        const availableCapacity = getAvailableCapacity(lineId, currentDate);
        const plannedQty = Math.min(remainingQty, availableCapacity);
        
        if (plannedQty > 0) {
          dailyPlan[currentDate.toISOString().split('T')[0]] = plannedQty;
          remainingQty -= plannedQty;
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        break;
      }
    }

    const planDates = Object.keys(dailyPlan);
    if (planDates.length > 0) {
      const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
      await onOrderScheduled({ ...order, assignedLineId: lineId }, startDate, endDate, dailyPlan);
    }
  }, [productionLines, isHoliday, getAvailableCapacity, onOrderScheduled]);

  // Helper function to get order end date
  const getOrderEndDate = useCallback(async (orderId: string): Promise<Date | null> => {
    const order = orders.find(o => o.id === orderId);
    return order?.planEndDate ? new Date(order.planEndDate) : null;
  }, [orders]);

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="min-w-max">
        <SchedulerHeader dates={dates} holidays={holidays} />
        
        <SchedulerGrid
          productionLines={productionLines}
          dates={dates}
          orders={orders}
          holidays={holidays}
          onDrop={handleDrop}
          onOrderMovedToPending={onOrderMovedToPending}
          onOrderSplit={onOrderSplit}
          getOrdersForCell={getOrdersForCell}
          getUsedCapacity={getUsedCapacity}
          getAvailableCapacity={getAvailableCapacity}
        />
      </div>

      <PlacementDialog
        isOpen={placementDialog.isOpen}
        draggedOrder={placementDialog.draggedOrder}
        overlappingOrders={placementDialog.overlappingOrders}
        onChoice={handlePlacementChoice}
        onClose={() => setPlacementDialog(prev => ({ ...prev, isOpen: false }))}
      />

      <SchedulingDialog
        isOpen={schedulingDialog.isOpen}
        order={schedulingDialog.order}
        lineId={schedulingDialog.lineId}
        startDate={schedulingDialog.startDate}
        productionLines={productionLines}
        onConfirm={handleScheduleConfirm}
        onClose={() => setSchedulingDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

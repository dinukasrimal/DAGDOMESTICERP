
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Order, ProductionLine, Holiday } from '../../types/scheduler';
import { SchedulerHeader } from './SchedulerHeader';
import { SchedulerGrid } from './SchedulerGrid';
import { PlacementDialog } from './PlacementDialog';
import { MultiSelectManager } from './MultiSelectManager';

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

  // Multi-select state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  // Drag state
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    draggedOrders: Order[];
    draggedFromPending: boolean;
    highlightedCell: string | null;
  }>({
    isDragging: false,
    draggedOrders: [],
    draggedFromPending: false,
    highlightedCell: null
  });

  // Dialog state
  const [placementDialog, setPlacementDialog] = useState<{
    isOpen: boolean;
    draggedOrders: Order[];
    targetLine: string;
    targetDate: Date | null;
    overlappingOrders: Order[];
  }>({
    isOpen: false,
    draggedOrders: [],
    targetLine: '',
    targetDate: null,
    overlappingOrders: []
  });

  const boardRef = useRef<HTMLDivElement>(null);

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

  // Find overlapping orders with magnetic behavior
  const findOverlappingOrders = useCallback((orders: Order[], lineId: string, targetDate: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return [];

    const totalQuantity = orders.reduce((sum, order) => sum + order.orderQuantity, 0);
    const estimatedDays = Math.ceil(totalQuantity / line.capacity);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + estimatedDays - 1);

    return orders.filter(scheduledOrder => 
      scheduledOrder.status === 'scheduled' &&
      scheduledOrder.assignedLineId === lineId &&
      !orders.some(draggedOrder => draggedOrder.id === scheduledOrder.id) &&
      scheduledOrder.planStartDate &&
      scheduledOrder.planEndDate &&
      targetDate <= new Date(scheduledOrder.planEndDate) &&
      endDate >= new Date(scheduledOrder.planStartDate)
    );
  }, [productionLines]);

  // Multi-select handlers
  const handleOrderSelect = useCallback((orderId: string, isSelected: boolean) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(orderId);
      } else {
        newSet.delete(orderId);
      }
      return newSet;
    });
  }, []);

  const handleMultiSelectToggle = useCallback(() => {
    setIsMultiSelectMode(prev => !prev);
    if (isMultiSelectMode) {
      setSelectedOrders(new Set());
    }
  }, [isMultiSelectMode]);

  // Drag handlers for external orders (from pending)
  const handleExternalDrop = useCallback((e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    
    if (isHoliday(date)) {
      console.log('Cannot drop on holiday');
      return;
    }

    try {
      const orderData = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (!orderData?.id || !orderData?.poNumber) return;

      const draggedOrders = [orderData];
      const overlappingOrders = findOverlappingOrders(draggedOrders, lineId, date);
      
      if (overlappingOrders.length > 0) {
        setPlacementDialog({
          isOpen: true,
          draggedOrders,
          targetLine: lineId,
          targetDate: date,
          overlappingOrders
        });
      } else {
        scheduleOrdersDirectly(draggedOrders, lineId, date);
      }
    } catch (error) {
      console.error('Failed to parse dropped order:', error);
    }
  }, [isHoliday, findOverlappingOrders]);

  // Drag handlers for internal orders (within scheduler)
  const handleInternalDragStart = useCallback((orders: Order[]) => {
    setDragState({
      isDragging: true,
      draggedOrders: orders,
      draggedFromPending: false,
      highlightedCell: null
    });
  }, []);

  const handleInternalDrop = useCallback((lineId: string, date: Date) => {
    if (!dragState.isDragging || dragState.draggedOrders.length === 0) return;

    if (isHoliday(date)) {
      console.log('Cannot drop on holiday');
      setDragState(prev => ({ ...prev, isDragging: false, highlightedCell: null }));
      return;
    }

    const overlappingOrders = findOverlappingOrders(dragState.draggedOrders, lineId, date);
    
    if (overlappingOrders.length > 0) {
      setPlacementDialog({
        isOpen: true,
        draggedOrders: dragState.draggedOrders,
        targetLine: lineId,
        targetDate: date,
        overlappingOrders
      });
    } else {
      scheduleOrdersDirectly(dragState.draggedOrders, lineId, date);
    }

    setDragState(prev => ({ ...prev, isDragging: false, highlightedCell: null }));
  }, [dragState, isHoliday, findOverlappingOrders]);

  // Direct scheduling without overlaps
  const scheduleOrdersDirectly = useCallback(async (ordersToSchedule: Order[], lineId: string, startDate: Date) => {
    for (const order of ordersToSchedule) {
      const line = productionLines.find(l => l.id === lineId);
      if (!line) continue;

      const dailyPlan = await calculateDailyPlan(order, line, startDate);
      
      if (Object.keys(dailyPlan).length === 0) {
        console.error('No valid dates found for scheduling');
        continue;
      }

      const planDates = Object.keys(dailyPlan);
      const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
      const updatedOrder = { ...order, assignedLineId: lineId };

      try {
        await onOrderScheduled(updatedOrder, startDate, endDate, dailyPlan);
        
        // Next order starts immediately after this one
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() + 1);
      } catch (error) {
        console.error('Failed to schedule order:', error);
      }
    }
  }, [productionLines, onOrderScheduled]);

  // Calculate daily plan with capacity constraints and remaining capacity allocation
  const calculateDailyPlan = useCallback(async (order: Order, line: ProductionLine, startDate: Date) => {
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);

    while (remainingQty > 0) {
      if (!isHoliday(currentDate)) {
        const availableCapacity = getAvailableCapacity(line.id, currentDate);
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

    return dailyPlan;
  }, [isHoliday, getAvailableCapacity]);

  // Enhanced placement logic with capacity-aware "After" behavior
  const handlePlacementChoice = useCallback(async (placement: 'before' | 'after') => {
    const { draggedOrders, targetLine, targetDate, overlappingOrders } = placementDialog;
    
    if (!draggedOrders.length || !targetDate) return;

    if (placement === 'before') {
      // Place dragged orders BEFORE overlapping orders at the exact target date
      console.log('🔄 Placing orders BEFORE overlapping orders at target date');
      
      // First move overlapping orders to pending to clear space
      for (const order of overlappingOrders) {
        await onOrderMovedToPending(order);
      }
      
      // Schedule dragged orders at the exact target date
      await scheduleOrdersDirectly(draggedOrders, targetLine, targetDate);
      
      // Reschedule overlapping orders after dragged orders with magnetic snapping
      if (overlappingOrders.length > 0) {
        const line = productionLines.find(l => l.id === targetLine);
        if (line) {
          // Calculate when dragged orders end
          const totalDraggedQty = draggedOrders.reduce((sum, order) => sum + order.orderQuantity, 0);
          const draggedDays = Math.ceil(totalDraggedQty / line.capacity);
          const nextAvailableDate = new Date(targetDate);
          nextAvailableDate.setDate(nextAvailableDate.getDate() + draggedDays);
          
          await scheduleOrdersDirectly(overlappingOrders, targetLine, nextAvailableDate);
        }
      }
    } else {
      // Place dragged orders AFTER overlapping orders with capacity-aware allocation
      console.log('🔄 Placing orders AFTER overlapping orders with capacity awareness');
      
      let latestEndDate = overlappingOrders.reduce((latest, order) => {
        const endDate = order.planEndDate ? new Date(order.planEndDate) : latest;
        return endDate > latest ? endDate : latest;
      }, targetDate);
      
      const line = productionLines.find(l => l.id === targetLine);
      if (line) {
        // Check remaining capacity on the last day of overlapping orders
        const lastDayCapacity = getAvailableCapacity(targetLine, latestEndDate);
        
        // Schedule each dragged order with capacity-aware allocation
        for (const order of draggedOrders) {
          let remainingQty = order.orderQuantity;
          let currentDate = new Date(latestEndDate);
          const dailyPlan: { [date: string]: number } = {};
          
          // First, try to fill remaining capacity of the last day
          if (lastDayCapacity > 0 && remainingQty > 0) {
            const allocateToLastDay = Math.min(remainingQty, lastDayCapacity);
            dailyPlan[currentDate.toISOString().split('T')[0]] = allocateToLastDay;
            remainingQty -= allocateToLastDay;
          }
          
          // Then allocate remaining quantity to subsequent days
          if (remainingQty > 0) {
            currentDate.setDate(currentDate.getDate() + 1);
            
            while (remainingQty > 0) {
              if (!isHoliday(currentDate)) {
                const availableCapacity = getAvailableCapacity(targetLine, currentDate);
                const plannedQty = Math.min(remainingQty, availableCapacity);
                
                if (plannedQty > 0) {
                  dailyPlan[currentDate.toISOString().split('T')[0]] = plannedQty;
                  remainingQty -= plannedQty;
                }
              }
              
              currentDate.setDate(currentDate.getDate() + 1);
              
              // Safety check
              if (currentDate.getTime() - latestEndDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
                console.error('Scheduling took too long, breaking');
                break;
              }
            }
          }
          
          if (Object.keys(dailyPlan).length > 0) {
            const planDates = Object.keys(dailyPlan);
            const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
            const updatedOrder = { ...order, assignedLineId: targetLine };
            
            await onOrderScheduled(updatedOrder, latestEndDate, endDate, dailyPlan);
            
            // Update latest end date for next order
            latestEndDate = new Date(endDate);
            latestEndDate.setDate(latestEndDate.getDate() + 1);
          }
        }
      }
    }
    
    setPlacementDialog(prev => ({ ...prev, isOpen: false }));
  }, [placementDialog, onOrderMovedToPending, scheduleOrdersDirectly, productionLines, getAvailableCapacity, onOrderScheduled, isHoliday]);

  // Cell highlighting for drag feedback
  const handleCellHighlight = useCallback((cellKey: string | null) => {
    setDragState(prev => ({ ...prev, highlightedCell: cellKey }));
  }, []);

  return (
    <div ref={boardRef} className="flex-1 overflow-auto bg-background">
      <MultiSelectManager
        isMultiSelectMode={isMultiSelectMode}
        selectedCount={selectedOrders.size}
        onToggleMultiSelect={handleMultiSelectToggle}
        onClearSelection={() => setSelectedOrders(new Set())}
      />
      
      <div className="min-w-max">
        <SchedulerHeader dates={dates} holidays={holidays} />
        
        <SchedulerGrid
          productionLines={productionLines}
          dates={dates}
          orders={orders}
          holidays={holidays}
          selectedOrders={selectedOrders}
          isMultiSelectMode={isMultiSelectMode}
          dragState={dragState}
          onExternalDrop={handleExternalDrop}
          onInternalDragStart={handleInternalDragStart}
          onInternalDrop={handleInternalDrop}
          onOrderSelect={handleOrderSelect}
          onOrderMovedToPending={onOrderMovedToPending}
          onOrderSplit={onOrderSplit}
          onCellHighlight={handleCellHighlight}
          getOrdersForCell={getOrdersForCell}
          getUsedCapacity={getUsedCapacity}
          getAvailableCapacity={getAvailableCapacity}
        />
      </div>

      <PlacementDialog
        isOpen={placementDialog.isOpen}
        draggedOrders={placementDialog.draggedOrders}
        overlappingOrders={placementDialog.overlappingOrders}
        onChoice={handlePlacementChoice}
        onClose={() => setPlacementDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

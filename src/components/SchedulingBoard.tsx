
import React, { useState, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Order } from '../types/scheduler';
import { Card, CardContent } from './ui/card';
import { format } from 'date-fns';
import { CapacityPlanningDialog } from './CapacityPlanningDialog';

interface ProductionLine {
  id: string;
  name: string;
  capacity: number;
}

interface Holiday {
  id: string;
  date: Date;
  name: string;
  isGlobal: boolean;
  affectedLineIds?: string[];
}

interface RampUpPlan {
  id: string;
  lineId: string;
  startDate: Date;
  endDate: Date;
  capacity: number;
}

interface SchedulingBoardProps {
  orders: Order[];
  productionLines: ProductionLine[];
  holidays: Holiday[];
  rampUpPlans: RampUpPlan[];
  onOrderScheduled: (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => Promise<void>;
  onOrderMovedToPending: (order: Order) => Promise<void>;
  onOrderSplit: (orderId: string, splitQuantity: number) => Promise<void>;
}

export const SchedulingBoard: React.FC<SchedulingBoardProps> = ({
  orders,
  productionLines,
  holidays,
  rampUpPlans,
  onOrderScheduled,
  onOrderMovedToPending,
  onOrderSplit
}) => {
  const [capacityPlanningDialog, setCapacityPlanningDialog] = useState<{
    isOpen: boolean;
    order?: Order;
    line?: ProductionLine;
    startDate?: Date;
    endDate?: Date;
    dailyPlan?: { [date: string]: number };
    onConfirm?: () => void;
    onCancel?: () => void;
    overlappingOrders?: string[];
  }>({
    isOpen: false,
  });

  const getOrdersForLine = (lineId: string): Order[] => {
    return orders.filter(order => order.assignedLineId === lineId && order.status === 'scheduled');
  };

  const getRemainingCapacityForDate = useCallback((date: Date, lineId: string): number => {
    const dateString = date.toISOString().split('T')[0];
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return 0;
  
    // Get the line's capacity for the given date
    let capacity = line.capacity;
  
    // Adjust for ramp-up plans
    const rampUpPlan = rampUpPlans.find(plan =>
      plan.lineId === lineId &&
      date >= plan.startDate &&
      date <= plan.endDate
    );
  
    if (rampUpPlan) {
      capacity = rampUpPlan.capacity;
    }
  
    // Subtract any scheduled production on that line for that date
    let scheduledQuantity = 0;
    orders.forEach(order => {
      if (order.assignedLineId === lineId && order.actualProduction && order.status === 'scheduled') {
        scheduledQuantity += order.actualProduction[dateString] || 0;
      }
    });
  
    return capacity - scheduledQuantity;
  }, [orders, productionLines, rampUpPlans]);

  const calculateProductionPlan = useCallback(async (
    order: Order,
    line: ProductionLine,
    startDate: Date,
    initialQuantity: number = 0
  ) => {
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity - initialQuantity;
    let currentDate = new Date(startDate);
    
    // If we have initial quantity for the start date, add it
    if (initialQuantity > 0) {
      dailyPlan[currentDate.toISOString().split('T')[0]] = initialQuantity;
    }
    
    // If we started with initial quantity, move to next day for remaining
    if (initialQuantity > 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    while (remainingQty > 0) {
      // Check if current date is a holiday
      const isHoliday = holidays.some(h => 
        h.date.toDateString() === currentDate.toDateString()
      );
      
      if (!isHoliday) {
        // Get remaining capacity for this date on this line
        const remainingCapacity = getRemainingCapacityForDate(currentDate, line.id);
        const plannedQty = Math.min(remainingQty, remainingCapacity);
        
        if (plannedQty > 0) {
          const dateKey = currentDate.toISOString().split('T')[0];
          dailyPlan[dateKey] = (dailyPlan[dateKey] || 0) + plannedQty;
          remainingQty -= plannedQty;
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Safety check to prevent infinite loops
      if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        console.warn('Production planning exceeded 1 year, breaking loop');
        break;
      }
    }
    
    // Calculate end date
    const planDates = Object.keys(dailyPlan);
    const endDate = planDates.length > 0 
      ? new Date(Math.max(...planDates.map(d => new Date(d).getTime())))
      : startDate;
    
    return { dailyPlan, endDate };
  }, [holidays, getRemainingCapacityForDate]);

  const scheduleOrderAtDate = useCallback(async (
    order: Order,
    targetDate: Date,
    lineId: string,
    placement: 'before' | 'after' = 'before'
  ) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return;

    console.log(`📋 Scheduling order: ${order.poNumber} on line: ${lineId} date: ${targetDate.toDateString()} placement: ${placement}`);

    // Find overlapping orders on the same line at target date
    const overlappingOrders = orders.filter(o => 
      o.status === 'scheduled' &&
      o.assignedLineId === lineId &&
      o.id !== order.id &&
      o.planStartDate && o.planEndDate &&
      targetDate >= o.planStartDate && targetDate <= o.planEndDate
    );

    if (overlappingOrders.length > 0 && placement === 'before') {
      console.log(`📋 Moving ${overlappingOrders.length} orders for before placement`);
      
      // First, schedule the new order at the exact target date
      console.log(`📅 Scheduling new order ${order.poNumber} first at target date`);
      
      // Calculate production plan for the new order starting at target date
      const { dailyPlan, endDate } = await calculateProductionPlan(order, line, targetDate);
      
      // Show capacity planning dialog first
      const shouldProceed = await new Promise<boolean>((resolve) => {
        setCapacityPlanningDialog({
          isOpen: true,
          order,
          line,
          startDate: targetDate,
          endDate,
          dailyPlan,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
          overlappingOrders: overlappingOrders.map(o => o.poNumber)
        });
      });

      if (!shouldProceed) return;

      // Schedule the new order first
      await onOrderScheduled(
        { ...order, assignedLineId: lineId },
        targetDate,
        endDate,
        dailyPlan
      );

      // Now move overlapping orders magnetically backward
      console.log(`🔄 Now moving ${overlappingOrders.length} overlapping orders magnetically backward`);
      
      // Calculate where the first overlapping order should start (day after new order ends)
      const nextAvailableDate = new Date(endDate);
      nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
      
      // Move overlapping orders to pending first
      for (const overlapping of overlappingOrders) {
        console.log(`  - Moving ${overlapping.poNumber} to pending`);
        await onOrderMovedToPending(overlapping);
      }

      // Then reschedule them magnetically starting from next available date
      console.log(`🧲 Starting magnetic rescheduling of ${overlappingOrders.length} orders`);
      let currentStartDate = new Date(nextAvailableDate);
      
      for (const overlapping of overlappingOrders) {
        console.log(`🔄 Magnetically rescheduling ${overlapping.poNumber} to start ${currentStartDate.toDateString()}`);
        
        // Calculate new production plan for overlapping order
        const { dailyPlan: newDailyPlan, endDate: newEndDate } = await calculateProductionPlan(
          overlapping, 
          line, 
          currentStartDate
        );
        
        // Schedule the overlapping order
        await onOrderScheduled(
          { ...overlapping, assignedLineId: lineId },
          currentStartDate,
          newEndDate,
          newDailyPlan
        );
        
        // Next order starts the day after this one ends
        currentStartDate = new Date(newEndDate);
        currentStartDate.setDate(currentStartDate.getDate() + 1);
      }
      
      console.log(`✅ Magnetic rescheduling completed`);
      
    } else if (overlappingOrders.length > 0 && placement === 'after') {
      // For 'after' placement, find the end date of the last overlapping order
      const lastOverlappingOrder = overlappingOrders.reduce((latest, current) => 
        (current.planEndDate && latest.planEndDate && current.planEndDate > latest.planEndDate) ? current : latest
      );
      
      if (lastOverlappingOrder.planEndDate) {
        const newStartDate = new Date(lastOverlappingOrder.planEndDate);
        newStartDate.setDate(newStartDate.getDate() + 1);
        
        console.log(`📅 Scheduling after existing orders, starting ${newStartDate.toDateString()}`);
        
        // Check for remaining capacity on the last day
        const lastDayCapacity = getRemainingCapacityForDate(lastOverlappingOrder.planEndDate, lineId);
        let adjustedStartDate = newStartDate;
        let initialQuantity = 0;
        
        if (lastDayCapacity > 0) {
          // Start on the same day to fill remaining capacity
          adjustedStartDate = new Date(lastOverlappingOrder.planEndDate);
          initialQuantity = Math.min(lastDayCapacity, order.orderQuantity);
        }
        
        const { dailyPlan, endDate } = await calculateProductionPlan(
          order, 
          line, 
          adjustedStartDate, 
          initialQuantity
        );
        
        // Show capacity planning dialog
        const shouldProceed = await new Promise<boolean>((resolve) => {
          setCapacityPlanningDialog({
            isOpen: true,
            order,
            line,
            startDate: adjustedStartDate,
            endDate,
            dailyPlan,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
          });
        });

        if (!shouldProceed) return;

        await onOrderScheduled(
          { ...order, assignedLineId: lineId },
          adjustedStartDate,
          endDate,
          dailyPlan
        );
      }
    } else {
      // No overlapping orders, schedule normally at target date
      console.log(`📅 No overlaps, scheduling at target date: ${targetDate.toDateString()}`);
      
      const { dailyPlan, endDate } = await calculateProductionPlan(order, line, targetDate);
      
      // Show capacity planning dialog
      const shouldProceed = await new Promise<boolean>((resolve) => {
        setCapacityPlanningDialog({
          isOpen: true,
          order,
          line,
          startDate: targetDate,
          endDate,
          dailyPlan,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false)
        });
      });

      if (!shouldProceed) return;

      await onOrderScheduled(
        { ...order, assignedLineId: lineId },
        targetDate,
        endDate,
        dailyPlan
      );
    }
  }, [orders, productionLines, onOrderScheduled, onOrderMovedToPending, calculateProductionPlan, getRemainingCapacityForDate]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const order = orders.find(order => order.id === draggableId);
    if (!order) {
      return;
    }

    const sourceLineId = source.droppableId;
    const destLineId = destination.droppableId;

    // Moving to pending
    if (destLineId === 'pending-orders') {
      await onOrderMovedToPending(order);
      return;
    }

    // Moving within the same line
    if (sourceLineId === destLineId) {
      return; // Reordering logic can be added here if needed
    }

    // Moving to a new line
    const targetDate = getDateForColumn(destination.index);
    if (!targetDate) {
      return;
    }

    await scheduleOrderAtDate(order, targetDate, destLineId, 'before');
  };

  const getDateForColumn = (columnIndex: number): Date | null => {
    const startDate = new Date(); // Today's date
    startDate.setDate(startDate.getDate() + columnIndex);
    return startDate;
  };

  const getColumnHeader = (columnIndex: number): string => {
    const date = getDateForColumn(columnIndex);
    return date ? format(date, 'MMM d') : '';
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <CapacityPlanningDialog
        isOpen={capacityPlanningDialog.isOpen}
        order={capacityPlanningDialog.order}
        line={capacityPlanningDialog.line}
        startDate={capacityPlanningDialog.startDate}
        endDate={capacityPlanningDialog.endDate}
        dailyPlan={capacityPlanningDialog.dailyPlan}
        onConfirm={() => {
          capacityPlanningDialog.onConfirm?.();
          setCapacityPlanningDialog({ ...capacityPlanningDialog, isOpen: false });
        }}
        onCancel={() => {
          capacityPlanningDialog.onCancel?.();
          setCapacityPlanningDialog({ ...capacityPlanningDialog, isOpen: false });
        }}
        overlappingOrders={capacityPlanningDialog.overlappingOrders}
      />
      <div className="flex">
        {productionLines.map(line => (
          <div key={line.id} className="w-64 mx-2">
            <h2 className="text-lg font-semibold mb-2">{line.name}</h2>
            <Droppable droppableId={line.id}>
              {(provided, snapshot) => (
                <Card
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`bg-card rounded-md shadow-md p-2 min-h-[400px] ${snapshot.isDraggingOver ? 'bg-card/50' : ''}`}
                >
                  <CardContent className="p-2">
                    {getOrdersForLine(line.id).map((order, index) => (
                      <Draggable key={order.id} draggableId={order.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-secondary text-secondary-foreground rounded-md shadow-sm p-2 mb-2 ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                          >
                            {order.poNumber} (Qty: {order.orderQuantity})
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </CardContent>
                </Card>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
};

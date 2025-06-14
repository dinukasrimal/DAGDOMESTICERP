import React, { useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { CalendarDays, Plus, ArrowLeft, Scissors, GripVertical } from 'lucide-react';
import { OverlapConfirmationDialog } from './OverlapConfirmationDialog';

interface SchedulingBoardProps {
  orders: Order[];
  productionLines: ProductionLine[];
  holidays: Holiday[];
  rampUpPlans: RampUpPlan[];
  onOrderScheduled: (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => Promise<void>;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
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
  const [scheduleDialog, setScheduleDialog] = useState<{
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
  
  const [overlapDialog, setOverlapDialog] = useState<{
    isOpen: boolean;
    newOrder: Order | null;
    overlappingOrders: Order[];
    targetDate: Date | null;
    targetLine: string;
    originalTargetDate: Date | null;
  }>({
    isOpen: false,
    newOrder: null,
    overlappingOrders: [],
    targetDate: null,
    targetLine: '',
    originalTargetDate: null
  });
  
  const [planningMethod, setPlanningMethod] = useState<'capacity' | 'rampup'>('capacity');
  const [selectedRampUpPlanId, setSelectedRampUpPlanId] = useState<string>('');
  const [dragHighlight, setDragHighlight] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  // Generate date range (next 30 days)
  const dates = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return date;
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

  const calculateTotalUtilization = useCallback((lineId: string, date: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return 0;
    
    const dateStr = date.toISOString().split('T')[0];
    const ordersInCell = getOrdersForCell(lineId, date);
    const totalPlanned = ordersInCell.reduce((sum, order) => 
      sum + (order.actualProduction?.[dateStr] || 0), 0
    );
    
    return Math.min((totalPlanned / line.capacity) * 100, 100);
  }, [productionLines, getOrdersForCell]);

  const getAvailableCapacity = useCallback((lineId: string, date: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return 0;
    
    const dateStr = date.toISOString().split('T')[0];
    const ordersInCell = getOrdersForCell(lineId, date);
    const totalUsed = ordersInCell.reduce((sum, order) => 
      sum + (order.actualProduction?.[dateStr] || 0), 0
    );
    
    return Math.max(0, line.capacity - totalUsed);
  }, [productionLines, getOrdersForCell]);

  // --- OVERLAP: Helper to get all affected orders for overlap
  const getOverlappingOrders = useCallback((order: Order, lineId: string, date: Date) => {
    const line = productionLines.find(l => l.id === lineId); if (!line) return [];
    const dailyCapacity = line.capacity;
    const totalDays = Math.ceil(order.orderQuantity / dailyCapacity);
    const overlappingOrders: Order[] = [];
    const newOrderEndDate = new Date(date); newOrderEndDate.setDate(newOrderEndDate.getDate() + totalDays - 1);
    orders.forEach(existing => {
      if (existing.status === 'scheduled' &&
          existing.assignedLineId === lineId &&
          existing.id !== order.id &&
          existing.planStartDate && existing.planEndDate) {
        const existingStart = new Date(existing.planStartDate);
        const existingEnd = new Date(existing.planEndDate);
        if (date <= existingEnd && newOrderEndDate >= existingStart) {
          overlappingOrders.push(existing);
        }
      }
    });
    return overlappingOrders;
  }, [orders, productionLines]);

  // Helper for daily production (same, but can be improved by extracting to smaller file in the future)
  const calculateDailyProductionWithSharing = useCallback((order: Order, line: ProductionLine, startDate: Date) => {
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);
    let workingDayNumber = 1;

    const rampUpPlan = rampUpPlans.find(p => p.id === selectedRampUpPlanId);

    while (remainingQty > 0) {
      const isWorkingDay = !isHoliday(currentDate);
      
      if (isWorkingDay) {
        const availableCapacity = getAvailableCapacity(line.id, currentDate);
        
        let dailyCapacity = 0;
        
        if (planningMethod === 'capacity') {
          dailyCapacity = Math.min(availableCapacity, line.capacity);
        } else if (planningMethod === 'rampup' && rampUpPlan) {
          const baseCapacity = (540 * order.moCount) / order.smv;
          let efficiency = rampUpPlan.finalEfficiency;
          
          const rampUpDay = rampUpPlan.efficiencies.find(e => e.day === workingDayNumber);
          if (rampUpDay) {
            efficiency = rampUpDay.efficiency;
          }
          
          const calculatedCapacity = Math.floor((baseCapacity * efficiency) / 100);
          dailyCapacity = Math.min(availableCapacity, calculatedCapacity);
        }

        const plannedQty = Math.min(remainingQty, dailyCapacity);
        if (plannedQty > 0) {
          dailyPlan[currentDate.toISOString().split('T')[0]] = plannedQty;
          remainingQty -= plannedQty;
        }
        workingDayNumber++;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        break;
      }
    }

    return dailyPlan;
  }, [isHoliday, planningMethod, selectedRampUpPlanId, rampUpPlans, getAvailableCapacity]);

  // Multi-select functionality
  const handleOrderClick = useCallback((e: React.MouseEvent, orderId: string) => {
    if (e.ctrlKey || e.metaKey) {
      setIsMultiSelectMode(true);
      setSelectedOrders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(orderId)) {
          newSet.delete(orderId);
        } else {
          newSet.add(orderId);
        }
        return newSet;
      });
    } else if (!selectedOrders.has(orderId)) {
      setSelectedOrders(new Set());
      setIsMultiSelectMode(false);
    }
  }, [selectedOrders]);

  // PATCHED: Create a helper function for scheduling an order as a solid, contiguous block across working days
  const getContiguousProductionPlan = (
    qty: number,
    lineCapacity: number,
    startDate: Date,
    isHolidayFn: (d: Date) => boolean,
    fillFirstDay: number = 0 // left for multi-order move edge cases
  ) => {
    const plan: { [date: string]: number } = {};
    let remainingQty = qty;
    let currentDate = new Date(startDate);
    let placedFirstDay = false;

    while (remainingQty > 0) {
      if (!isHolidayFn(currentDate)) {
        const dayStr = currentDate.toISOString().split('T')[0];
        let todayCapacity = lineCapacity;
        if (!placedFirstDay && fillFirstDay > 0) {
          todayCapacity = fillFirstDay;
          placedFirstDay = true;
        }
        const planned = Math.min(remainingQty, todayCapacity);
        if (planned > 0) {
          plan[dayStr] = planned;
          remainingQty -= planned;
        }
      }
      // Only increment to next day (contiguous) regardless unless it's a holiday:
      currentDate.setDate(currentDate.getDate() + 1);
      // To prevent infinite loops
      if (Object.keys(plan).length > 366) break;
    }
    return plan;
  };

  // Helper to find index/date for an order within a line
  const findFirstPlannedDate = useCallback((order: Order) => {
    if (!order.actualProduction) return null;
    const allDates = Object.keys(order.actualProduction).filter(d => order.actualProduction[d] > 0);
    if (allDates.length === 0) return null;
    return new Date(allDates.sort()[0]);
  }, []);
  
  // Helper to get lineId for scheduled order
  const getLineIdForOrder = useCallback((order: Order) => {
    return order.assignedLineId || null;
  }, []);
  
  // -- PATCH: Drag End with Inline Plan Recalc --
  const handleOrderDragEnd = useCallback(
    async (e: React.DragEvent) => {
      // Restore opacity
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '1';
      }
      // (Leave multi-select/selection reset as-is)
      setSelectedOrders(new Set());
      setIsMultiSelectMode(false);

      // Only adjust if this was an intra-line move where order's block is now on a different date
      try {
        const orderData = JSON.parse(e.dataTransfer.getData('text/plain'));
        const draggedOrder: Order = orderData;
        const origLineId = getLineIdForOrder(draggedOrder);
        if (!origLineId) return;
        // Only apply if the drag ended up in another production cell with a new date.
        // (Otherwise, do nothing extra.)
        // We'll handle onDrop as source of truth for startDate, so don't replan here.

        // (No-op: schedule is done onDrop; code left here for future expansion.)

      } catch (err) {
        // Silently ignore, fallback to regular dragEnd logic
      }
    },
    [setSelectedOrders, setIsMultiSelectMode, getLineIdForOrder]
  );

  // -- PATCH: Use getContiguousProductionPlan for all inline moves --
  // Update handleDrop: always schedule the moved order(s) as a solid block contiguous from the new start date, skipping holidays.

  const handleDrop = useCallback((e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault(); setDragHighlight(null);
    if (isHoliday(date)) return;
    try {
      const orderData = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (orderData && orderData.id && orderData.poNumber) {
        const overlappingOrders = getOverlappingOrders(orderData, lineId, date);
        const lineName = productionLines.find(l => l.id === lineId)?.name || 'Unknown Line';
        if (overlappingOrders.length > 0) {
          setOverlapDialog({
            isOpen: true,
            newOrder: orderData,
            overlappingOrders,
            targetDate: date,
            targetLine: lineName,
            originalTargetDate: date
          });
        } else {
          // PATCH: Always recalculate solid contiguous plan for dropped order!
          (async () => {
            const movedOrder: Order = orderData;
            const selectedLine = productionLines.find(l => l.id === lineId);
            if (!selectedLine) return;
            // We'll use a contiguous plan (capacity mode) for the drop.
            const dailyPlan = getContiguousProductionPlan(
              movedOrder.orderQuantity,
              selectedLine.capacity,
              date,
              isHoliday
            );
            const planDates = Object.keys(dailyPlan);
            const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
            const updatedOrder = { ...movedOrder, assignedLineId: lineId };
            await onOrderScheduled(updatedOrder, date, endDate, dailyPlan);
          })();
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse dropped order data:', error);
    }
  }, [isHoliday, getOverlappingOrders, productionLines, onOrderScheduled, setOverlapDialog, setDragHighlight, getContiguousProductionPlan]);

  // --- Drag & Drop ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    if (!isHoliday(date)) {
      setDragHighlight(`${lineId}-${date.toISOString().split('T')[0]}`);
    }
  }, [isHoliday]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragHighlight(null);
    }
  }, []);

  // --- Revised "before" Overlap Handling Workflow ---
  // 1. onConfirm(before): move all overlapping orders to pending, only schedule the new order first.
  // 2. Once that schedule completes, THEN schedule previous overlappers after new planEndDate.
  // This requires tracking what needs to be scheduled next after current dialog closes!
  const [pendingReschedule, setPendingReschedule] = useState<{
    toSchedule: Order[];
    afterOrderId: string | null;
    lineId: string | null;
  }>({ toSchedule: [], afterOrderId: null, lineId: null });

  // --- Handle Overlap Confirm ---
  const handleOverlapConfirm = useCallback(async (placement: 'before' | 'after') => {
    const { newOrder, overlappingOrders, targetDate, targetLine, originalTargetDate } = overlapDialog;
    if (!newOrder || !targetDate || !originalTargetDate) return;
    const lineId = productionLines.find(l => l.name === targetLine)?.id;
    if (!lineId) return;

    if (placement === 'before') {
      // Step 1: move all overlappers to pending
      for (const order of overlappingOrders) { await onOrderMovedToPending(order); }
      // Step 2: just schedule the newOrder at originalTargetDate
      setScheduleDialog({
        isOpen: true,
        order: newOrder,
        lineId,
        startDate: originalTargetDate // this is the "before" drop date!
      });
      // Step 3: queue up magnetically rescheduling the overlappers after newOrder
      setPendingReschedule({ toSchedule: overlappingOrders, afterOrderId: newOrder.id, lineId });
    } else {
      // "After" logic: move new order after overlappers' latest end date
      let latestEnd: Date | null = targetDate;
      overlappingOrders.forEach(o => o.planEndDate && o.planEndDate > latestEnd! && (latestEnd = new Date(o.planEndDate)));
      let nextStart = new Date(latestEnd!); nextStart.setDate(nextStart.getDate() + 1);
      setScheduleDialog({
        isOpen: true,
        order: newOrder,
        lineId,
        startDate: nextStart
      });
      setPendingReschedule({ toSchedule: [], afterOrderId: null, lineId: null }); // no post-hook
    }
    setOverlapDialog({
      isOpen: false,
      newOrder: null,
      overlappingOrders: [],
      targetDate: null,
      targetLine: '',
      originalTargetDate: null
    });
  }, [overlapDialog, productionLines, onOrderMovedToPending]);

  // --- When the scheduleDialog is confirmed, carry out any queued magnetic rescheduling ---

  const handleScheduleConfirm = useCallback(async () => {
    const { order, lineId, startDate } = scheduleDialog;
    if (!order || !lineId || !startDate) return;
    const selectedLine = productionLines.find(l => l.id === lineId); if (!selectedLine) return;
    if (planningMethod === 'rampup' && !selectedRampUpPlanId) return;
    try {
      // Use the solid block planning logic for single and multi-order
      let dailyPlan: { [date: string]: number };
      if (planningMethod === 'capacity') {
        dailyPlan = getContiguousProductionPlan(
          order.orderQuantity,
          selectedLine.capacity,
          startDate,
          isHoliday
        );
      } else {
        dailyPlan = calculateDailyProductionWithSharing(order, selectedLine, startDate);
      }
      const planDates = Object.keys(dailyPlan);
      const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
      const updatedOrder = { ...order, assignedLineId: lineId };
      await onOrderScheduled(updatedOrder, startDate, endDate, dailyPlan);
      setScheduleDialog({ isOpen: false, order: null, lineId: '', startDate: null });
      setPlanningMethod('capacity'); setSelectedRampUpPlanId('');
      
      // PATCH: For pending reschedules (after moving orders "before"), also solid block AND max utilization on first available day
      if (
        pendingReschedule.toSchedule.length > 0 &&
        pendingReschedule.afterOrderId === order.id &&
        pendingReschedule.lineId
      ) {
        let newPlanEnd: Date | null = endDate;
        let magnetDate = new Date(newPlanEnd); // Start on newOrder's last day
        const newOrderLastDayStr = magnetDate.toISOString().split('T')[0];
        const lineObj = productionLines.find(l => l.id === pendingReschedule.lineId);
        let lastDayAvailCapacity =
          lineObj && typeof dailyPlan[newOrderLastDayStr] === "number"
            ? Math.max(0, lineObj.capacity - dailyPlan[newOrderLastDayStr])
            : 0;

        for (const [i, next] of pendingReschedule.toSchedule.entries()) {
          if (!lineObj) continue;

          let qty = next.orderQuantity;
          let plan: { [date: string]: number } = {};

          if (i === 0 && lastDayAvailCapacity > 0) {
            // PATCH: Use last available capacity on the shared last production day!
            let firstDayPlannedQty = Math.min(qty, lastDayAvailCapacity);
            if (firstDayPlannedQty > 0) {
              plan[newOrderLastDayStr] = firstDayPlannedQty;
              qty -= firstDayPlannedQty;
            }
            // continue block contiguously from next day
            // We need to get a proper "next working day" after last used day
            let nextDayDate = new Date(magnetDate);
            nextDayDate.setDate(magnetDate.getDate() + 1);
            // Use normal planning for the remaining quantity, skipping holidays
            let restPlan = getContiguousProductionPlan(
              qty,
              lineObj.capacity,
              nextDayDate,
              (d) => holidays.some(h => h.date.toDateString() === d.toDateString()),
              0
            );
            plan = { ...plan, ...restPlan };
          } else {
            // Not the first order, or no leftover capacity
            let anchorNextDay = new Date(magnetDate);
            if (!(i === 0 && lastDayAvailCapacity > 0)) {
              anchorNextDay.setDate(anchorNextDay.getDate() + 1);
            }
            plan = getContiguousProductionPlan(
              qty,
              lineObj.capacity,
              anchorNextDay,
              (d) => holidays.some(h => h.date.toDateString() === d.toDateString()),
              0
            );
          }

          const planDays = Object.keys(plan);
          const firstPlanDay = planDays.length > 0 ? new Date(planDays[0]) : new Date(magnetDate);
          const lastPlanDay = planDays.length > 0 ? new Date(planDays[planDays.length - 1]) : new Date(magnetDate);
          const nextOrder = { ...next, assignedLineId: lineObj.id };
          await onOrderScheduled(nextOrder, firstPlanDay, lastPlanDay, plan);
          magnetDate = new Date(lastPlanDay);
        }
        setPendingReschedule({ toSchedule: [], afterOrderId: null, lineId: null });
      }
    } catch (error) {
      console.error('❌ Failed to schedule order:', error);
    }
  }, [
    scheduleDialog, productionLines, planningMethod, selectedRampUpPlanId,
    calculateDailyProductionWithSharing, onOrderScheduled, pendingReschedule, holidays, getContiguousProductionPlan, isHoliday
  ]);
  
  const handleDialogClose = useCallback(() => {
    setScheduleDialog({ isOpen: false, order: null, lineId: '', startDate: null });
    setPlanningMethod('capacity');
    setSelectedRampUpPlanId('');
  }, []);

  const handleOrderDragStart = useCallback((e: React.DragEvent, order: Order) => {
    console.log('🔄 Starting drag for scheduled order:', order.poNumber);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(order));
    
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  // Helper function to check if order should be highlighted in red
  const shouldHighlightRed = useCallback((order: Order, date: Date) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    const isCurrentWeek = order.planStartDate && 
                         order.planStartDate >= startOfWeek && 
                         order.planStartDate <= endOfWeek;
    
    return order.cutQuantity === 0 && 
           isCurrentWeek &&
           order.planStartDate &&
           date.toDateString() === order.planStartDate.toDateString();
  }, []);

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* Multi-select info bar */}
      {isMultiSelectMode && selectedOrders.size > 0 && (
        <div className="sticky top-0 z-20 bg-blue-100 border-b border-blue-300 p-2 text-center">
          <span className="text-blue-800 font-medium">
            {selectedOrders.size} orders selected - Drag to move together
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-2 text-blue-800"
            onClick={() => {
              setSelectedOrders(new Set());
              setIsMultiSelectMode(false);
            }}
          >
            Clear Selection
          </Button>
        </div>
      )}

      <div className="min-w-max">
        {/* Header with dates */}
        <div className="sticky top-0 z-10 bg-card border-b border-border">
          <div className="flex">
            <div className="w-48 p-4 border-r border-border bg-card">
              <div className="flex items-center space-x-2">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Production Lines</span>
              </div>
            </div>
            {dates.map((date) => (
              <div
                key={date.toISOString()}
                className={`w-32 p-2 border-r border-border text-center ${
                  isHoliday(date) ? 'bg-muted' : 'bg-card'
                }`}
              >
                <div className="text-xs font-medium">
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="text-sm">
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                {isHoliday(date) && (
                  <div className="text-xs text-destructive">Holiday</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Production lines grid */}
        <div className="divide-y divide-border">
          {productionLines.map((line) => (
            <div key={line.id} className="flex">
              <div className="w-48 p-4 border-r border-border bg-card">
                <div className="font-medium">{line.name}</div>
                <div className="text-sm text-muted-foreground">
                  Capacity: {line.capacity}
                </div>
              </div>
              {dates.map((date) => {
                const cellKey = `${line.id}-${date.toISOString().split('T')[0]}`;
                const isHighlighted = dragHighlight === cellKey;
                const utilizationPercent = calculateTotalUtilization(line.id, date);
                const ordersInCell = getOrdersForCell(line.id, date);
                const isHolidayCell = isHoliday(date);
                const availableCapacity = getAvailableCapacity(line.id, date);
                
                return (
                  <div
                    key={cellKey}
                    className={`w-32 min-h-[120px] border-r border-border relative transition-all duration-200 ${
                      isHolidayCell 
                        ? 'bg-muted/50' 
                        : isHighlighted 
                          ? 'bg-primary/20 border-primary border-2' 
                          : 'bg-background hover:bg-muted/20'
                    }`}
                    onDrop={(e) => handleDrop(e, line.id, date)}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, line.id, date)}
                    onDragLeave={handleDragLeave}
                  >
                    {/* Capacity utilization bar */}
                    {utilizationPercent > 0 && !isHolidayCell && (
                      <div 
                        className="absolute bottom-0 left-0 right-0 bg-primary/30 transition-all duration-300"
                        style={{ height: `${Math.min(utilizationPercent, 100)}%` }}
                      />
                    )}
                    
                    {/* Drop zone indicator */}
                    {!isHolidayCell && ordersInCell.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* Available capacity indicator */}
                    {!isHolidayCell && availableCapacity > 0 && ordersInCell.length > 0 && (
                      <div className="absolute top-1 right-1 text-xs bg-green-100 text-green-800 px-1 rounded">
                        {availableCapacity}
                      </div>
                    )}
                    
                    {/* Drag highlight indicator */}
                    {isHighlighted && !isHolidayCell && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/10 border-2 border-primary border-dashed rounded">
                        <div className="text-xs font-medium text-primary bg-background px-2 py-1 rounded shadow">
                          Drop Here
                        </div>
                      </div>
                    )}
                    
                    {/* Orders in cell */}
                    <div className="p-1 space-y-1 relative z-10 h-full flex flex-col">
                      {ordersInCell.map((scheduledOrder, index) => {
                        const dateStr = date.toISOString().split('T')[0];
                        const dailyQty = scheduledOrder.actualProduction?.[dateStr] || 0;
                        const shouldHighlight = shouldHighlightRed(scheduledOrder, date);
                        const orderUtilization = (dailyQty / line.capacity) * 100;
                        const isSelected = selectedOrders.has(scheduledOrder.id);
                        
                        return (
                          <div 
                            key={`${scheduledOrder.id}-${dateStr}`}
                            className={`rounded text-xs p-1 group cursor-move transition-colors flex-1 min-h-[60px] ${
                              isSelected 
                                ? 'ring-2 ring-blue-500 bg-blue-50' 
                                : shouldHighlight 
                                  ? 'bg-red-100 border-2 border-red-500 text-red-800' 
                                  : index % 2 === 0
                                    ? 'bg-blue-100 border border-blue-300 text-blue-800'
                                    : 'bg-green-100 border border-green-300 text-green-800'
                            }`}
                            draggable
                            onDragStart={(e) => handleOrderDragStart(e, scheduledOrder)}
                            onDragEnd={handleOrderDragEnd}
                            onClick={(e) => handleOrderClick(e, scheduledOrder.id)}
                            style={{ 
                              height: `${Math.max(orderUtilization, 20)}%`,
                              minHeight: '60px'
                            }}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center space-x-1">
                                <GripVertical className="h-3 w-3 opacity-60" />
                                <span className="truncate font-medium text-xs">{scheduledOrder.poNumber}</span>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 flex space-x-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-4 w-4 p-0 hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOrderMovedToPending(scheduledOrder);
                                  }}
                                  title="Move back to pending"
                                >
                                  <ArrowLeft className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-4 w-4 p-0 hover:bg-secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOrderSplit(scheduledOrder.id, Math.floor(scheduledOrder.orderQuantity / 2));
                                  }}
                                  title="Split order"
                                >
                                  <Scissors className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="text-xs opacity-75 truncate mb-1">
                              Style: {scheduledOrder.styleId}
                            </div>
                            <div className="text-xs opacity-75 mb-1">
                              Qty: {dailyQty.toLocaleString()}
                            </div>
                            <div className="text-xs opacity-75 mb-1">
                              Cut: {scheduledOrder.cutQuantity.toLocaleString()}
                            </div>
                            <div className="text-xs opacity-75 mb-1">
                              Issue: {scheduledOrder.issueQuantity.toLocaleString()}
                            </div>
                            <div className="text-xs opacity-75">
                              {orderUtilization.toFixed(1)}% used
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialog.isOpen} onOpenChange={(open) => !open && handleDialogClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Order</DialogTitle>
          </DialogHeader>
          {scheduleDialog.order && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded">
                <h3 className="font-medium">{scheduleDialog.order.poNumber}</h3>
                <p className="text-sm text-muted-foreground">
                  Style: {scheduleDialog.order.styleId}
                </p>
                <p className="text-sm text-muted-foreground">
                  Quantity: {scheduleDialog.order.orderQuantity.toLocaleString()} | SMV: {scheduleDialog.order.smv} | MO: {scheduleDialog.order.moCount}
                </p>
                <p className="text-sm text-muted-foreground">
                  Cut: {scheduleDialog.order.cutQuantity.toLocaleString()} | Issue: {scheduleDialog.order.issueQuantity.toLocaleString()}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="font-medium">Start Date:</label>
                  <div>{scheduleDialog.startDate?.toLocaleDateString()}</div>
                </div>
                <div>
                  <label className="font-medium">Production Line:</label>
                  <div>{productionLines.find(l => l.id === scheduleDialog.lineId)?.name}</div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Planning Method:</label>
                <RadioGroup value={planningMethod} onValueChange={(value: 'capacity' | 'rampup') => setPlanningMethod(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="capacity" id="capacity" />
                    <Label htmlFor="capacity">Based on Line Capacity</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="rampup" id="rampup" />
                    <Label htmlFor="rampup">Based on Ramp-Up Plan</Label>
                  </div>
                </RadioGroup>
              </div>
              
              {planningMethod === 'rampup' && (
                <div>
                  <label className="text-sm font-medium">Ramp-Up Plan:</label>
                  <Select value={selectedRampUpPlanId} onValueChange={setSelectedRampUpPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a ramp-up plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {rampUpPlans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="flex space-x-2 pt-4">
                <Button
                  onClick={handleScheduleConfirm}
                  disabled={planningMethod === 'rampup' && !selectedRampUpPlanId}
                  className="flex-1"
                >
                  Schedule Order
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDialogClose}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Overlap Confirmation Dialog */}
      <OverlapConfirmationDialog
        isOpen={overlapDialog.isOpen}
        onClose={() => setOverlapDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleOverlapConfirm}
        newOrder={overlapDialog.newOrder}
        overlappingOrders={overlapDialog.overlappingOrders}
        targetDate={overlapDialog.targetDate}
        targetLine={overlapDialog.targetLine}
      />
    </div>
  );
};

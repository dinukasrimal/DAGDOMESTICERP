import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { CalendarDays, Plus, ArrowLeft, Scissors, GripVertical, FileDown } from 'lucide-react';
import { OverlapConfirmationDialog } from './OverlapConfirmationDialog';
import { downloadElementAsPdf } from '../lib/pdfUtils';
import SchedulingBoardHeader from './SchedulingBoardHeader';
import SchedulingBoardLineRow from './SchedulingBoardLineRow';
import SchedulingBoardScheduleDialog from './SchedulingBoardScheduleDialog';
import { useHandleOverlapDialog } from './useHandleOverlapDialog';
import SchedulingBoardLinePdfReportContainers from './SchedulingBoardLinePdfReportContainers';

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
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

  // Improved scroll event handling for better performance
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (scrollContainerRef.current && scrollContainerRef.current.contains(e.target as Node)) {
        e.preventDefault();
        
        // Increase scroll sensitivity for faster scrolling
        const scrollMultiplier = 3;
        const deltaX = e.deltaX * scrollMultiplier;
        const deltaY = e.deltaY * scrollMultiplier;
        
        // Use deltaX for horizontal scroll, fallback to deltaY if no horizontal movement
        const scrollAmount = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
        
        scrollContainerRef.current.scrollLeft += scrollAmount;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (scrollContainerRef.current && 
          document.activeElement && 
          scrollContainerRef.current.contains(document.activeElement) &&
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) {
        e.preventDefault();
        // Increase scroll amount for faster keyboard navigation
        const scrollAmount = 400;
        if (e.key === 'ArrowLeft') {
          scrollContainerRef.current.scrollLeft -= scrollAmount;
        } else if (e.key === 'ArrowRight') {
          scrollContainerRef.current.scrollLeft += scrollAmount;
        } else if (e.key === 'Home') {
          scrollContainerRef.current.scrollLeft = 0;
        } else if (e.key === 'End') {
          scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
          setScheduleDialog({
            isOpen: true,
            order: orderData,
            lineId,
            startDate: date
          });
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse dropped order data:', error);
    }
  }, [isHoliday, getOverlappingOrders, productionLines, isMultiSelectMode, selectedOrders]);
  
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
      // "After" logic: move new order after overlappers' latest end date,
      // but utilize capacity on the last day if space allows!
      let latestEnd: Date | null = targetDate;
      overlappingOrders.forEach(o => o.planEndDate && o.planEndDate > latestEnd! && (latestEnd = new Date(o.planEndDate)));
      if (!latestEnd) return;
      const selectedLine = productionLines.find(l => l.id === lineId);
      if (!selectedLine) return;

      // Find available capacity on the last day of the overlap
      const lastDayStr = latestEnd.toISOString().split('T')[0];
      const usedCapacityOnLastDay = getOrdersForCell(lineId, latestEnd).reduce(
        (sum, order) => sum + (order.actualProduction?.[lastDayStr] || 0), 0
      );
      const availableCapacityOnLastDay = Math.max(0, selectedLine.capacity - usedCapacityOnLastDay);

      // If we have capacity, start from latestEnd, else start from next day
      let startDateForNewOrder = new Date(latestEnd);
      let fillFirstDay = 0;
      if (availableCapacityOnLastDay > 0) {
        fillFirstDay = availableCapacityOnLastDay;
      } else {
        startDateForNewOrder.setDate(startDateForNewOrder.getDate() + 1);
      }

      // We'll need to pass fillFirstDay to the Schedule dialog so it starts the assignment on the last day,
      // but the dialog and scheduling code expect only startDate. Instead,
      // We can store this as a property on scheduleDialog state.
      setScheduleDialog({
        isOpen: true,
        order: newOrder,
        lineId,
        startDate: startDateForNewOrder,
        // Let's add fillFirstDay as an optional property, safe for rest of code
        fillFirstDay: fillFirstDay
      } as any);

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
  }, [overlapDialog, productionLines, onOrderMovedToPending, getOrdersForCell]);

  // --- When the scheduleDialog is confirmed, carry out any queued magnetic rescheduling ---

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

  const handleScheduleConfirm = useCallback(async () => {
    const { order, lineId, startDate, fillFirstDay } = scheduleDialog as any;
    if (!order || !lineId || !startDate) return;
    const selectedLine = productionLines.find(l => l.id === lineId); if (!selectedLine) return;
    if (planningMethod === 'rampup' && !selectedRampUpPlanId) return;
    try {
      let dailyPlan: { [date: string]: number };
      if (planningMethod === 'capacity') {
        // Pass fillFirstDay to getContiguousProductionPlan if it exists
        dailyPlan = getContiguousProductionPlan(
          order.orderQuantity,
          selectedLine.capacity,
          startDate,
          isHoliday,
          fillFirstDay || 0
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

      if (pendingReschedule.toSchedule.length > 0 && pendingReschedule.afterOrderId === order.id && pendingReschedule.lineId) {
        let newPlanEnd: Date | null = endDate;
        let magnetDate = new Date(newPlanEnd);
        const newOrderLastDayStr = magnetDate.toISOString().split('T')[0];
        const lineObj = productionLines.find(l => l.id === pendingReschedule.lineId);
        let lastDayAvailCapacity = lineObj ? lineObj.capacity - (dailyPlan[newOrderLastDayStr] || 0) : 0;

        for (const [i, next] of pendingReschedule.toSchedule.entries()) {
          if (!lineObj) continue;

          let qty = next.orderQuantity;
          let plan: { [date: string]: number } = {};

          if (i === 0 && lastDayAvailCapacity > 0) {
            plan = getContiguousProductionPlan(
              qty, lineObj.capacity,
              magnetDate,
              (d) => holidays.some(h => h.date.toDateString() === d.toDateString()),
              lastDayAvailCapacity
            );
          } else {
            const anchorNextDay = new Date(magnetDate);
            if (!(i === 0 && lastDayAvailCapacity > 0)) {
              anchorNextDay.setDate(anchorNextDay.getDate() + 1);
            }
            plan = getContiguousProductionPlan(
              qty, lineObj.capacity,
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

  const handleOrderDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    
    // Clear selection after drag
    setSelectedOrders(new Set());
    setIsMultiSelectMode(false);
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

  // New handler to download plan PDF for a single line
  const handleDownloadLinePdf = async (lineId: string, lineName: string) => {
    const reportId = `line-pdf-report-${lineId}`;
    const fileName = `${lineName.replace(/\s+/g, '_')}_Production_Plan`;
    await downloadElementAsPdf(reportId, fileName);
  };

  // Helper: Get all scheduled orders (distinct by orderId) for a line
  const getScheduledOrdersForLine = (lineId: string) => {
    return orders
      .filter(order => order.status === 'scheduled' && order.assignedLineId === lineId)
      .sort((a, b) =>
        (a.planStartDate?.getTime() || 0) - (b.planStartDate?.getTime() || 0)
      );
  };

  return (
    <div 
      ref={scrollContainerRef}
      className="flex-1 bg-background"
      tabIndex={0}
      style={{ 
        overscrollBehaviorX: 'contain',
        WebkitOverflowScrolling: 'touch',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* PDF REPORTS (hidden, for each line) */}
      <SchedulingBoardLinePdfReportContainers
        productionLines={productionLines}
        orders={orders}
        downloadElementAsPdf={downloadElementAsPdf}
      />

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

      {/* Header with dates */}
      <SchedulingBoardHeader dates={dates} isHoliday={isHoliday} />

      {/* Production lines grid - Made scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-border min-w-max">
          {productionLines.map((line) => (
            <SchedulingBoardLineRow
              key={line.id}
              line={line}
              dates={dates}
              getOrdersForCell={getOrdersForCell}
              isHoliday={isHoliday}
              calculateTotalUtilization={calculateTotalUtilization}
              getAvailableCapacity={getAvailableCapacity}
              dragHighlight={dragHighlight}
              handleDrop={handleDrop}
              handleDragOver={handleDragOver}
              handleDragEnter={handleDragEnter}
              handleDragLeave={handleDragLeave}
              onOrderMovedToPending={onOrderMovedToPending}
              onOrderSplit={onOrderSplit}
              handleOrderDragStart={handleOrderDragStart}
              handleOrderDragEnd={handleOrderDragEnd}
              handleOrderClick={handleOrderClick}
              shouldHighlightRed={shouldHighlightRed}
              selectedOrders={selectedOrders}
              handleDownloadLinePdf={handleDownloadLinePdf}
            />
          ))}
        </div>
      </div>

      {/* Schedule Dialog */}
      <SchedulingBoardScheduleDialog
        isOpen={scheduleDialog.isOpen}
        order={scheduleDialog.order}
        lineId={scheduleDialog.lineId}
        startDate={scheduleDialog.startDate}
        productionLines={productionLines}
        planningMethod={planningMethod}
        setPlanningMethod={setPlanningMethod}
        rampUpPlans={rampUpPlans}
        selectedRampUpPlanId={selectedRampUpPlanId}
        setSelectedRampUpPlanId={setSelectedRampUpPlanId}
        onConfirm={handleScheduleConfirm}
        onCancel={handleDialogClose}
        disableConfirm={planningMethod === 'rampup' && !selectedRampUpPlanId}
      />

      {/* Overlap Confirmation Dialog with logic wiring moved to useHandleOverlapDialog */}
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

export default SchedulingBoard;

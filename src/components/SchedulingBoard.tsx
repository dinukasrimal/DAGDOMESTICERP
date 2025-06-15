import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { CalendarDays, Plus, ArrowLeft, Scissors, GripVertical, FileDown, Search } from 'lucide-react';
import { OverlapConfirmationDialog } from './OverlapConfirmationDialog';
import { downloadElementAsPdf } from '../lib/pdfUtils';
import { OrderSlot } from './OrderSlot';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [scheduleDialog, setScheduleDialog] = useState<{
    isOpen: boolean;
    order: Order | null;
    lineId: string;
    startDate: Date | null;
    fillFirstDay?: number;
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
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Generate date range dynamically based on scheduled orders
  const dates = useMemo(() => {
    const today = new Date();
    let maxEndDate = new Date(today);
    maxEndDate.setDate(maxEndDate.getDate() + 30); // Default minimum 30 days

    // Find the latest end date from all scheduled orders
    const scheduledOrders = orders.filter(order => order.status === 'scheduled' && order.planEndDate);
    if (scheduledOrders.length > 0) {
      const latestEndDate = Math.max(...scheduledOrders.map(order => order.planEndDate!.getTime()));
      const calculatedMaxDate = new Date(latestEndDate);
      calculatedMaxDate.setDate(calculatedMaxDate.getDate() + 14); // Add 2 weeks buffer
      
      if (calculatedMaxDate > maxEndDate) {
        maxEndDate = calculatedMaxDate;
      }
    }

    // Calculate number of days from today to maxEndDate
    const daysDiff = Math.ceil((maxEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const numberOfDays = Math.max(30, daysDiff); // Ensure at least 30 days

    return Array.from({ length: numberOfDays }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [orders]);

  // Filter orders based on search query
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    
    const query = searchQuery.toLowerCase().trim();
    return orders.filter(order => 
      order.poNumber.toLowerCase().includes(query) ||
      order.styleId.toLowerCase().includes(query)
    );
  }, [orders, searchQuery]);

  // Helper functions
  const isHoliday = useCallback((date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  }, [holidays]);

  const getOrdersForCell = useCallback((lineId: string, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return filteredOrders.filter(order =>
      order.status === 'scheduled' &&
      order.assignedLineId === lineId &&
      order.actualProduction?.[dateStr] > 0
    );
  }, [filteredOrders]);

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

  const getOverlappingOrders = useCallback((order: Order, lineId: string, date: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return [];
    const dailyCapacity = line.capacity;
    const totalDays = Math.ceil(order.orderQuantity / dailyCapacity);
    const overlappingOrders: Order[] = [];
    const newOrderEndDate = new Date(date);
    newOrderEndDate.setDate(newOrderEndDate.getDate() + totalDays - 1);
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

  // Multi-select functionality - updated to work with checkboxes
  const handleOrderClick = useCallback((e: React.MouseEvent, orderId: string) => {
    // Always enable multi-select mode when checkbox is used (simulated via ctrlKey)
    if (e.ctrlKey || e.metaKey) {
      setIsMultiSelectMode(true);
      setSelectedOrders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(orderId)) {
          newSet.delete(orderId);
          // If no orders selected, exit multi-select mode
          if (newSet.size === 0) {
            setIsMultiSelectMode(false);
          }
        } else {
          newSet.add(orderId);
        }
        return newSet;
      });
    } else if (!selectedOrders.has(orderId)) {
      // Clear selection if clicking on unselected order without ctrl
      setSelectedOrders(new Set());
      setIsMultiSelectMode(false);
    }
  }, [selectedOrders]);

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

  const handleOrderDragStart = useCallback((e: React.DragEvent, order: Order) => {
    console.log('🔄 Starting drag for scheduled order:', order.poNumber);
    e.dataTransfer.effectAllowed = 'move';
    
    // If this order is part of a multi-selection, drag all selected orders
    let ordersToDrag = [order];
    if (isMultiSelectMode && selectedOrders.has(order.id)) {
      ordersToDrag = orders.filter(o => selectedOrders.has(o.id));
      console.log(`🔄 Dragging ${ordersToDrag.length} selected orders`);
    }
    
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'multi-order-drag',
      orders: ordersToDrag,
      sourceOrderId: order.id // Track which order initiated the drag
    }));

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, [isMultiSelectMode, selectedOrders, orders]);

  // Fixed handleDrop function to properly schedule all multi-selected orders
  const handleDrop = useCallback(async (e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    setDragHighlight(null);
    if (isHoliday(date)) return;
    
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
      
      if (dragData.type === 'multi-order-drag' && dragData.orders) {
        // Handle multi-order drop - improved to prevent disappearing orders
        const ordersToDrop = dragData.orders as Order[];
        console.log(`📍 Dropping ${ordersToDrop.length} orders on ${lineId} at ${date.toLocaleDateString()}`);
        
        // Move all orders to pending first to prevent conflicts
        console.log('📤 Moving all selected orders to pending first...');
        for (const order of ordersToDrop) {
          await onOrderMovedToPending(order);
        }
        
        // Schedule orders sequentially
        let currentDate = new Date(date);
        for (let i = 0; i < ordersToDrop.length; i++) {
          const order = ordersToDrop[i];
          console.log(`📋 Scheduling order ${i + 1}/${ordersToDrop.length}: ${order.poNumber}`);
          
          const overlappingOrders = getOverlappingOrders(order, lineId, currentDate);
          const lineName = productionLines.find(l => l.id === lineId)?.name || 'Unknown Line';
          
          if (overlappingOrders.length > 0) {
            console.log(`⚠️ Found overlapping orders for ${order.poNumber}, showing dialog`);
            setOverlapDialog({
              isOpen: true,
              newOrder: order,
              overlappingOrders,
              targetDate: currentDate,
              targetLine: lineName,
              originalTargetDate: currentDate
            });
            break; // Handle one overlap at a time
          } else {
            console.log(`✅ No overlaps for ${order.poNumber}, scheduling directly`);
            
            // Schedule the order directly without dialog
            const selectedLine = productionLines.find(l => l.id === lineId);
            if (selectedLine) {
              const dailyPlan = getContiguousProductionPlan(
                order.orderQuantity,
                selectedLine.capacity,
                currentDate,
                isHoliday,
                0
              );
              const planDates = Object.keys(dailyPlan);
              const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
              const updatedOrder = { ...order, assignedLineId: lineId };
              await onOrderScheduled(updatedOrder, currentDate, endDate, dailyPlan);
              
              // Calculate where this order would end to position next order
              if (i < ordersToDrop.length - 1) { // Only calculate for non-last orders
                const estimatedDays = Math.ceil(order.orderQuantity / selectedLine.capacity);
                const endDateForNext = new Date(currentDate);
                endDateForNext.setDate(endDateForNext.getDate() + estimatedDays);
                currentDate = new Date(endDateForNext);
                currentDate.setDate(currentDate.getDate() + 1); // Start next order day after
              }
            }
          }
        }
        
        // Clear selection after successful multi-drop
        console.log('🧹 Clearing selection after drop');
        setSelectedOrders(new Set());
        setIsMultiSelectMode(false);
        
      } else if (dragData && dragData.id && dragData.poNumber) {
        // Handle single order drop (existing logic)
        const overlappingOrders = getOverlappingOrders(dragData, lineId, date);
        const lineName = productionLines.find(l => l.id === lineId)?.name || 'Unknown Line';
        if (overlappingOrders.length > 0) {
          setOverlapDialog({
            isOpen: true,
            newOrder: dragData,
            overlappingOrders,
            targetDate: date,
            targetLine: lineName,
            originalTargetDate: date
          });
        } else {
          setScheduleDialog({
            isOpen: true,
            order: dragData,
            lineId,
            startDate: date
          });
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse dropped order data:', error);
    }
  }, [isHoliday, getOverlappingOrders, productionLines, onOrderMovedToPending, onOrderScheduled]);

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
      for (const order of overlappingOrders) { 
        await onOrderMovedToPending(order); 
      }
      setScheduleDialog({
        isOpen: true,
        order: newOrder,
        lineId,
        startDate: originalTargetDate
      });
      setPendingReschedule({ toSchedule: overlappingOrders, afterOrderId: newOrder.id, lineId });
    } else {
      let latestEnd: Date | null = targetDate;
      overlappingOrders.forEach(o => o.planEndDate && o.planEndDate > latestEnd! && (latestEnd = new Date(o.planEndDate)));
      if (!latestEnd) return;
      const selectedLine = productionLines.find(l => l.id === lineId);
      if (!selectedLine) return;

      const lastDayStr = latestEnd.toISOString().split('T')[0];
      const usedCapacityOnLastDay = getOrdersForCell(lineId, latestEnd).reduce(
        (sum, order) => sum + (order.actualProduction?.[lastDayStr] || 0), 0
      );
      const availableCapacityOnLastDay = Math.max(0, selectedLine.capacity - usedCapacityOnLastDay);

      let startDateForNewOrder = new Date(latestEnd);
      let fillFirstDay = 0;
      if (availableCapacityOnLastDay > 0) {
        fillFirstDay = availableCapacityOnLastDay;
      } else {
        startDateForNewOrder.setDate(startDateForNewOrder.getDate() + 1);
      }

      setScheduleDialog({
        isOpen: true,
        order: newOrder,
        lineId,
        startDate: startDateForNewOrder,
        fillFirstDay: fillFirstDay
      });

      setPendingReschedule({ toSchedule: [], afterOrderId: null, lineId: null });
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

  const getContiguousProductionPlan = (
    qty: number,
    lineCapacity: number,
    startDate: Date,
    isHolidayFn: (d: Date) => boolean,
    fillFirstDay: number = 0
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
      currentDate.setDate(currentDate.getDate() + 1);
      if (Object.keys(plan).length > 366) break;
    }
    return plan;
  };

  const handleScheduleConfirm = useCallback(async () => {
    const { order, lineId, startDate, fillFirstDay } = scheduleDialog;
    if (!order || !lineId || !startDate) return;
    const selectedLine = productionLines.find(l => l.id === lineId);
    if (!selectedLine) return;
    if (planningMethod === 'rampup' && !selectedRampUpPlanId) return;
    try {
      let dailyPlan: { [date: string]: number };
      if (planningMethod === 'capacity') {
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
      setPlanningMethod('capacity');
      setSelectedRampUpPlanId('');

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
    calculateDailyProductionWithSharing, onOrderScheduled, pendingReschedule, holidays, isHoliday
  ]);

  const handleDialogClose = useCallback(() => {
    setScheduleDialog({ isOpen: false, order: null, lineId: '', startDate: null });
    setPlanningMethod('capacity');
    setSelectedRampUpPlanId('');
  }, []);

  const handleOrderDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    // Don't clear selection on drag end to maintain multi-select state
  }, []);

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

  const handleDownloadLinePdf = async (lineId: string, lineName: string) => {
    const reportId = `line-pdf-report-${lineId}`;
    const fileName = `${lineName.replace(/\s+/g, '_')}_Production_Plan`;
    await downloadElementAsPdf(reportId, fileName);
  };

  const getScheduledOrdersForLine = (lineId: string) => {
    return orders
      .filter(order => order.status === 'scheduled' && order.assignedLineId === lineId)
      .sort((a, b) =>
        (a.planStartDate?.getTime() || 0) - (b.planStartDate?.getTime() || 0)
      );
  };

  return (
    <div className="w-full h-full flex flex-col bg-background">
      {/* Search Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Search by PO number or style..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4"
            />
          </div>
          {searchQuery && (
            <div className="mt-2 text-sm text-gray-600">
              {filteredOrders.filter(o => o.status === 'scheduled').length} scheduled orders found
            </div>
          )}
        </div>
      </div>

      {/* PDF REPORTS (hidden, for each line) */}
      {productionLines.map(line => {
        const scheduledOrders = getScheduledOrdersForLine(line.id);
        if (scheduledOrders.length === 0) return null;
        return (
          <div
            id={`line-pdf-report-${line.id}`}
            key={`printable-${line.id}`}
            style={{ position: 'absolute', left: -9999, top: 0, width: '800px', background: '#fff', color: '#111', padding: 24, zIndex: -1000, fontSize: 14 }}
          >
            <div style={{ borderBottom: '2px solid #111', paddingBottom: 8, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Production Plan Report</h2>
              <div>Line: <b>{line.name}</b></div>
              <div>Generated on: {new Date().toLocaleString()}</div>
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>Order #</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>Style</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #aaa', padding: 6 }}>Quantity</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>PSD (Plan Start)</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>PED (Plan End)</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {scheduledOrders.map(order => (
                  <tr key={order.id}>
                    <td style={{ padding: 6 }}>{order.poNumber}</td>
                    <td style={{ padding: 6 }}>{order.styleId}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{order.orderQuantity.toLocaleString()}</td>
                    <td style={{ padding: 6 }}>
                      {order.planStartDate ? order.planStartDate.toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: 6 }}>
                      {order.planEndDate ? order.planEndDate.toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: 6 }}>
                      {order.planEndDate
                        ? (() => {
                          const d = new Date(order.planEndDate!);
                          d.setDate(d.getDate() + 1);
                          return d.toLocaleDateString();
                        })()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 24, fontStyle: 'italic', fontSize: 13 }}>
              * Delivery is estimated as one day after Plan End Date.
            </div>
          </div>
        );
      })}

      {/* Multi-select info bar */}
      {isMultiSelectMode && selectedOrders.size > 0 && (
        <div className="sticky top-16 z-20 bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-blue-800 font-medium text-sm">
              {selectedOrders.size} orders selected - Use checkboxes to select/deselect, then drag to move together
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-blue-800 hover:bg-blue-100"
              onClick={() => {
                setSelectedOrders(new Set());
                setIsMultiSelectMode(false);
              }}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Main Schedule Grid */}
      <div className="flex-1 overflow-auto bg-background">
        <div className="min-w-max">
          {/* Header Row */}
          <div className="sticky top-0 z-30 bg-white border-b-2 border-gray-200 shadow-sm flex">
            {/* Production Lines Header - Fixed at front */}
            <div className="sticky left-0 z-40 w-80 bg-white border-r-2 border-gray-300 shadow-lg">
              <div className="h-20 p-4 flex items-center justify-center bg-gradient-to-r from-blue-50 to-blue-100 border-r border-gray-300">
                <div className="flex items-center space-x-3">
                  <CalendarDays className="h-6 w-6 text-blue-600" />
                  <span className="font-bold text-lg text-gray-800">Production Lines</span>
                </div>
              </div>
            </div>
            
            {/* Date Headers */}
            <div className="flex">
              {dates.map(date => (
                <div
                  key={date.toISOString()}
                  className={`w-40 h-20 p-3 border-r border-gray-200 flex flex-col justify-center items-center text-center ${
                    isHoliday(date) ? 'bg-red-50 border-red-200' : 'bg-white'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className="text-lg font-bold text-gray-800 mt-1">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  {isHoliday(date) && (
                    <div className="text-xs text-red-600 font-semibold mt-1">Holiday</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Production Line Rows */}
          {productionLines.map(line => (
            <div key={line.id} className="flex border-b border-gray-200">
              {/* Line Header - Fixed at front */}
              <div className="sticky left-0 z-20 w-80 bg-white border-r-2 border-gray-300 shadow-md">
                <div className="h-40 p-4 flex flex-col justify-between bg-gradient-to-r from-gray-50 to-gray-100">
                  <div className="space-y-2">
                    <div className="font-bold text-gray-800 text-lg">{line.name}</div>
                    <div className="text-sm text-gray-600">
                      Capacity: <span className="font-semibold text-gray-800">{line.capacity}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-9 flex items-center gap-2 font-medium border-gray-300 hover:bg-blue-50 hover:border-blue-300"
                    onClick={() => handleDownloadLinePdf(line.id, line.name)}
                    title="Download Production Plan PDF"
                  >
                    <FileDown className="w-4 h-4" />
                    Download Plan
                  </Button>
                </div>
              </div>

              {/* Date Cells for this Line */}
              <div className="flex">
                {dates.map(date => {
                  const cellKey = `${line.id}-${date.toISOString().split('T')[0]}`;
                  const isHighlighted = dragHighlight === cellKey;
                  const utilizationPercent = calculateTotalUtilization(line.id, date);
                  const ordersInCell = getOrdersForCell(line.id, date);
                  const isHolidayCell = isHoliday(date);
                  const availableCapacity = getAvailableCapacity(line.id, date);

                  return (
                    <div
                      key={cellKey}
                      className={`w-40 h-40 border-r border-gray-200 relative transition-all duration-200 ${
                        isHolidayCell
                          ? 'bg-red-50/50'
                          : isHighlighted
                            ? 'bg-blue-100 border-blue-300 border-2'
                            : 'bg-white hover:bg-gray-50'
                      }`}
                      onDrop={(e) => handleDrop(e, line.id, date)}
                      onDragOver={handleDragOver}
                      onDragEnter={(e) => handleDragEnter(e, line.id, date)}
                      onDragLeave={handleDragLeave}
                    >
                      {/* Utilization Bar */}
                      {utilizationPercent > 0 && !isHolidayCell && (
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-200 to-blue-100 transition-all duration-300 opacity-60"
                          style={{ height: `${Math.min(utilizationPercent, 100)}%` }}
                        />
                      )}

                      {/* Empty Cell Plus Icon */}
                      {!isHolidayCell && ordersInCell.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <Plus className="h-6 w-6 text-gray-400" />
                        </div>
                      )}

                      {/* Available Capacity Badge */}
                      {!isHolidayCell && availableCapacity > 0 && ordersInCell.length > 0 && (
                        <div className="absolute top-2 right-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-md font-semibold shadow-sm">
                          {availableCapacity}
                        </div>
                      )}

                      {/* Drop Highlight */}
                      {isHighlighted && !isHolidayCell && (
                        <div className="absolute inset-0 flex items-center justify-center bg-blue-50 border-2 border-blue-300 border-dashed rounded-sm">
                          <div className="text-sm font-semibold text-blue-600 bg-white px-3 py-2 rounded-md shadow-sm">
                            Drop Here
                          </div>
                        </div>
                      )}

                      {/* Orders in Cell */}
                      <div className="absolute inset-0 p-1 overflow-hidden">
                        <div className="h-full flex flex-col gap-0.5">
                          {ordersInCell.map((scheduledOrder, index) => {
                            const cardKey = `${scheduledOrder.id}-${date.toISOString().split('T')[0]}`;
                            const isSelected = selectedOrders.has(scheduledOrder.id);
                            const cardCount = ordersInCell.length;
                            const availableHeight = 152; // 160px - 8px padding
                            const minCardHeight = 36; // Minimum height to show product and percentage
                            const idealCardHeight = Math.max(minCardHeight, Math.floor(availableHeight / cardCount) - 2);
                            const cardHeight = cardCount > 3 ? minCardHeight : idealCardHeight;

                            return (
                              <div
                                key={cardKey}
                                style={{
                                  height: hoveredCard === cardKey ? 'auto' : `${cardHeight}px`,
                                  minHeight: hoveredCard === cardKey ? '120px' : `${cardHeight}px`,
                                  maxHeight: hoveredCard === cardKey ? '200px' : `${cardHeight}px`
                                }}
                              >
                                <OrderSlot
                                  scheduledOrder={scheduledOrder}
                                  date={date}
                                  isSelected={isSelected}
                                  isMultiSelectMode={isMultiSelectMode}
                                  onOrderClick={handleOrderClick}
                                  onOrderDragStart={handleOrderDragStart}
                                  onOrderDragEnd={handleOrderDragEnd}
                                  onOrderMovedToPending={onOrderMovedToPending}
                                  onOrderSplit={onOrderSplit}
                                  hoveredCard={hoveredCard}
                                  setHoveredCard={setHoveredCard}
                                  shouldHighlightRed={shouldHighlightRed}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
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

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { CalendarDays, Plus, ArrowLeft, Scissors, GripVertical, FileDown, Search, Package } from 'lucide-react';
import { OverlapConfirmationDialog } from './OverlapConfirmationDialog';
import { DropPositionChoiceDialog } from './DropPositionChoiceDialog';
import { downloadElementAsPdf } from '../lib/pdfUtils';
import { OrderSlot } from './OrderSlot';

interface SchedulingBoardProps {
  orders: Order[];
  productionLines: ProductionLine[];
  holidays: Holiday[];
  rampUpPlans: RampUpPlan[];
  onOrderScheduled: (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => Promise<void>;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
}

export const SchedulingBoard: React.FC<SchedulingBoardProps> = ({
  orders,
  productionLines,
  holidays,
  rampUpPlans,
  onOrderScheduled,
  onOrderSplit
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Year/Month selection state - Default to current month only
  const [selectedYears, setSelectedYears] = useState<number[]>([new Date().getFullYear()]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([new Date().getMonth()]);
  
  // Temporary holding area state - now per line
  const [tempHoldOrders, setTempHoldOrders] = useState<{ [lineId: string]: Order[] }>({});

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

  const [dropPositionDialog, setDropPositionDialog] = useState<{
    isOpen: boolean;
    draggedOrder: Order | null;
    targetOrder: Order | null;
    targetDate: Date | null;
    targetLine: string;
  }>({
    isOpen: false,
    draggedOrder: null,
    targetOrder: null,
    targetDate: null,
    targetLine: ''
  });

  const [planningMethod, setPlanningMethod] = useState<'capacity' | 'rampup'>('capacity');
  const [selectedRampUpPlanId, setSelectedRampUpPlanId] = useState<string>('');
  const [dragHighlight, setDragHighlight] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Generate available years and months
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - 1 + i); // Previous year to 3 years ahead
  }, []);

  const availableMonths = useMemo(() => [
    { value: 0, label: 'January' },
    { value: 1, label: 'February' },
    { value: 2, label: 'March' },
    { value: 3, label: 'April' },
    { value: 4, label: 'May' },
    { value: 5, label: 'June' },
    { value: 6, label: 'July' },
    { value: 7, label: 'August' },
    { value: 8, label: 'September' },
    { value: 9, label: 'October' },
    { value: 10, label: 'November' },
    { value: 11, label: 'December' }
  ], []);

  // Generate date range based on selected years and months
  // Auto-extend by 2 months when orders exceed current range
  const dates = useMemo(() => {
    let currentSelectedYears = selectedYears;
    let currentSelectedMonths = selectedMonths;
    
    if (selectedYears.length === 0 || selectedMonths.length === 0) {
      // Fallback to current month if nothing selected
      const today = new Date();
      currentSelectedYears = [today.getFullYear()];
      currentSelectedMonths = [today.getMonth()];
    }

    // Create all date combinations for selected years and months
    const allDates: Date[] = [];
    
    currentSelectedYears.forEach(year => {
      currentSelectedMonths.forEach(month => {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        for (let day = 1; day <= daysInMonth; day++) {
          allDates.push(new Date(year, month, day));
        }
      });
    });

    // Sort dates chronologically
    const sortedDates = allDates.sort((a, b) => a.getTime() - b.getTime());
    
    // Check if any scheduled orders exceed the current date range
    const scheduledOrders = orders.filter(order => order.status === 'scheduled');
    const latestOrderDate = scheduledOrders.reduce((latest, order) => {
      if (order.planEndDate) {
        const orderEndDate = new Date(order.planEndDate);
        return orderEndDate > latest ? orderEndDate : latest;
      }
      return latest;
    }, new Date(0));
    
    // If orders exceed the current range, extend by 2 months
    if (latestOrderDate > sortedDates[sortedDates.length - 1]) {
      const extendedEndDate = new Date(latestOrderDate.getFullYear(), latestOrderDate.getMonth() + 2 + 1, 0);
      const lastCurrentDate = sortedDates[sortedDates.length - 1];
      
      // Add dates from the day after the last current date to the extended end date
      const extendDate = new Date(lastCurrentDate);
      extendDate.setDate(extendDate.getDate() + 1);
      
      while (extendDate <= extendedEndDate) {
        sortedDates.push(new Date(extendDate));
        extendDate.setDate(extendDate.getDate() + 1);
      }
    }
    
    return sortedDates;
  }, [selectedYears, selectedMonths, orders]);

  // Filter orders based on search query
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    
    const query = searchQuery.toLowerCase().trim();
    return orders.filter(order => 
      order.poNumber.toLowerCase().includes(query) ||
      order.styleId.toLowerCase().includes(query)
    );
  }, [orders, searchQuery]);

  // Year selection handlers
  const handleYearToggle = (year: number) => {
    setSelectedYears(prev => {
      if (prev.includes(year)) {
        return prev.filter(y => y !== year);
      } else {
        return [...prev, year].sort();
      }
    });
  };

  // Month selection handlers
  const handleMonthToggle = (month: number) => {
    setSelectedMonths(prev => {
      if (prev.includes(month)) {
        return prev.filter(m => m !== month);
      } else {
        return [...prev, month].sort();
      }
    });
  };

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
    const currentDate = new Date(startDate);
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
    let dragType = 'single-order-drag';
    
    if (isMultiSelectMode && selectedOrders.has(order.id)) {
      ordersToDrag = orders.filter(o => selectedOrders.has(o.id));
      dragType = 'multi-order-drag';
      console.log(`🔄 Dragging ${ordersToDrag.length} selected orders`);
    }
    
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: dragType,
      orders: ordersToDrag,
      sourceOrderId: order.id, // Track which order initiated the drag
      source: 'scheduled-order'
    }));

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, [isMultiSelectMode, selectedOrders, orders]);

  // Handle drop in temporary hold area - updated to work per line
  const handleTempHoldDrop = useCallback((e: React.DragEvent, lineId: string) => {
    e.preventDefault();
    
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
      
      if (dragData.type === 'multi-order-drag' && dragData.orders) {
        const ordersToDrop = dragData.orders as Order[];
        console.log(`📦 Adding ${ordersToDrop.length} orders to temp hold for line ${lineId}`);
        
        // Move orders to temp hold and remove from their current positions
        ordersToDrop.forEach(order => {
          // Orders will be handled by the temp hold mechanism
        });
        
        setTempHoldOrders(prev => ({
          ...prev,
          [lineId]: [...(prev[lineId] || []), ...ordersToDrop]
        }));
        setSelectedOrders(new Set());
        setIsMultiSelectMode(false);
        
      } else if (dragData.type === 'single-order-drag' && dragData.orders && dragData.orders.length === 1) {
        const singleOrder = dragData.orders[0];
        console.log(`📦 Adding order ${singleOrder.poNumber} to temp hold for line ${lineId}`);
        
        // Order will be handled by the temp hold mechanism
        
        setTempHoldOrders(prev => ({
          ...prev,
          [lineId]: [...(prev[lineId] || []), singleOrder]
        }));
      }
    } catch (error) {
      console.error('❌ Failed to parse dropped order data for temp hold:', error);
    }
  }, []);

  // Remove order from temp hold - updated to work per line
  const handleRemoveFromTempHold = useCallback((orderId: string, lineId: string) => {
    setTempHoldOrders(prev => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter(order => order.id !== orderId)
    }));
  }, []);

  // Updated handleDrop function to remove orders from all temp hold areas
  const handleDrop = useCallback(async (e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    setDragHighlight(null);
    if (isHoliday(date)) return;
    
    console.log('🔍 Calendar cell drop handler called', { lineId, date: date.toLocaleDateString() });
    
    // Check if the drop target is an order block - if so, don't handle it here
    // The OrderSlot component will handle block drops via handleOrderBlockDrop
    const target = e.target as HTMLElement;
    if (target.closest('[data-order-block]')) {
      console.log('🔍 Drop on order block detected, letting OrderSlot handle it');
      e.stopPropagation(); // Prevent event bubbling
      return;
    }
    
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
      
      if (dragData.type === 'multi-order-drag' && dragData.orders) {
        // Handle multi-order drop - place directly without overlap dialog or moving other orders
        const ordersToDrop = dragData.orders as Order[];
        console.log(`📍 Multi-drop: ${ordersToDrop.length} orders on ${lineId} at ${date.toLocaleDateString()}`);
        
        // For multi-order drops, don't move existing orders to pending - just place sequentially
        let currentDate = new Date(date);
        for (let i = 0; i < ordersToDrop.length; i++) {
          const order = ordersToDrop[i];
          console.log(`📋 Scheduling order ${i + 1}/${ordersToDrop.length}: ${order.poNumber}`);
          
          // Find next available date that doesn't conflict
          while (true) {
            const selectedLine = productionLines.find(l => l.id === lineId);
            if (!selectedLine) break;
            
            // Check if we can place the order starting from currentDate
            const dailyPlan = getContiguousProductionPlan(
              order.orderQuantity,
              selectedLine.capacity,
              currentDate,
              isHoliday,
              0
            );
            
            const planDates = Object.keys(dailyPlan);
            if (planDates.length > 0) {
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
              break;
            } else {
              // Move to next day if can't place
              currentDate.setDate(currentDate.getDate() + 1);
            }
          }
        }
        
        // Remove successfully scheduled orders from ALL temp hold areas
        setTempHoldOrders(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(tempLineId => {
            updated[tempLineId] = updated[tempLineId].filter(tempOrder => 
              !ordersToDrop.some(droppedOrder => droppedOrder.id === tempOrder.id)
            );
          });
          return updated;
        });
        
        // Clear selection after successful multi-drop
        console.log('🧹 Clearing selection after multi-drop');
        setSelectedOrders(new Set());
        setIsMultiSelectMode(false);
        
      } else if (dragData.type === 'single-order-drag' && dragData.orders && dragData.orders.length === 1) {
        // Handle single order drop - show overlap dialog if needed
        const singleOrder = dragData.orders[0];
        console.log(`📍 Single-drop: ${singleOrder.poNumber} on ${lineId} at ${date.toLocaleDateString()}`);
        
        const overlappingOrders = getOverlappingOrders(singleOrder, lineId, date);
        const lineName = productionLines.find(l => l.id === lineId)?.name || 'Unknown Line';
        
        if (overlappingOrders.length > 0) {
          console.log(`⚠️ Overlap detected with ${overlappingOrders.length} orders`);
          setOverlapDialog({
            isOpen: true,
            newOrder: singleOrder,
            overlappingOrders,
            targetDate: date,
            targetLine: lineName,
            originalTargetDate: date
          });
        } else {
          console.log('✅ No overlap, scheduling directly');
          setScheduleDialog({
            isOpen: true,
            order: singleOrder,
            lineId,
            startDate: date
          });
        }
      } else if (dragData && dragData.id && dragData.poNumber) {
        // Handle legacy single order drop format (fallback)
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
  }, [isHoliday, getOverlappingOrders, productionLines, onOrderScheduled]);

  // Handle drop on existing order block - schedule dragged order after the target order
  const handleOrderBlockDrop = useCallback(async (e: React.DragEvent, targetOrder: any, targetDate: Date) => {
    e.preventDefault();
    
    try {
      const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
      console.log('🔍 Block drop drag data:', dragData);
      console.log('🔍 Target order:', targetOrder);
      console.log('🔍 Target date:', targetDate);
      
      if (dragData.type === 'single-order-drag' && dragData.orders && dragData.orders.length === 1) {
        const draggedOrder = dragData.orders[0];
        
        // Don't allow dropping on self
        if (draggedOrder.id === targetOrder.id) {
          console.log('❌ Cannot drop on self');
          return;
        }
        
        console.log(`📍 Block drop: ${draggedOrder.poNumber} onto ${targetOrder.poNumber} at ${targetDate.toLocaleDateString()}`);
        console.log(`🔍 Drag source: ${dragData.source}`);
        
        // Find the target line
        const targetLineId = targetOrder.assignedLineId;
        const targetLine = productionLines.find(l => l.id === targetLineId);
        const targetLineName = targetLine?.name || 'Unknown Line';
        
        if (!targetLine) {
          console.error('❌ Target line not found');
          return;
        }
        
        // Check if drag source is from sidebar - show position choice dialog
        if (dragData.source === 'sidebar') {
          console.log('🎯 Showing position choice dialog');
          setDropPositionDialog({
            isOpen: true,
            draggedOrder,
            targetOrder,
            targetDate,
            targetLine: targetLineName
          });
          return;
        }
        
        // For scheduled-order to scheduled-order drops, proceed with direct scheduling after target order
        console.log('📍 Direct scheduling after target order');
        await scheduleOrderAfterTarget(draggedOrder, targetOrder, targetDate, targetLine);
        
      } else {
        console.log('❌ Invalid drag data format or not single order drag');
      }
    } catch (error) {
      console.error('❌ Failed to parse dropped order data for block drop:', error);
    }
  }, [productionLines]);

  // Helper function to schedule order after target order
  const scheduleOrderAfterTarget = useCallback(async (draggedOrder: Order, targetOrder: any, targetDate: Date, targetLine: ProductionLine) => {
    console.log(`📍 Scheduling ${draggedOrder.poNumber} after ${targetOrder.poNumber}`);
    
    // Calculate the end date of the target order by finding all its scheduled dates
    const targetOrderDates = Object.keys(targetOrder.actualProduction || {})
      .filter(dateStr => targetOrder.actualProduction[dateStr] > 0)
      .sort();
    
    let targetEndDate: Date;
    if (targetOrderDates.length > 0) {
      targetEndDate = new Date(targetOrderDates[targetOrderDates.length - 1]);
    } else {
      // If no actual production dates, use the target date as reference
      targetEndDate = new Date(targetDate);
    }
    
    // Calculate the remaining capacity on the target order's last day
    const targetEndDateStr = targetEndDate.toISOString().split('T')[0];
    const targetOrderProduction = targetOrder.actualProduction?.[targetEndDateStr] || 0;
    const remainingCapacity = Math.max(0, targetLine.capacity - targetOrderProduction);
    
    // Schedule the dragged order starting from the day after target order ends
    const schedulingStartDate = new Date(targetEndDate);
    schedulingStartDate.setDate(schedulingStartDate.getDate() + 1);
    
    // If there's remaining capacity on the target order's last day, utilize it
    let initialProduction = 0;
    let actualStartDate = new Date(targetEndDate);
    
    if (remainingCapacity > 0) {
      initialProduction = Math.min(remainingCapacity, draggedOrder.orderQuantity);
      actualStartDate = new Date(targetEndDate);
    } else {
      actualStartDate = new Date(schedulingStartDate);
    }
    
    // Calculate production plan for the remaining quantity
    const remainingQuantity = draggedOrder.orderQuantity - initialProduction;
    const dailyPlan: { [date: string]: number } = {};
    
    if (initialProduction > 0) {
      const targetEndDateStr = targetEndDate.toISOString().split('T')[0];
      dailyPlan[targetEndDateStr] = initialProduction;
    }
    
    if (remainingQuantity > 0) {
      const remainingPlan = getContiguousProductionPlan(
        remainingQuantity,
        targetLine.capacity,
        schedulingStartDate,
        isHoliday,
        0
      );
      
      // Merge the plans
      Object.entries(remainingPlan).forEach(([date, quantity]) => {
        dailyPlan[date] = (dailyPlan[date] || 0) + quantity;
      });
    }
    
    // Calculate actual end date
    const planDates = Object.keys(dailyPlan);
    const endDate = planDates.length > 0 
      ? new Date(Math.max(...planDates.map(d => new Date(d).getTime())))
      : actualStartDate;
    
    // Schedule the dragged order (order status will be updated during scheduling)
    const updatedOrder = { ...draggedOrder, assignedLineId: targetLine.id };
    await onOrderScheduled(updatedOrder, actualStartDate, endDate, dailyPlan);
    
    console.log(`✅ Order ${draggedOrder.poNumber} scheduled after ${targetOrder.poNumber} from ${actualStartDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
  }, [onOrderScheduled, isHoliday]);

  // Handle drop position dialog confirmation
  const handleDropPositionConfirm = useCallback(async (choice: 'where-dropped' | 'after-order') => {
    const { draggedOrder, targetOrder, targetDate, targetLine } = dropPositionDialog;
    
    if (!draggedOrder || !targetOrder || !targetDate) {
      console.error('❌ Missing drop position dialog data');
      return;
    }
    
    // Find the target line object
    const targetLineObj = productionLines.find(l => l.name === targetLine);
    if (!targetLineObj) {
      console.error('❌ Target line not found');
      return;
    }
    
    if (choice === 'where-dropped') {
      // Use the current drop behavior - schedule at the specific date
      console.log(`📍 Scheduling ${draggedOrder.poNumber} at dropped position ${targetDate.toLocaleDateString()}`);
      
      // Check for overlaps and proceed with standard scheduling
      const overlappingOrders = getOverlappingOrders(draggedOrder, targetLineObj.id, targetDate);
      
      if (overlappingOrders.length > 0) {
        // Show overlap dialog
        setOverlapDialog({
          isOpen: true,
          newOrder: draggedOrder,
          overlappingOrders,
          targetDate: targetDate,
          targetLine: targetLine,
          originalTargetDate: targetDate
        });
      } else {
        // Schedule directly
        setScheduleDialog({
          isOpen: true,
          order: draggedOrder,
          lineId: targetLineObj.id,
          startDate: targetDate
        });
      }
    } else {
      // Schedule after the target order
      await scheduleOrderAfterTarget(draggedOrder, targetOrder, targetDate, targetLineObj);
    }
    
    // Close the dialog
    setDropPositionDialog({
      isOpen: false,
      draggedOrder: null,
      targetOrder: null,
      targetDate: null,
      targetLine: ''
    });
  }, [dropPositionDialog, productionLines, getOverlappingOrders, scheduleOrderAfterTarget]);

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
      // Overlapping orders will be rescheduled automatically
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

      const startDateForNewOrder = new Date(latestEnd);
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
  }, [overlapDialog, productionLines, getOrdersForCell]);

  const getContiguousProductionPlan = (
    qty: number,
    lineCapacity: number,
    startDate: Date,
    isHolidayFn: (d: Date) => boolean,
    fillFirstDay: number = 0
  ) => {
    const plan: { [date: string]: number } = {};
    let remainingQty = qty;
    const currentDate = new Date(startDate);
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

  // Updated handleScheduleConfirm to remove orders from temp hold
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
      
      // Remove the scheduled order from ALL temp hold areas
      setTempHoldOrders(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(tempLineId => {
          updated[tempLineId] = updated[tempLineId].filter(tempOrder => tempOrder.id !== order.id);
        });
        return updated;
      });
      
      setScheduleDialog({ isOpen: false, order: null, lineId: '', startDate: null });
      setPlanningMethod('capacity');
      setSelectedRampUpPlanId('');

      if (pendingReschedule.toSchedule.length > 0 && pendingReschedule.afterOrderId === order.id && pendingReschedule.lineId) {
        const newPlanEnd: Date | null = endDate;
        let magnetDate = new Date(newPlanEnd);
        const newOrderLastDayStr = magnetDate.toISOString().split('T')[0];
        const lineObj = productionLines.find(l => l.id === pendingReschedule.lineId);
        
        // Calculate available capacity on the last day of the newly scheduled order
        const existingOrdersOnLastDay = getOrdersForCell(pendingReschedule.lineId, magnetDate);
        const usedCapacityOnLastDay = existingOrdersOnLastDay.reduce(
          (sum, ord) => sum + (ord.actualProduction?.[newOrderLastDayStr] || 0), 0
        );
        const lastDayAvailCapacity = lineObj ? Math.max(0, lineObj.capacity - usedCapacityOnLastDay) : 0;

        for (const [i, next] of pendingReschedule.toSchedule.entries()) {
          if (!lineObj) continue;

          const qty = next.orderQuantity;
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
      {/* Search Bar and Date Filter */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search Bar */}
          <div className="flex-1 min-w-64 max-w-md">
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
          
          {/* Year Selection */}
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-gray-700 whitespace-nowrap">Years:</Label>
            <div className="flex flex-wrap gap-2 max-w-80">
              {availableYears.map(year => (
                <div key={year} className="flex items-center space-x-2">
                  <Checkbox
                    id={`year-${year}`}
                    checked={selectedYears.includes(year)}
                    onCheckedChange={() => handleYearToggle(year)}
                  />
                  <Label htmlFor={`year-${year}`} className="text-sm font-medium cursor-pointer">
                    {year}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Month Selection */}
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-gray-700 whitespace-nowrap">Months:</Label>
            <div className="flex flex-wrap gap-2 max-w-96">
              {availableMonths.map(month => (
                <div key={month.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`month-${month.value}`}
                    checked={selectedMonths.includes(month.value)}
                    onCheckedChange={() => handleMonthToggle(month.value)}
                  />
                  <Label htmlFor={`month-${month.value}`} className="text-sm font-medium cursor-pointer whitespace-nowrap">
                    {month.label.slice(0, 3)}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Selected date range info */}
        {dates.length > 0 && (
          <div className="mt-3 text-sm text-gray-600">
            Showing {dates.length} days from {dates[0].toLocaleDateString()} to {dates[dates.length - 1].toLocaleDateString()}
          </div>
        )}
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
          {/* Header Row - Dates horizontally */}
          <div className="sticky top-0 z-30 bg-white border-b-2 border-gray-200 shadow-sm flex">
            {/* Line Names Header */}
            <div className="sticky left-0 z-40 w-48 bg-white border-r-2 border-gray-300 shadow-lg">
              <div className="h-16 p-3 flex items-center justify-center bg-gradient-to-r from-blue-50 to-blue-100 border-r border-gray-300">
                <div className="flex items-center space-x-2">
                  <CalendarDays className="h-5 w-5 text-blue-600" />
                  <span className="font-bold text-sm text-gray-800">Production Lines</span>
                </div>
              </div>
            </div>

            {/* Temp Hold Header */}
            <div className="sticky left-48 z-40 w-24 bg-white border-r-2 border-gray-300 shadow-lg">
              <div className="h-16 p-2 flex items-center justify-center bg-gradient-to-r from-amber-50 to-amber-100 border-r border-gray-300">
                <div className="flex flex-col items-center space-y-1">
                  <Package className="h-3 w-3 text-amber-600" />
                  <span className="font-bold text-xs text-gray-800">Hold</span>
                </div>
              </div>
            </div>
            
            {/* Date Headers - Horizontally */}
            <div className="flex">
              {dates.map(date => (
                <div
                  key={date.toISOString()}
                  className={`w-32 h-16 p-2 border-r border-gray-200 flex flex-col justify-center items-center text-center ${
                    isHoliday(date) ? 'bg-red-50 border-red-200' : 'bg-white'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className="text-sm font-bold text-gray-800 mt-1">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  {isHoliday(date) && (
                    <div className="text-xs text-red-600 font-semibold mt-1">Holiday</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Production Line Rows - Vertically */}
          {productionLines.map(line => (
            <div key={line.id} className="flex border-b border-gray-200">
              {/* Line Header - Vertical */}
              <div className="sticky left-0 z-20 w-48 bg-white border-r-2 border-gray-300 shadow-md">
                <div className="h-24 p-2 flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100">
                  <div className="flex-1 space-y-1">
                    <div className="font-bold text-gray-800 text-sm">{line.name}</div>
                    <div className="text-xs text-gray-600">
                      Capacity: <span className="font-semibold text-gray-800">{line.capacity}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-2 text-xs h-6 w-6 p-0 flex items-center justify-center border-gray-300 hover:bg-blue-50 hover:border-blue-300"
                    onClick={() => handleDownloadLinePdf(line.id, line.name)}
                    title="Download Production Plan PDF"
                  >
                    <FileDown className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Temporary Hold Area for this line */}
              <div className="sticky left-48 z-20 w-24 border-r-2 border-gray-300 bg-white shadow-md">
                <div
                  className="h-24 bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200 border-dashed relative overflow-hidden p-1"
                  onDrop={(e) => handleTempHoldDrop(e, line.id)}
                  onDragOver={handleDragOver}
                >
                  <div className="h-full flex flex-col gap-0.5 overflow-y-auto">
                    {(tempHoldOrders[line.id] || []).map((order, index) => (
                      <div
                        key={`temp-${order.id}-${index}`}
                        className="bg-amber-200 border border-amber-300 rounded p-1 text-xs cursor-move relative group"
                        draggable
                        onDragStart={(e) => handleOrderDragStart(e, order)}
                        onDragEnd={handleOrderDragEnd}
                      >
                        <div className="font-semibold text-amber-800 truncate text-xs">{order.poNumber}</div>
                        <button
                          onClick={() => handleRemoveFromTempHold(order.id, line.id)}
                          className="absolute top-0 right-0 w-3 h-3 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          title="Remove from temp hold"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {(tempHoldOrders[line.id] || []).length === 0 && (
                      <div className="h-full flex items-center justify-center text-amber-600 text-xs text-center">
                        Drop
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Date Cells for this Line - Horizontally */}
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
                      className={`w-32 h-24 border-r border-gray-200 relative transition-all duration-200 ${
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
                          <Plus className="h-4 w-4 text-gray-400" />
                        </div>
                      )}

                      {/* Available Capacity Badge */}
                      {!isHolidayCell && availableCapacity > 0 && ordersInCell.length > 0 && (
                        <div className="absolute top-1 right-1 text-xs bg-green-100 text-green-700 px-1 py-0.5 rounded font-semibold shadow-sm">
                          {availableCapacity}
                        </div>
                      )}

                      {/* Drop Highlight */}
                      {isHighlighted && !isHolidayCell && (
                        <div className="absolute inset-0 flex items-center justify-center bg-blue-50 border-2 border-blue-300 border-dashed rounded-sm">
                          <div className="text-xs font-semibold text-blue-600 bg-white px-2 py-1 rounded shadow-sm">
                            Drop
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
                            const availableHeight = 88; // 96px - 8px padding
                            const minCardHeight = 20; // Minimum height to show order info
                            const idealCardHeight = Math.max(minCardHeight, Math.floor(availableHeight / cardCount) - 2);
                            const cardHeight = cardCount > 3 ? minCardHeight : idealCardHeight;

                            return (
                              <div
                                key={cardKey}
                                style={{
                                  height: hoveredCard === cardKey ? 'auto' : `${cardHeight}px`,
                                  minHeight: hoveredCard === cardKey ? '60px' : `${cardHeight}px`,
                                  maxHeight: hoveredCard === cardKey ? '120px' : `${cardHeight}px`
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
                                  onOrderSplit={onOrderSplit}
                                  onOrderBlockDrop={handleOrderBlockDrop}
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
      
      {/* Drop Position Choice Dialog */}
      <DropPositionChoiceDialog
        isOpen={dropPositionDialog.isOpen}
        onClose={() => setDropPositionDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleDropPositionConfirm}
        draggedOrder={dropPositionDialog.draggedOrder}
        targetOrder={dropPositionDialog.targetOrder}
        targetDate={dropPositionDialog.targetDate}
        targetLine={dropPositionDialog.targetLine}
      />
    </div>
  );
};


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
  }>({
    isOpen: false,
    newOrder: null,
    overlappingOrders: [],
    targetDate: null,
    targetLine: ''
  });
  
  const [planningMethod, setPlanningMethod] = useState<'capacity' | 'rampup'>('capacity');
  const [selectedRampUpPlanId, setSelectedRampUpPlanId] = useState<string>('');
  const [dragHighlight, setDragHighlight] = useState<string | null>(null);

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
    
    return line.capacity - totalUsed;
  }, [productionLines, getOrdersForCell]);

  const checkForOverlaps = useCallback((newOrder: Order, targetLineId: string, targetDate: Date) => {
    const line = productionLines.find(l => l.id === targetLineId);
    if (!line) return [];

    // Calculate how many days the new order would need
    const dailyCapacity = line.capacity;
    const totalDays = Math.ceil(newOrder.orderQuantity / dailyCapacity);
    
    const overlappingOrders: Order[] = [];
    const newOrderEndDate = new Date(targetDate);
    newOrderEndDate.setDate(newOrderEndDate.getDate() + totalDays - 1);

    // Check for existing scheduled orders in the date range
    orders.forEach(order => {
      if (order.status === 'scheduled' && 
          order.assignedLineId === targetLineId && 
          order.id !== newOrder.id &&
          order.planStartDate && order.planEndDate) {
        
        const existingStart = new Date(order.planStartDate);
        const existingEnd = new Date(order.planEndDate);
        
        // Check if date ranges overlap
        if (targetDate <= existingEnd && newOrderEndDate >= existingStart) {
          overlappingOrders.push(order);
        }
      }
    });

    return overlappingOrders;
  }, [orders, productionLines]);

  // Calculate daily production with capacity sharing
  const calculateDailyProductionWithSharing = useCallback((order: Order, line: ProductionLine, startDate: Date) => {
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);
    let workingDayNumber = 1;

    const rampUpPlan = rampUpPlans.find(p => p.id === selectedRampUpPlanId);

    while (remainingQty > 0) {
      const isWorkingDay = !isHoliday(currentDate);
      
      if (isWorkingDay) {
        // Get available capacity for this date
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

  // Move orders for placement function
  const moveOrdersForPlacement = useCallback(async (newOrder: Order, targetLineId: string, targetDate: Date, placement: 'before' | 'after', overlappingOrders: Order[]) => {
    console.log(`📋 Moving orders for ${placement} placement`);
    
    if (placement === 'before') {
      // Move overlapping orders to pending, they'll be rescheduled after new order
      for (const order of overlappingOrders) {
        await onOrderMovedToPending(order);
      }
      
      // Set up new order for immediate scheduling
      setScheduleDialog({
        isOpen: true,
        order: newOrder,
        lineId: targetLineId,
        startDate: targetDate
      });
      
    } else {
      // Find the latest end date among overlapping orders
      let latestEndDate = targetDate;
      overlappingOrders.forEach(order => {
        if (order.planEndDate && order.planEndDate > latestEndDate) {
          latestEndDate = order.planEndDate;
        }
      });
      
      // Schedule new order to start the day after
      const newStartDate = new Date(latestEndDate);
      newStartDate.setDate(newStartDate.getDate() + 1);
      
      setScheduleDialog({
        isOpen: true,
        order: newOrder,
        lineId: targetLineId,
        startDate: newStartDate
      });
    }
  }, [onOrderMovedToPending]);

  // Helper function to check if a date is in the current week
  const isCurrentWeek = useCallback((date: Date) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return date >= startOfWeek && date <= endOfWeek;
  }, []);

  // Check if order should be highlighted in red
  const shouldHighlightRed = useCallback((order: Order, date: Date) => {
    return order.cutQuantity === 0 && 
           order.planStartDate && 
           isCurrentWeek(order.planStartDate) &&
           date.toDateString() === order.planStartDate.toDateString();
  }, [isCurrentWeek]);

  // Drag and drop handlers
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
    e.preventDefault();
    setDragHighlight(null);
    
    if (isHoliday(date)) return;

    try {
      const orderData = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (orderData && orderData.id && orderData.poNumber) {
        console.log('📋 Scheduling order:', orderData.poNumber, 'on line:', lineId, 'date:', date.toDateString());
        
        // Check for overlaps
        const overlappingOrders = checkForOverlaps(orderData, lineId, date);
        const lineName = productionLines.find(l => l.id === lineId)?.name || 'Unknown Line';
        
        if (overlappingOrders.length > 0) {
          setOverlapDialog({
            isOpen: true,
            newOrder: orderData,
            overlappingOrders,
            targetDate: date,
            targetLine: lineName
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
  }, [isHoliday, checkForOverlaps, productionLines]);

  const handleScheduleConfirm = useCallback(async () => {
    const { order, lineId, startDate } = scheduleDialog;
    
    if (!order || !lineId || !startDate) {
      console.log('⚠️ Missing required scheduling data');
      return;
    }

    const selectedLine = productionLines.find(l => l.id === lineId);
    if (!selectedLine) {
      console.log('❌ Selected line not found');
      return;
    }

    if (planningMethod === 'rampup' && !selectedRampUpPlanId) {
      console.log('⚠️ Ramp-up plan required but not selected');
      return;
    }

    try {
      console.log('✅ Confirming schedule for:', order.poNumber);
      
      const dailyPlan = calculateDailyProductionWithSharing(order, selectedLine, startDate);
      const planDates = Object.keys(dailyPlan);
      const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
      
      const updatedOrder = { ...order, assignedLineId: lineId };
      
      await onOrderScheduled(updatedOrder, startDate, endDate, dailyPlan);
      
      setScheduleDialog({ isOpen: false, order: null, lineId: '', startDate: null });
      setPlanningMethod('capacity');
      setSelectedRampUpPlanId('');
      
    } catch (error) {
      console.error('❌ Failed to schedule order:', error);
    }
  }, [scheduleDialog, productionLines, planningMethod, selectedRampUpPlanId, calculateDailyProductionWithSharing, onOrderScheduled]);

  const handleOverlapConfirm = useCallback(async (placement: 'before' | 'after') => {
    const { newOrder, overlappingOrders, targetDate, targetLine } = overlapDialog;
    
    if (!newOrder || !targetDate) return;

    try {
      const lineId = productionLines.find(l => l.name === targetLine)?.id;
      if (!lineId) return;

      await moveOrdersForPlacement(newOrder, lineId, targetDate, placement, overlappingOrders);
      
      setOverlapDialog({
        isOpen: false,
        newOrder: null,
        overlappingOrders: [],
        targetDate: null,
        targetLine: ''
      });
    } catch (error) {
      console.error('❌ Failed to handle overlap:', error);
    }
  }, [overlapDialog, productionLines, moveOrdersForPlacement]);

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
    console.log('🏁 Drag ended for scheduled order');
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  return (
    <div className="flex-1 overflow-auto bg-background">
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
                    
                    {/* Multiple orders in same cell - stacked vertically */}
                    <div className="p-1 space-y-1 relative z-10 h-full flex flex-col">
                      {ordersInCell.map((scheduledOrder, index) => {
                        const dateStr = date.toISOString().split('T')[0];
                        const dailyQty = scheduledOrder.actualProduction?.[dateStr] || 0;
                        const shouldHighlight = shouldHighlightRed(scheduledOrder, date);
                        const orderUtilization = (dailyQty / line.capacity) * 100;
                        
                        return (
                          <div 
                            key={`${scheduledOrder.id}-${dateStr}`}
                            className={`rounded text-xs p-1 group cursor-move transition-colors flex-1 min-h-[60px] ${
                              shouldHighlight 
                                ? 'bg-red-100 border-2 border-red-500 text-red-800' 
                                : index % 2 === 0
                                  ? 'bg-blue-100 border border-blue-300 text-blue-800'
                                  : 'bg-green-100 border border-green-300 text-green-800'
                            }`}
                            draggable
                            onDragStart={(e) => handleOrderDragStart(e, scheduledOrder)}
                            onDragEnd={handleOrderDragEnd}
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

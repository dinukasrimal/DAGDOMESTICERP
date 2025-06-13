
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { CalendarDays, Plus, ArrowLeft, Scissors } from 'lucide-react';

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
  const [draggedOrder, setDraggedOrder] = useState<Order | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string>('');
  const [selectedRampUpPlanId, setSelectedRampUpPlanId] = useState<string>('');
  const [planningMethod, setPlanningMethod] = useState<'capacity' | 'rampup'>('capacity');
  const [orderToSplit, setOrderToSplit] = useState<Order | null>(null);
  const [splitQuantity, setSplitQuantity] = useState<number>(0);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  // Generate date range (next 30 days)
  const generateDateRange = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const dates = generateDateRange();

  const calculateDailyProduction = (order: Order, line: ProductionLine, startDate: Date, method: 'capacity' | 'rampup', rampUpPlanId?: string) => {
    const dailyPlan: { [date: string]: number } = {};
    let remainingQty = order.orderQuantity;
    let currentDate = new Date(startDate);
    let workingDayNumber = 1;

    const rampUpPlan = rampUpPlans.find(p => p.id === rampUpPlanId);

    while (remainingQty > 0) {
      const isHoliday = holidays.some(h => 
        h.date.toDateString() === currentDate.toDateString()
      );
      
      if (!isHoliday) {
        let dailyCapacity = 0;
        
        if (method === 'capacity') {
          dailyCapacity = line.capacity;
        } else if (method === 'rampup' && rampUpPlan) {
          const baseCapacity = (540 * order.moCount) / order.smv;
          let efficiency = rampUpPlan.finalEfficiency;
          
          const rampUpDay = rampUpPlan.efficiencies.find(e => e.day === workingDayNumber);
          if (rampUpDay) {
            efficiency = rampUpDay.efficiency;
          }
          
          dailyCapacity = Math.floor((baseCapacity * efficiency) / 100);
        }

        const plannedQty = Math.min(remainingQty, dailyCapacity);
        if (plannedQty > 0) {
          dailyPlan[currentDate.toISOString().split('T')[0]] = plannedQty;
          remainingQty -= plannedQty;
        }
        workingDayNumber++;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Safety break to prevent infinite loops
      if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) {
        break;
      }
    }

    return dailyPlan;
  };

  const handleDragStart = (e: React.DragEvent, order: Order) => {
    console.log('Drag started for order:', order.poNumber);
    setDraggedOrder(order);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', order.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    const cellKey = `${lineId}-${date.toISOString().split('T')[0]}`;
    setDragOverCell(cellKey);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // Only clear if we're actually leaving the cell
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCell(null);
    }
  };

  const handleDrop = (e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    console.log('Drop event - Line:', lineId, 'Date:', date.toDateString());
    setDragOverCell(null);
    
    if (draggedOrder) {
      console.log('Opening schedule dialog for:', draggedOrder.poNumber);
      setSelectedLineId(lineId);
      setSelectedDate(date);
      setShowScheduleDialog(true);
    }
  };

  const handleScheduleConfirm = async () => {
    if (!draggedOrder || !selectedDate || !selectedLineId) {
      console.log('Missing required data for scheduling');
      return;
    }

    const selectedLine = productionLines.find(l => l.id === selectedLineId);
    if (!selectedLine) {
      console.log('Selected line not found');
      return;
    }

    console.log('Confirming schedule for order:', draggedOrder.poNumber);

    const dailyPlan = calculateDailyProduction(
      draggedOrder, 
      selectedLine, 
      selectedDate, 
      planningMethod, 
      selectedRampUpPlanId
    );

    const planDates = Object.keys(dailyPlan);
    const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
    
    const updatedOrder = {
      ...draggedOrder,
      assignedLineId: selectedLineId
    };
    
    try {
      await onOrderScheduled(updatedOrder, selectedDate, endDate, dailyPlan);
      setShowScheduleDialog(false);
      setDraggedOrder(null);
      setSelectedRampUpPlanId('');
      setPlanningMethod('capacity');
      setSelectedDate(null);
      setSelectedLineId('');
    } catch (error) {
      console.error('Failed to schedule order:', error);
    }
  };

  const handleMoveBackToPending = (order: Order) => {
    onOrderMovedToPending(order);
  };

  const handleSplitOrder = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrderToSplit(order);
    setSplitQuantity(Math.floor(order.orderQuantity / 2));
    setShowSplitDialog(true);
  };

  const handleSplitConfirm = () => {
    if (orderToSplit && splitQuantity > 0 && splitQuantity < orderToSplit.orderQuantity) {
      onOrderSplit(orderToSplit.id, splitQuantity);
      setShowSplitDialog(false);
      setOrderToSplit(null);
      setSplitQuantity(0);
    }
  };

  const isHoliday = (date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  };

  const getScheduledOrdersForLineAndDate = (lineId: string, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return orders.filter(order => 
      order.status === 'scheduled' &&
      order.planStartDate &&
      order.planEndDate &&
      order.assignedLineId === lineId &&
      date >= order.planStartDate &&
      date <= order.planEndDate &&
      order.actualProduction &&
      order.actualProduction[dateStr] > 0
    );
  };

  const getDailyPlannedQuantity = (order: Order, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return order.actualProduction?.[dateStr] || 0;
  };

  const getCapacityUtilization = (lineId: string, date: Date) => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) return 0;
    
    const scheduledOrders = getScheduledOrdersForLineAndDate(lineId, date);
    const totalPlanned = scheduledOrders.reduce((sum, order) => 
      sum + getDailyPlannedQuantity(order, date), 0
    );
    
    return Math.min((totalPlanned / line.capacity) * 100, 100);
  };

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

        {/* Production lines and timeline */}
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
                const utilizationPercent = getCapacityUtilization(line.id, date);
                const cellKey = `${line.id}-${date.toISOString().split('T')[0]}`;
                const isDragOver = dragOverCell === cellKey;
                const scheduledOrders = getScheduledOrdersForLineAndDate(line.id, date);
                
                return (
                  <div
                    key={cellKey}
                    className={`w-32 min-h-[80px] border-r border-border relative transition-all duration-200 ${
                      isHoliday(date) 
                        ? 'bg-muted/50' 
                        : isDragOver 
                          ? 'bg-primary/20 border-primary border-2' 
                          : 'bg-background hover:bg-muted/20'
                    }`}
                    onDrop={(e) => handleDrop(e, line.id, date)}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, line.id, date)}
                    onDragLeave={handleDragLeave}
                  >
                    {/* Capacity utilization bar */}
                    {utilizationPercent > 0 && (
                      <div 
                        className="absolute bottom-0 left-0 right-0 bg-primary/30 transition-all duration-300"
                        style={{ height: `${Math.min(utilizationPercent, 100)}%` }}
                      />
                    )}
                    
                    {/* Drop zone indicator */}
                    {!isHoliday(date) && !scheduledOrders.length && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* Drag over indicator */}
                    {isDragOver && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">
                          Drop Here
                        </div>
                      </div>
                    )}
                    
                    {/* Scheduled orders */}
                    <div className="p-1 space-y-1">
                      {scheduledOrders.map((scheduledOrder) => {
                        const dailyQty = getDailyPlannedQuantity(scheduledOrder, date);
                        return (
                          <div 
                            key={scheduledOrder.id} 
                            className="bg-primary/20 rounded text-xs p-1 text-primary group cursor-pointer hover:bg-primary/30 transition-colors"
                            draggable
                            onDragStart={(e) => handleDragStart(e, scheduledOrder)}
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate text-xs">{scheduledOrder.poNumber}</span>
                              <div className="opacity-0 group-hover:opacity-100 flex space-x-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-4 w-4 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveBackToPending(scheduledOrder);
                                  }}
                                  title="Move back to pending"
                                >
                                  <ArrowLeft className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-4 w-4 p-0"
                                  onClick={(e) => handleSplitOrder(scheduledOrder, e)}
                                  title="Split order"
                                >
                                  <Scissors className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="text-xs opacity-60">
                              Qty: {dailyQty.toLocaleString()}
                            </div>
                            <div className="text-xs opacity-60">
                              {utilizationPercent.toFixed(0)}% used
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

      {/* Schedule Order Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Order</DialogTitle>
          </DialogHeader>
          {draggedOrder && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">{draggedOrder.poNumber}</h3>
                <p className="text-sm text-muted-foreground">
                  Quantity: {draggedOrder.orderQuantity.toLocaleString()} | SMV: {draggedOrder.smv} | MO: {draggedOrder.moCount}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Start Date:</label>
                <div className="text-sm">
                  {selectedDate?.toLocaleDateString()}
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Production Line:</label>
                <div className="text-sm">
                  {productionLines.find(l => l.id === selectedLineId)?.name}
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
              
              <div className="flex space-x-2">
                <Button
                  onClick={handleScheduleConfirm}
                  disabled={planningMethod === 'rampup' && !selectedRampUpPlanId}
                  className="flex-1"
                >
                  Schedule Order
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowScheduleDialog(false);
                    setDraggedOrder(null);
                    setSelectedDate(null);
                    setSelectedLineId('');
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Split Order Dialog */}
      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split Order</DialogTitle>
          </DialogHeader>
          {orderToSplit && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">{orderToSplit.poNumber}</h3>
                <p className="text-sm text-muted-foreground">
                  Total Quantity: {orderToSplit.orderQuantity.toLocaleString()}
                </p>
              </div>
              
              <div>
                <Label htmlFor="splitQty">Split Quantity</Label>
                <Input
                  id="splitQty"
                  type="number"
                  value={splitQuantity}
                  onChange={(e) => setSplitQuantity(parseInt(e.target.value) || 0)}
                  min={1}
                  max={orderToSplit.orderQuantity - 1}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Remaining: {orderToSplit.orderQuantity - splitQuantity}
                </p>
              </div>
              
              <div className="flex space-x-2">
                <Button
                  onClick={handleSplitConfirm}
                  disabled={splitQuantity <= 0 || splitQuantity >= orderToSplit.orderQuantity}
                  className="flex-1"
                >
                  Split Order
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSplitDialog(false);
                    setOrderToSplit(null);
                    setSplitQuantity(0);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

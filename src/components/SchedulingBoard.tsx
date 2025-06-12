
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { CalendarDays, Plus, ArrowLeft, Scissors } from 'lucide-react';

interface SchedulingBoardProps {
  orders: Order[];
  productionLines: ProductionLine[];
  holidays: Holiday[];
  rampUpPlans: RampUpPlan[];
  onOrderScheduled: (order: Order, startDate: Date, endDate: Date) => Promise<void>;
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedLineId, setSelectedLineId] = useState<string>('');
  const [selectedRampUpPlanId, setSelectedRampUpPlanId] = useState<string>('');
  const [orderToSplit, setOrderToSplit] = useState<Order | null>(null);
  const [splitQuantity, setSplitQuantity] = useState<number>(0);

  // Generate date range (next 30 days for demo)
  const generateDateRange = () => {
    const dates = [];
    const startDate = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const dates = generateDateRange();

  const handleDrop = (e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    const orderData = e.dataTransfer.getData('application/json');
    if (orderData) {
      const order = JSON.parse(orderData) as Order;
      setDraggedOrder(order);
      setSelectedLineId(lineId);
      setSelectedDate(date);
      setShowScheduleDialog(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleScheduleConfirm = async () => {
    if (draggedOrder && selectedDate && selectedLineId && selectedRampUpPlanId) {
      // Calculate end date based on order requirements
      const endDate = new Date(selectedDate);
      endDate.setDate(selectedDate.getDate() + 7); // Default 7 days duration
      
      await onOrderScheduled(draggedOrder, selectedDate, endDate);
      setShowScheduleDialog(false);
      setDraggedOrder(null);
      setSelectedRampUpPlanId('');
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

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const isHoliday = (date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  };

  const getScheduledOrdersForLineAndDate = (lineId: string, date: Date) => {
    return orders.filter(order => 
      order.status === 'scheduled' &&
      order.planStartDate &&
      order.planEndDate &&
      date >= order.planStartDate &&
      date <= order.planEndDate
    );
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
                  isWeekend(date) || isHoliday(date) ? 'bg-muted' : 'bg-card'
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
              {dates.map((date) => (
                <div
                  key={`${line.id}-${date.toISOString()}`}
                  className={`w-32 h-20 border-r border-border relative ${
                    isWeekend(date) || isHoliday(date) 
                      ? 'bg-muted/50' 
                      : 'bg-background hover:bg-muted/20'
                  }`}
                  onDrop={(e) => handleDrop(e, line.id, date)}
                  onDragOver={handleDragOver}
                >
                  {!isWeekend(date) && !isHoliday(date) && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Render scheduled order slots */}
                  {getScheduledOrdersForLineAndDate(line.id, date).map((scheduledOrder) => (
                    <div 
                      key={scheduledOrder.id} 
                      className="absolute inset-1 bg-primary/20 rounded text-xs p-1 text-primary group cursor-pointer hover:bg-primary/30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{scheduledOrder.poNumber}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex space-x-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-4 w-4 p-0"
                            onClick={() => handleMoveBackToPending(scheduledOrder)}
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
                        Qty: {scheduledOrder.orderQuantity.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
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
                  Quantity: {draggedOrder.orderQuantity.toLocaleString()} | SMV: {draggedOrder.smv}
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
              
              <div className="flex space-x-2">
                <Button
                  onClick={handleScheduleConfirm}
                  disabled={!selectedRampUpPlanId}
                  className="flex-1"
                >
                  Schedule Order
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowScheduleDialog(false)}
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
                  onClick={() => setShowSplitDialog(false)}
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

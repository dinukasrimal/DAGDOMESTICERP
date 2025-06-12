
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Calendar } from './ui/calendar';
import { Order, ProductionLine, Holiday, RampUpPlan, ScheduledOrder } from '../types/scheduler';
import { OrderSlot } from './OrderSlot';
import { CalendarDays, Plus } from 'lucide-react';

interface SchedulingBoardProps {
  productionLines: ProductionLine[];
  scheduledOrders: any[];
  holidays: Holiday[];
  rampUpPlans: RampUpPlan[];
  onOrderSchedule: (order: Order, lineId: string, startDate: Date, rampUpPlanId: string) => void;
  onScheduledOrdersChange: (orders: any[]) => void;
}

export const SchedulingBoard: React.FC<SchedulingBoardProps> = ({
  productionLines,
  scheduledOrders,
  holidays,
  rampUpPlans,
  onOrderSchedule,
  onScheduledOrdersChange
}) => {
  const [draggedOrder, setDraggedOrder] = useState<Order | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedLineId, setSelectedLineId] = useState<string>('');
  const [selectedRampUpPlanId, setSelectedRampUpPlanId] = useState<string>('');

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

  const handleScheduleConfirm = () => {
    if (draggedOrder && selectedDate && selectedLineId && selectedRampUpPlanId) {
      onOrderSchedule(draggedOrder, selectedLineId, selectedDate, selectedRampUpPlanId);
      setShowScheduleDialog(false);
      setDraggedOrder(null);
      setSelectedRampUpPlanId('');
    }
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const isHoliday = (date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  };

  const getOrdersForLineAndDate = (lineId: string, date: Date) => {
    return scheduledOrders.filter(order => 
      order.lineId === lineId &&
      date >= order.startDate &&
      date <= order.endDate
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
                  {getOrdersForLineAndDate(line.id, date).map((scheduledOrder) => (
                    <OrderSlot
                      key={scheduledOrder.id}
                      scheduledOrder={scheduledOrder}
                      date={date}
                    />
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
    </div>
  );
};

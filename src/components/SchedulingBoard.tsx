import React, { useState, useCallback } from 'react';
import { Order, ProductionLine, Holiday, RampUpPlan, ScheduledOrder } from '../types/scheduler';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

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
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedRampUpPlanId, setSelectedRampUpPlanId] = useState('');

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
  };

  const isHoliday = (date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  };

  const isNonWorkingDay = (date: Date) => {
    return isWeekend(date) || isHoliday(date);
  };

  const getScheduledOrdersForLineAndDate = (lineId: string, date: Date): Order[] => {
    // Find orders that are scheduled on the specified line and date
    return orders.filter(order =>
      order.assignedLineId === lineId &&
      order.planStartDate &&
      order.planEndDate &&
      date >= order.planStartDate &&
      date <= order.planEndDate
    );
  };

  const getDailyPlannedQuantity = (scheduledOrder: Order, date: Date): number => {
    const dateStr = date.toISOString().split('T')[0];
    return scheduledOrder.actualProduction[dateStr] || 0;
  };

  const handleDragOver = (e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    setSelectedLineId(lineId);
    setSelectedDate(date);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setSelectedLineId(null);
    setSelectedDate(null);
  };

  const handleScheduleOrder = async () => {
    if (!draggedOrder || !selectedLineId || !selectedDate || !selectedRampUpPlanId) return;

    try {
      const line = productionLines.find(l => l.id === selectedLineId);
      const rampUpPlan = rampUpPlans.find(r => r.id === selectedRampUpPlanId);
      
      if (!line || !rampUpPlan) return;

      // Calculate daily production plan
      const dailyPlan: { [date: string]: number } = {};
      const totalQuantity = draggedOrder.orderQuantity;
      const dailyCapacity = line.capacity;
      
      let remainingQuantity = totalQuantity;
      let currentDate = new Date(selectedDate);
      let dayCount = 1;
      
      while (remainingQuantity > 0) {
        // Skip weekends and holidays
        if (!isNonWorkingDay(currentDate)) {
          const efficiency = rampUpPlan.efficiencies.find(e => e.day === dayCount)?.efficiency || rampUpPlan.finalEfficiency;
          const effectiveCapacity = Math.floor(dailyCapacity * (efficiency / 100));
          const dailyProduction = Math.min(remainingQuantity, effectiveCapacity);
          
          const dateStr = currentDate.toISOString().split('T')[0];
          dailyPlan[dateStr] = dailyProduction;
          
          remainingQuantity -= dailyProduction;
          dayCount++;
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Find the actual end date (last working day with production)
      const planDates = Object.keys(dailyPlan);
      const endDate = new Date(Math.max(...planDates.map(d => new Date(d).getTime())));
      
      // Create updated order with line assignment
      const updatedOrder = {
        ...draggedOrder,
        assignedLineId: selectedLineId  // Store which line this order is assigned to
      };
      
      await onOrderScheduled(updatedOrder, selectedDate, endDate, dailyPlan);
      setShowScheduleDialog(false);
      setDraggedOrder(null);
      setSelectedRampUpPlanId('');
    } catch (error) {
      console.error('Failed to schedule order:', error);
    }
  };

  const handleDrop = (e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    const orderData = e.dataTransfer.getData('application/json');
    const order: Order = JSON.parse(orderData);

    setDraggedOrder(order);
    setSelectedLineId(lineId);
    setSelectedDate(date);
    setShowScheduleDialog(true);
  };

  const renderCalendarHeader = () => {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    
    const dates = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }

    return (
      <div className="flex sticky top-0 z-20 bg-background border-b border-border">
        <div className="w-48 p-4 border-r border-border bg-card sticky left-0 z-30">
          {/* Empty div for the line name column */}
        </div>
        <div className="flex overflow-x-auto">
          {dates.map((date) => (
            <div
              key={date.toISOString()}
              className="min-w-[120px] h-12 p-2 border-r border-border sticky top-0 z-10 bg-background"
            >
              <div className="text-xs text-muted-foreground">
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="text-xs text-muted-foreground">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              {isNonWorkingDay(date) && (
                <div className="text-xs text-red-600 font-medium">
                  {isWeekend(date) ? 'Weekend' : 'Holiday'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderProductionLine = (line: ProductionLine) => {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    
    const dates = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }

    return (
      <div key={line.id} className="border-b border-border">
        <div className="flex">
          <div className="w-48 p-4 border-r border-border bg-card sticky left-0 z-10">
            <h3 className="font-semibold text-foreground">{line.name}</h3>
            <p className="text-sm text-muted-foreground">Capacity: {line.capacity}/day</p>
          </div>
          
          <div className="flex overflow-x-auto">
            {dates.map((date) => (
              <div
                key={date.toISOString()}
                className={`min-w-[120px] h-24 border-r border-border relative
                  ${isNonWorkingDay(date) ? 'bg-red-50' : 'bg-background'}
                  hover:bg-accent/50 transition-colors`}
                onDragOver={(e) => handleDragOver(e, line.id, date)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, line.id, date)}
              >
                <div className="p-2">
                  <div className="text-xs text-muted-foreground">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  
                  {isNonWorkingDay(date) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-red-600 font-medium">
                        {isWeekend(date) ? 'Weekend' : 'Holiday'}
                      </span>
                    </div>
                  )}
                  
                  {/* Render scheduled order slots - ONLY for this specific line */}
                  {getScheduledOrdersForLineAndDate(line.id, date).map((scheduledOrder) => {
                    const dailyQty = getDailyPlannedQuantity(scheduledOrder, date);
                    return (
                      <div
                        key={`${scheduledOrder.id}-${date.toISOString()}`}
                        className="absolute inset-1 bg-blue-100 border border-blue-300 rounded p-1 cursor-pointer hover:bg-blue-200 transition-colors"
                        onClick={() => {
                          console.log('Order clicked:', scheduledOrder.poNumber);
                          // Add context menu or modal for order details
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onOrderMovedToPending(scheduledOrder);
                        }}
                      >
                        <div className="text-xs font-medium text-blue-800 truncate">
                          {scheduledOrder.poNumber}
                        </div>
                        <div className="text-xs text-blue-600">
                          {dailyQty.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-background">
      {renderCalendarHeader()}
      
      <div className="border border-border rounded-lg overflow-hidden">
        {productionLines.map(renderProductionLine)}
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
                <h4 className="font-medium">Order Details</h4>
                <p>PO Number: {draggedOrder.poNumber}</p>
                <p>Style: {draggedOrder.styleId}</p>
                <p>Quantity: {draggedOrder.orderQuantity.toLocaleString()}</p>
                <p>SMV: {draggedOrder.smv}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Select Ramp-up Plan:
                </label>
                <select
                  value={selectedRampUpPlanId}
                  onChange={(e) => setSelectedRampUpPlanId(e.target.value)}
                  className="w-full p-2 border border-border rounded-md bg-background"
                >
                  <option value="">Select a plan...</option>
                  {rampUpPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} (Final: {plan.finalEfficiency}%)
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleScheduleOrder} disabled={!selectedRampUpPlanId}>
                  Schedule Order
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

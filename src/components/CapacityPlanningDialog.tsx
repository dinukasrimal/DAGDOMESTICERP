
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Order } from '../types/scheduler';
import { ProductionLine } from '../types/adminPanel';
import { format } from 'date-fns';

interface CapacityPlanningDialogProps {
  isOpen: boolean;
  order?: Order;
  line?: ProductionLine;
  startDate?: Date;
  endDate?: Date;
  dailyPlan?: { [date: string]: number };
  onConfirm: () => void;
  onCancel: () => void;
  overlappingOrders?: string[];
}

export const CapacityPlanningDialog: React.FC<CapacityPlanningDialogProps> = ({
  isOpen,
  order,
  line,
  startDate,
  endDate,
  dailyPlan,
  onConfirm,
  onCancel,
  overlappingOrders
}) => {
  if (!order || !line || !startDate || !endDate || !dailyPlan) {
    return null;
  }

  const totalPlannedQuantity = Object.values(dailyPlan).reduce((sum, qty) => sum + qty, 0);
  const planDates = Object.keys(dailyPlan).sort();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Capacity Planning - {order.poNumber}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground">Order Details</h3>
              <p><strong>PO Number:</strong> {order.poNumber}</p>
              <p><strong>Quantity:</strong> {order.orderQuantity}</p>
              <p><strong>Line:</strong> {line.name}</p>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground">Schedule</h3>
              <p><strong>Start:</strong> {format(startDate, 'MMM d, yyyy')}</p>
              <p><strong>End:</strong> {format(endDate, 'MMM d, yyyy')}</p>
              <p><strong>Duration:</strong> {planDates.length} days</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm text-muted-foreground mb-2">Daily Production Plan</h3>
            <div className="max-h-32 overflow-y-auto border rounded p-2">
              {planDates.map(date => (
                <div key={date} className="flex justify-between text-sm">
                  <span>{format(new Date(date), 'MMM d')}</span>
                  <span>{dailyPlan[date]} units</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Total: {totalPlannedQuantity} / {order.orderQuantity} units
            </p>
          </div>

          {overlappingOrders && overlappingOrders.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <h3 className="font-semibold text-sm text-yellow-800 mb-2">
                Orders that will be moved:
              </h3>
              <div className="text-sm text-yellow-700">
                {overlappingOrders.map(poNumber => (
                  <div key={poNumber}>• {poNumber}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            Confirm Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Order, ProductionLine } from '../../types/scheduler';

interface SchedulingDialogProps {
  isOpen: boolean;
  order: Order | null;
  lineId: string;
  startDate: Date | null;
  productionLines: ProductionLine[];
  onConfirm: () => void;
  onClose: () => void;
}

export const SchedulingDialog: React.FC<SchedulingDialogProps> = ({
  isOpen,
  order,
  lineId,
  startDate,
  productionLines,
  onConfirm,
  onClose
}) => {
  if (!order) return null;

  const selectedLine = productionLines.find(l => l.id === lineId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Order</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-muted/50 p-3 rounded">
            <h3 className="font-medium">{order.poNumber}</h3>
            <p className="text-sm text-muted-foreground">Style: {order.styleId}</p>
            <p className="text-sm text-muted-foreground">
              Quantity: {order.orderQuantity.toLocaleString()} | SMV: {order.smv}
            </p>
            <p className="text-sm text-muted-foreground">
              Cut: {order.cutQuantity.toLocaleString()} | Issue: {order.issueQuantity.toLocaleString()}
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="font-medium">Start Date:</label>
              <div>{startDate?.toLocaleDateString()}</div>
            </div>
            <div>
              <label className="font-medium">Production Line:</label>
              <div>{selectedLine?.name}</div>
            </div>
          </div>
          
          <div className="flex space-x-2 pt-4">
            <Button onClick={onConfirm} className="flex-1">
              Schedule Order
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

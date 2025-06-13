
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Order } from '../../types/scheduler';

interface PlacementDialogProps {
  isOpen: boolean;
  draggedOrder: Order | null;
  overlappingOrders: Order[];
  onChoice: (placement: 'before' | 'after') => void;
  onClose: () => void;
}

export const PlacementDialog: React.FC<PlacementDialogProps> = ({
  isOpen,
  draggedOrder,
  overlappingOrders,
  onChoice,
  onClose
}) => {
  if (!draggedOrder) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Order Placement</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-blue-50 p-3 rounded border border-blue-200">
            <h4 className="font-medium text-blue-900">Dragged Order:</h4>
            <p className="text-sm text-blue-800">{draggedOrder.poNumber}</p>
            <p className="text-xs text-blue-700">Qty: {draggedOrder.orderQuantity.toLocaleString()}</p>
          </div>
          
          {overlappingOrders.length > 0 && (
            <div className="bg-amber-50 p-3 rounded border border-amber-200">
              <h4 className="font-medium text-amber-900">Overlapping Orders:</h4>
              {overlappingOrders.map(order => (
                <div key={order.id} className="text-sm text-amber-800">
                  {order.poNumber} ({order.planStartDate?.toLocaleDateString()} - {order.planEndDate?.toLocaleDateString()})
                </div>
              ))}
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Where would you like to place <strong>{draggedOrder.poNumber}</strong>?
          </div>

          <div className="flex space-x-3">
            <Button
              onClick={() => onChoice('before')}
              className="flex-1"
              variant="outline"
            >
              Before Existing Orders
            </Button>
            <Button
              onClick={() => onChoice('after')}
              className="flex-1"
            >
              After Existing Orders
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

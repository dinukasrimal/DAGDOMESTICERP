
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Order } from '../../types/scheduler';
import { Calendar, Package, Users } from 'lucide-react';

interface PlacementDialogProps {
  isOpen: boolean;
  draggedOrders: Order[];
  overlappingOrders: Order[];
  onChoice: (placement: 'before' | 'after') => void;
  onClose: () => void;
}

export const PlacementDialog: React.FC<PlacementDialogProps> = ({
  isOpen,
  draggedOrders,
  overlappingOrders,
  onChoice,
  onClose
}) => {
  if (!draggedOrders.length) return null;

  const totalDraggedQty = draggedOrders.reduce((sum, order) => sum + order.orderQuantity, 0);
  const totalOverlappingQty = overlappingOrders.reduce((sum, order) => sum + order.orderQuantity, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <span>Order Placement Choice</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Dragged Orders */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-2 mb-3">
              <Package className="h-4 w-4 text-blue-600" />
              <h4 className="font-semibold text-blue-900">
                Moving Orders ({draggedOrders.length})
              </h4>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {draggedOrders.map(order => (
                <div key={order.id} className="text-sm text-blue-800 bg-white/60 p-2 rounded">
                  <div className="font-medium">{order.poNumber}</div>
                  <div className="text-xs opacity-75">
                    Style: {order.styleId} | Qty: {order.orderQuantity.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-blue-700 font-medium">
              Total Quantity: {totalDraggedQty.toLocaleString()}
            </div>
          </div>
          
          {/* Overlapping Orders */}
          {overlappingOrders.length > 0 && (
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <div className="flex items-center space-x-2 mb-3">
                <Users className="h-4 w-4 text-amber-600" />
                <h4 className="font-semibold text-amber-900">
                  Overlapping Orders ({overlappingOrders.length})
                </h4>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {overlappingOrders.map(order => (
                  <div key={order.id} className="text-sm text-amber-800 bg-white/60 p-2 rounded">
                    <div className="font-medium">{order.poNumber}</div>
                    <div className="text-xs opacity-75">
                      {order.planStartDate?.toLocaleDateString()} - {order.planEndDate?.toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-amber-700 font-medium">
                Total Quantity: {totalOverlappingQty.toLocaleString()}
              </div>
            </div>
          )}

          {/* Placement Options */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-700 mb-4">
              How would you like to place the moving orders relative to the overlapping orders?
            </p>

            <div className="grid grid-cols-1 gap-3">
              <Button
                onClick={() => onChoice('before')}
                variant="outline"
                className="justify-start p-4 h-auto hover:bg-green-50 hover:border-green-300"
              >
                <div className="text-left">
                  <div className="font-medium text-green-700">Place Before</div>
                  <div className="text-xs text-green-600 mt-1">
                    Moving orders will be placed first, overlapping orders will shift backward
                  </div>
                </div>
              </Button>
              
              <Button
                onClick={() => onChoice('after')}
                variant="outline"
                className="justify-start p-4 h-auto hover:bg-blue-50 hover:border-blue-300"
              >
                <div className="text-left">
                  <div className="font-medium text-blue-700">Place After</div>
                  <div className="text-xs text-blue-600 mt-1">
                    Moving orders will be placed after overlapping orders with magnetic snapping
                  </div>
                </div>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Order } from '../types/scheduler';

interface OverlapConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  newOrder: Order;
  overlappingOrders: Order[];
  targetDate: Date;
  targetLine: string;
}

export const OverlapConfirmationDialog: React.FC<OverlapConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  newOrder,
  overlappingOrders,
  targetDate,
  targetLine
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Schedule Overlap Detected</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Placing order <strong>{newOrder.poNumber}</strong> on <strong>{targetLine}</strong> 
                starting <strong>{targetDate.toLocaleDateString()}</strong> will overlap with existing orders:
              </p>
              
              <div className="bg-muted/50 p-3 rounded-lg">
                <h4 className="font-medium mb-2">Overlapping Orders:</h4>
                <ul className="space-y-1">
                  {overlappingOrders.map((order) => (
                    <li key={order.id} className="text-sm">
                      • {order.poNumber} ({order.planStartDate?.toLocaleDateString()} - {order.planEndDate?.toLocaleDateString()})
                    </li>
                  ))}
                </ul>
              </div>
              
              <p className="text-sm text-muted-foreground">
                If you continue, the overlapping orders will be moved to accommodate the new order. 
                Do you want to proceed?
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>
            No, Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Yes, Move Orders
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

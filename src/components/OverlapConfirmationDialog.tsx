
import React, { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Order } from '../types/scheduler';

interface OverlapConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (placement: 'before' | 'after') => void;
  newOrder: Order | null;
  overlappingOrders: Order[];
  targetDate: Date | null;
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
  const [placement, setPlacement] = useState<'before' | 'after'>('after');

  // Don't render if newOrder is null
  if (!newOrder || !targetDate) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm(placement);
    setPlacement('after'); // Reset for next time
  };

  const handleClose = () => {
    onClose();
    setPlacement('after'); // Reset for next time
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Schedule Overlap Detected</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                Placing order <strong>{newOrder.poNumber}</strong> on <strong>{targetLine}</strong> 
                starting <strong>{targetDate.toLocaleDateString()}</strong> will overlap with existing orders:
              </p>
              
              <div className="bg-muted/50 p-3 rounded-lg">
                <h4 className="font-medium mb-2">Overlapping Orders:</h4>
                <ul className="space-y-1">
                  {overlappingOrders.map((order) => (
                    <li key={order.id} className="text-sm">
                      • {order.poNumber} - {order.styleId} ({order.planStartDate?.toLocaleDateString()} - {order.planEndDate?.toLocaleDateString()})
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm font-medium">How should the new order be placed?</p>
                <RadioGroup value={placement} onValueChange={(value: 'before' | 'after') => setPlacement(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="before" id="before" />
                    <Label htmlFor="before" className="text-sm">
                      <strong>Before existing orders</strong> - New order starts on selected date, existing orders move later
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="after" id="after" />
                    <Label htmlFor="after" className="text-sm">
                      <strong>After existing orders</strong> - New order starts after existing orders finish
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              <p className="text-xs text-muted-foreground">
                All affected orders will be automatically repositioned to maintain the production sequence.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Continue with {placement === 'before' ? 'Before' : 'After'} Placement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

import React, { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Order } from '../types/scheduler';

interface DropPositionChoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (choice: 'where-dropped' | 'after-order') => void;
  draggedOrder: Order | null;
  targetOrder: Order | null;
  targetDate: Date | null;
  targetLine: string;
}

export const DropPositionChoiceDialog: React.FC<DropPositionChoiceDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  draggedOrder,
  targetOrder,
  targetDate,
  targetLine
}) => {
  const [choice, setChoice] = useState<'where-dropped' | 'after-order'>('where-dropped');

  // Debug logging
  console.log('🔍 DropPositionChoiceDialog render:', {
    isOpen,
    draggedOrder: draggedOrder?.poNumber,
    targetOrder: targetOrder?.poNumber,
    targetDate: targetDate?.toLocaleDateString(),
    targetLine
  });

  // Don't render if required data is null
  if (!draggedOrder || !targetOrder || !targetDate) {
    console.log('❌ DropPositionChoiceDialog: Missing required data');
    return null;
  }

  const handleConfirm = () => {
    onConfirm(choice);
    setChoice('where-dropped'); // Reset for next time
  };

  const handleClose = () => {
    onClose();
    setChoice('where-dropped'); // Reset for next time
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto w-full">
        <AlertDialogHeader>
          <AlertDialogTitle>Choose Drop Position</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                You're dropping order <strong>{draggedOrder.poNumber}</strong> onto scheduled order{' '}
                <strong>{targetOrder.poNumber}</strong> on <strong>{targetLine}</strong>.
              </p>
              
              <div className="bg-muted/50 p-3 rounded-lg">
                <h4 className="font-medium mb-2">Target Order Details:</h4>
                <div className="text-sm space-y-1">
                  <div>• PO: {targetOrder.poNumber}</div>
                  <div>• Style: {targetOrder.styleId}</div>
                  <div>• Quantity: {targetOrder.orderQuantity.toLocaleString()}</div>
                  <div>• Drop Date: {targetDate.toLocaleDateString()}</div>
                </div>
              </div>
              
              <div className="space-y-3">
                <p className="text-sm font-medium">How would you like to schedule the dragged order?</p>
                <RadioGroup value={choice} onValueChange={(value: 'where-dropped' | 'after-order') => setChoice(value)}>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="where-dropped" id="where-dropped" className="mt-0.5" />
                    <Label htmlFor="where-dropped" className="text-sm cursor-pointer">
                      <div className="space-y-1">
                        <div className="font-medium">Plan from where dropped</div>
                        <div className="text-muted-foreground">
                          Schedule the order starting from {targetDate.toLocaleDateString()} at the specific position where you dropped it.
                        </div>
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="after-order" id="after-order" className="mt-0.5" />
                    <Label htmlFor="after-order" className="text-sm cursor-pointer">
                      <div className="space-y-1">
                        <div className="font-medium">Plan after scheduled order</div>
                        <div className="text-muted-foreground">
                          Schedule the order to start after {targetOrder.poNumber} completes, utilizing any remaining capacity on the last day.
                        </div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              <p className="text-xs text-muted-foreground">
                The order will be automatically positioned based on your selection while maintaining production efficiency.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Continue with {choice === 'where-dropped' ? 'Current Position' : 'After Order'} Placement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
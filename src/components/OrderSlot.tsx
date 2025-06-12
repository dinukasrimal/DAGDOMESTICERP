
import React, { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ScheduledOrder } from '../types/scheduler';
import { Package, Calendar, TrendingUp } from 'lucide-react';

interface OrderSlotProps {
  scheduledOrder: any;
  date: Date;
}

export const OrderSlot: React.FC<OrderSlotProps> = ({
  scheduledOrder,
  date
}) => {
  const [actualProduction, setActualProduction] = useState<number>(0);
  const [showProductionDialog, setShowProductionDialog] = useState(false);

  const isStartDate = scheduledOrder.startDate.toDateString() === date.toDateString();
  const isEndDate = scheduledOrder.endDate.toDateString() === date.toDateString();
  const isMiddleDate = date > scheduledOrder.startDate && date < scheduledOrder.endDate;

  // Calculate cumulative production status
  const getCumulativeStatus = () => {
    // This would calculate based on actual vs planned production
    // For now, returning a demo status
    return Math.random() > 0.5 ? 'on-track' : 'behind';
  };

  const status = getCumulativeStatus();

  const getSlotColor = () => {
    switch (status) {
      case 'on-track':
        return 'bg-green-100 border-green-500 text-green-800';
      case 'behind':
        return 'bg-red-100 border-red-500 text-red-800';
      default:
        return 'bg-blue-100 border-blue-500 text-blue-800';
    }
  };

  if (!isStartDate && !isMiddleDate && !isEndDate) {
    return null;
  }

  return (
    <div className="absolute inset-0 p-1">
      <Dialog>
        <DialogTrigger asChild>
          <div
            className={`w-full h-full rounded border-2 cursor-pointer hover:shadow-md transition-shadow ${getSlotColor()}`}
          >
            <div className="p-1 text-xs">
              {isStartDate && (
                <div className="font-medium truncate">
                  {scheduledOrder.order.poNumber}
                </div>
              )}
              <div className="flex items-center space-x-1">
                <Package className="h-3 w-3" />
                <span>{scheduledOrder.order.orderQuantity.toLocaleString()}</span>
              </div>
              {(isStartDate || isEndDate) && (
                <div className="text-xs opacity-75">
                  {isStartDate ? 'Start' : 'End'}
                </div>
              )}
            </div>
          </div>
        </DialogTrigger>
        
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order Details - {scheduledOrder.order.poNumber}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Style ID:</label>
                <p>{scheduledOrder.order.styleId}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Order Quantity:</label>
                <p>{scheduledOrder.order.orderQuantity.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Cut Quantity:</label>
                <p>{scheduledOrder.order.cutQuantity.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Issue Quantity:</label>
                <p>{scheduledOrder.order.issueQuantity.toLocaleString()}</p>
              </div>
            </div>
            
            <div className="border-t pt-4">
              <h4 className="font-medium mb-2">Production for {date.toLocaleDateString()}</h4>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  placeholder="Actual production"
                  value={actualProduction}
                  onChange={(e) => setActualProduction(parseInt(e.target.value) || 0)}
                />
                <Button size="sm">
                  Update
                </Button>
              </div>
            </div>
            
            <div className="border-t pt-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4" />
                <span className="font-medium">Status:</span>
                <Badge variant={status === 'on-track' ? 'default' : 'destructive'}>
                  {status === 'on-track' ? 'On Track' : 'Behind Schedule'}
                </Badge>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

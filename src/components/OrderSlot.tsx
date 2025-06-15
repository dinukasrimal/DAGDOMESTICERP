
import React, { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ScheduledOrder } from '../types/scheduler';
import { Package, Calendar, TrendingUp, ArrowLeft, Scissors, GripVertical } from 'lucide-react';

interface OrderSlotProps {
  scheduledOrder: any;
  date: Date;
  isSelected?: boolean;
  isMultiSelectMode?: boolean;
  onOrderClick?: (e: React.MouseEvent, orderId: string) => void;
  onOrderDragStart?: (e: React.DragEvent, order: any) => void;
  onOrderDragEnd?: (e: React.DragEvent) => void;
  onOrderMovedToPending?: (order: any) => void;
  onOrderSplit?: (orderId: string, splitQuantity: number) => void;
  hoveredCard?: string | null;
  setHoveredCard?: (cardKey: string | null) => void;
  shouldHighlightRed?: (order: any, date: Date) => boolean;
}

export const OrderSlot: React.FC<OrderSlotProps> = ({
  scheduledOrder,
  date,
  isSelected = false,
  isMultiSelectMode = false,
  onOrderClick,
  onOrderDragStart,
  onOrderDragEnd,
  onOrderMovedToPending,
  onOrderSplit,
  hoveredCard,
  setHoveredCard,
  shouldHighlightRed
}) => {
  const [actualProduction, setActualProduction] = useState<number>(0);
  const [showProductionDialog, setShowProductionDialog] = useState(false);

  const dateStr = date.toISOString().split('T')[0];
  const dailyQty = scheduledOrder.actualProduction?.[dateStr] || 0;
  const shouldHighlight = shouldHighlightRed ? shouldHighlightRed(scheduledOrder, date) : false;
  const cardKey = `${scheduledOrder.id}-${dateStr}`;
  const isHovered = hoveredCard === cardKey;

  // Calculate completion percentage for the order - fix TypeScript errors
  const actualProductionValues = Object.values(scheduledOrder.actualProduction || {});
  const totalCompleted: number = actualProductionValues.reduce((sum: number, qty: unknown): number => {
    let numQty = 0;
    if (typeof qty === 'number') {
      numQty = qty;
    } else if (typeof qty === 'string') {
      const parsed = Number(qty);
      numQty = isNaN(parsed) ? 0 : parsed;
    }
    return sum + numQty;
  }, 0);
  
  const completionPercent = scheduledOrder.orderQuantity > 0 
    ? Math.round((totalCompleted / scheduledOrder.orderQuantity) * 100) 
    : 0;

  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger click when clicking on checkbox
    if ((e.target as HTMLElement).closest('[data-checkbox]')) {
      return;
    }
    
    if (onOrderClick) {
      onOrderClick(e, scheduledOrder.id);
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    // Create a proper synthetic event for the checkbox
    if (onOrderClick) {
      // Call with a properly typed event that simulates ctrl+click for multi-select
      const syntheticEvent = {
        ...new MouseEvent('click'),
        ctrlKey: checked,
        metaKey: false,
        stopPropagation: () => {},
        preventDefault: () => {},
        target: { closest: () => null }
      } as unknown as React.MouseEvent;
      
      onOrderClick(syntheticEvent, scheduledOrder.id);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (onOrderDragStart) {
      onOrderDragStart(e, scheduledOrder);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (onOrderDragEnd) {
      onOrderDragEnd(e);
    }
  };

  const handleMouseEnter = () => {
    if (setHoveredCard) {
      setHoveredCard(cardKey);
    }
  };

  const handleMouseLeave = () => {
    if (setHoveredCard) {
      setHoveredCard(null);
    }
  };

  return (
    <div className="relative h-full">
      <Dialog>
        <DialogTrigger asChild>
          <div
            className={`relative rounded-md text-xs cursor-move transition-all duration-300 border overflow-hidden h-full ${
              isSelected
                ? 'ring-2 ring-blue-500 bg-blue-50 shadow-lg border-blue-300 z-30'
                : shouldHighlight
                  ? 'bg-red-100 border-red-400 text-red-800 shadow-md z-20'
                  : 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100 shadow-sm z-10'
            } ${
              isHovered 
                ? 'scale-110 shadow-2xl z-40 bg-white border-gray-400 text-gray-900' 
                : ''
            }`}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="p-1.5 h-full flex flex-col">
              {/* Order Header - Always visible */}
              <div className="flex items-center justify-between mb-1 flex-shrink-0">
                <div className="flex items-center space-x-1 min-w-0 flex-1">
                  <GripVertical className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
                  <span className="truncate font-semibold text-xs">{scheduledOrder.poNumber}</span>
                  {/* Checkbox for multi-select */}
                  <div data-checkbox className="flex-shrink-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={handleCheckboxChange}
                      className="h-3 w-3"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                {isHovered && (
                  <div className="flex space-x-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-4 w-4 p-0 hover:bg-red-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOrderMovedToPending) {
                          onOrderMovedToPending(scheduledOrder);
                        }
                      }}
                      title="Move back to pending"
                    >
                      <ArrowLeft className="h-2.5 w-2.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-4 w-4 p-0 hover:bg-gray-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOrderSplit) {
                          onOrderSplit(scheduledOrder.id, Math.floor(scheduledOrder.orderQuantity / 2));
                        }
                      }}
                      title="Split order"
                    >
                      <Scissors className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Order Details */}
              <div className="flex-1 overflow-hidden">
                {!isHovered ? (
                  // Show product and percentage in neutral stage
                  <div className="space-y-0.5 text-xs">
                    <div className="truncate opacity-90 font-medium">
                      {scheduledOrder.styleId}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-xs">
                        {dailyQty.toLocaleString()}
                      </span>
                      <span className={`text-xs font-semibold px-1 py-0.5 rounded ${
                        completionPercent >= 100 ? 'bg-green-100 text-green-700' :
                        completionPercent >= 50 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {completionPercent}%
                      </span>
                    </div>
                  </div>
                ) : (
                  // Full info when hovered
                  <div className="space-y-1 text-xs">
                    <div className="truncate opacity-90">
                      <span className="font-medium">Style:</span> {scheduledOrder.styleId}
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-90">
                        <span className="font-medium">Daily:</span> {dailyQty.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-90">
                        <span className="font-medium">Total:</span> {scheduledOrder.orderQuantity.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-90">
                        <span className="font-medium">Cut:</span> {scheduledOrder.cutQuantity.toLocaleString()}
                      </span>
                      <span className="opacity-90">
                        <span className="font-medium">Issue:</span> {scheduledOrder.issueQuantity.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                      <span className="font-medium">Progress:</span>
                      <span className={`font-semibold px-2 py-1 rounded ${
                        completionPercent >= 100 ? 'bg-green-100 text-green-700' :
                        completionPercent >= 50 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {completionPercent}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogTrigger>
        
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order Details - {scheduledOrder.poNumber}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Style ID:</label>
                <p>{scheduledOrder.styleId}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Order Quantity:</label>
                <p>{scheduledOrder.orderQuantity.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Cut Quantity:</label>
                <p>{scheduledOrder.cutQuantity.toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Issue Quantity:</label>
                <p>{scheduledOrder.issueQuantity.toLocaleString()}</p>
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
                <Badge variant="default">
                  On Track
                </Badge>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

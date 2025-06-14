
import React from 'react';
import { Button } from './ui/button';
import { Scissors, ArrowLeft, GripVertical } from 'lucide-react';
import { Order, ProductionLine } from '../types/scheduler';

interface SchedulingOrderCellProps {
  scheduledOrder: Order;
  date: Date;
  index: number;
  line: ProductionLine;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
  handleOrderDragStart: (e: React.DragEvent, order: Order) => void;
  handleOrderDragEnd: (e: React.DragEvent) => void;
  handleOrderClick: (e: React.MouseEvent, orderId: string) => void;
  shouldHighlight: boolean;
  isSelected: boolean;
  dailyQty: number;
  orderUtilization: number;
}

export const SchedulingOrderCell: React.FC<SchedulingOrderCellProps> = ({
  scheduledOrder,
  date,
  index,
  line,
  onOrderMovedToPending,
  onOrderSplit,
  handleOrderDragStart,
  handleOrderDragEnd,
  handleOrderClick,
  shouldHighlight,
  isSelected,
  dailyQty,
  orderUtilization,
}) => (
  <div
    key={`${scheduledOrder.id}-${date.toISOString().split('T')[0]}`}
    className={`rounded text-xs p-1 group cursor-move transition-colors flex-1 min-h-[60px] ${
      isSelected 
        ? 'ring-2 ring-blue-500 bg-blue-50' 
        : shouldHighlight 
          ? 'bg-red-100 border-2 border-red-500 text-red-800' 
          : index % 2 === 0
            ? 'bg-blue-100 border border-blue-300 text-blue-800'
            : 'bg-green-100 border border-green-300 text-green-800'
    }`}
    draggable
    onDragStart={(e) => handleOrderDragStart(e, scheduledOrder)}
    onDragEnd={handleOrderDragEnd}
    onClick={(e) => handleOrderClick(e, scheduledOrder.id)}
    style={{ 
      height: `${Math.max(orderUtilization, 20)}%`,
      minHeight: '60px'
    }}
  >
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center space-x-1">
        <GripVertical className="h-3 w-3 opacity-60" />
        <span className="truncate font-medium text-xs">{scheduledOrder.poNumber}</span>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex space-x-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-4 w-4 p-0 hover:bg-destructive/10"
          onClick={(e) => {
            e.stopPropagation();
            onOrderMovedToPending(scheduledOrder);
          }}
          title="Move back to pending"
        >
          <ArrowLeft className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-4 w-4 p-0 hover:bg-secondary"
          onClick={(e) => {
            e.stopPropagation();
            onOrderSplit(scheduledOrder.id, Math.floor(scheduledOrder.orderQuantity / 2));
          }}
          title="Split order"
        >
          <Scissors className="h-3 w-3" />
        </Button>
      </div>
    </div>
    <div className="text-xs opacity-75 truncate mb-1">
      Style: {scheduledOrder.styleId}
    </div>
    <div className="text-xs opacity-75 mb-1">
      Qty: {dailyQty.toLocaleString()}
    </div>
    <div className="text-xs opacity-75 mb-1">
      Cut: {scheduledOrder.cutQuantity.toLocaleString()}
    </div>
    <div className="text-xs opacity-75 mb-1">
      Issue: {scheduledOrder.issueQuantity.toLocaleString()}
    </div>
    <div className="text-xs opacity-75">
      {orderUtilization.toFixed(1)}% used
    </div>
  </div>
);

export default SchedulingOrderCell;


import React, { useCallback } from 'react';
import { Plus, ArrowLeft, Scissors, GripVertical } from 'lucide-react';
import { Button } from '../ui/button';
import { Order, ProductionLine } from '../../types/scheduler';

interface SchedulerCellProps {
  line: ProductionLine;
  date: Date;
  orders: Order[];
  isHoliday: boolean;
  isHighlighted: boolean;
  usedCapacity: number;
  availableCapacity: number;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
}

export const SchedulerCell: React.FC<SchedulerCellProps> = ({
  line,
  date,
  orders,
  isHoliday,
  isHighlighted,
  usedCapacity,
  availableCapacity,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onOrderMovedToPending,
  onOrderSplit
}) => {
  const utilizationPercent = (usedCapacity / line.capacity) * 100;

  const handleOrderDragStart = useCallback((e: React.DragEvent, order: Order) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(order));
    
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleOrderDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const isCurrentWeek = useCallback((checkDate: Date) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return checkDate >= startOfWeek && checkDate <= endOfWeek;
  }, []);

  const shouldHighlightRed = useCallback((order: Order) => {
    return order.cutQuantity === 0 && 
           order.planStartDate && 
           isCurrentWeek(order.planStartDate) &&
           date.toDateString() === order.planStartDate.toDateString();
  }, [date, isCurrentWeek]);

  return (
    <div
      className={`w-32 min-h-[120px] border-r border-border relative transition-all duration-200 ${
        isHoliday 
          ? 'bg-red-50/50 border-red-200' 
          : isHighlighted 
            ? 'bg-blue-100 border-blue-300 border-2' 
            : 'bg-background hover:bg-muted/20'
      }`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      {/* Capacity utilization bar */}
      {utilizationPercent > 0 && !isHoliday && (
        <div 
          className="absolute bottom-0 left-0 right-0 bg-blue-200/50 transition-all duration-300"
          style={{ height: `${Math.min(utilizationPercent, 100)}%` }}
        />
      )}
      
      {/* Drop zone indicator */}
      {!isHoliday && orders.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <Plus className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      
      {/* Available capacity indicator */}
      {!isHoliday && availableCapacity > 0 && orders.length > 0 && (
        <div className="absolute top-1 right-1 text-xs bg-green-100 text-green-700 px-1 rounded">
          {availableCapacity}
        </div>
      )}
      
      {/* Drag highlight indicator */}
      {isHighlighted && !isHoliday && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-100/20 border-2 border-blue-300 border-dashed rounded z-10">
          <div className="text-xs font-medium text-blue-600 bg-white px-2 py-1 rounded shadow">
            Drop Here
          </div>
        </div>
      )}
      
      {/* Orders in this cell */}
      <div className="p-1 space-y-1 relative z-20 h-full flex flex-col">
        {orders.map((order, index) => {
          const dateStr = date.toISOString().split('T')[0];
          const dailyQty = order.actualProduction?.[dateStr] || 0;
          const shouldHighlight = shouldHighlightRed(order);
          const orderUtilization = (dailyQty / line.capacity) * 100;
          
          return (
            <div 
              key={`${order.id}-${dateStr}-${index}`}
              className={`rounded text-xs p-2 group cursor-move transition-colors border ${
                shouldHighlight 
                  ? 'bg-red-100 border-red-400 text-red-800' 
                  : index % 3 === 0
                    ? 'bg-blue-100 border-blue-300 text-blue-800'
                    : index % 3 === 1
                      ? 'bg-green-100 border-green-300 text-green-800'
                      : 'bg-purple-100 border-purple-300 text-purple-800'
              }`}
              draggable
              onDragStart={(e) => handleOrderDragStart(e, order)}
              onDragEnd={handleOrderDragEnd}
              style={{ 
                minHeight: `${Math.max(orderUtilization * 0.8, 50)}px`
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-1">
                  <GripVertical className="h-3 w-3 opacity-60" />
                  <span className="truncate font-medium text-xs">{order.poNumber}</span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-4 w-4 p-0 hover:bg-red-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOrderMovedToPending(order);
                    }}
                    title="Move to pending"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-4 w-4 p-0 hover:bg-gray-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOrderSplit(order.id, Math.floor(order.orderQuantity / 2));
                    }}
                    title="Split order"
                  >
                    <Scissors className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs opacity-75">Style: {order.styleId}</div>
                <div className="text-xs opacity-75">Qty: {dailyQty.toLocaleString()}</div>
                <div className="text-xs opacity-75">
                  {orderUtilization.toFixed(1)}% used
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

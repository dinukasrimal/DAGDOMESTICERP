
import React, { useCallback, useState } from 'react';
import { Plus, ArrowLeft, Scissors, GripVertical, CheckSquare, Square } from 'lucide-react';
import { Button } from '../ui/button';
import { Order, ProductionLine } from '../../types/scheduler';

interface SchedulerCellProps {
  line: ProductionLine;
  date: Date;
  orders: Order[];
  selectedOrders: Set<string>;
  isMultiSelectMode: boolean;
  isHoliday: boolean;
  isHighlighted: boolean;
  usedCapacity: number;
  availableCapacity: number;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onInternalDragStart: (orders: Order[]) => void;
  onOrderSelect: (orderId: string, isSelected: boolean) => void;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
}

export const SchedulerCell: React.FC<SchedulerCellProps> = ({
  line,
  date,
  orders,
  selectedOrders,
  isMultiSelectMode,
  isHoliday,
  isHighlighted,
  usedCapacity,
  availableCapacity,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onInternalDragStart,
  onOrderSelect,
  onOrderMovedToPending,
  onOrderSplit
}) => {
  const [isDragging, setIsDragging] = useState(false);
  
  const utilizationPercent = (usedCapacity / line.capacity) * 100;
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  const handleOrderDragStart = useCallback((e: React.DragEvent, order: Order) => {
    e.stopPropagation();
    setIsDragging(true);
    
    // Determine which orders to drag
    let ordersToDrag: Order[];
    if (isMultiSelectMode && selectedOrders.has(order.id)) {
      // Drag all selected orders
      ordersToDrag = orders.filter(o => selectedOrders.has(o.id));
    } else {
      // Drag just this order
      ordersToDrag = [order];
    }
    
    onInternalDragStart(ordersToDrag);
    
    // Set drag data for external compatibility
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(order));
    
    // Visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, [isMultiSelectMode, selectedOrders, orders, onInternalDragStart]);

  const handleOrderDragEnd = useCallback((e: React.DragEvent) => {
    setIsDragging(false);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleOrderClick = useCallback((e: React.MouseEvent, order: Order) => {
    if (isMultiSelectMode) {
      e.preventDefault();
      e.stopPropagation();
      const isSelected = selectedOrders.has(order.id);
      onOrderSelect(order.id, !isSelected);
    }
  }, [isMultiSelectMode, selectedOrders, onOrderSelect]);

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

  // Check if this order is using partial/remaining capacity
  const isUsingRemainingCapacity = useCallback((order: Order) => {
    const dateStr = date.toISOString().split('T')[0];
    const dailyQty = order.actualProduction?.[dateStr] || 0;
    const otherOrdersQty = orders
      .filter(o => o.id !== order.id)
      .reduce((sum, o) => sum + (o.actualProduction?.[dateStr] || 0), 0);
    
    // If this order's quantity + other orders < line capacity, it's using remaining capacity
    return (dailyQty + otherOrdersQty) < line.capacity && otherOrdersQty > 0;
  }, [orders, line.capacity, date]);

  const getOrderColorClasses = useCallback((order: Order, index: number) => {
    const isSelected = selectedOrders.has(order.id);
    const shouldHighlight = shouldHighlightRed(order);
    const usingRemainingCapacity = isUsingRemainingCapacity(order);
    
    if (shouldHighlight) {
      return 'bg-red-100 border-red-400 text-red-800';
    }
    
    if (isSelected) {
      return 'bg-blue-200 border-blue-500 text-blue-900 ring-2 ring-blue-400';
    }
    
    // Visual distinction for orders using remaining capacity
    if (usingRemainingCapacity) {
      return 'bg-amber-100 border-amber-300 text-amber-800 border-dashed';
    }
    
    const colors = [
      'bg-blue-100 border-blue-300 text-blue-800',
      'bg-green-100 border-green-300 text-green-800',
      'bg-purple-100 border-purple-300 text-purple-800',
      'bg-orange-100 border-orange-300 text-orange-800'
    ];
    
    return colors[index % colors.length];
  }, [selectedOrders, shouldHighlightRed, isUsingRemainingCapacity]);

  return (
    <div
      className={`w-32 min-h-[120px] border-r border-border relative transition-all duration-200 ${
        isHoliday 
          ? 'bg-red-50/70 border-red-200' 
          : isWeekend
            ? 'bg-amber-50/30'
            : isHighlighted 
              ? 'bg-blue-100 border-blue-300 border-2 shadow-inner' 
              : 'bg-background hover:bg-muted/30'
      }`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      {/* Capacity utilization background bar */}
      {utilizationPercent > 0 && !isHoliday && (
        <div 
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-200/60 to-blue-100/30 transition-all duration-300 rounded-b"
          style={{ height: `${Math.min(utilizationPercent, 100)}%` }}
        />
      )}
      
      {/* Capacity indicator */}
      {!isHoliday && (
        <div className="absolute top-1 right-1 text-xs">
          <div className={`px-1.5 py-0.5 rounded text-xs font-medium ${
            utilizationPercent > 90 
              ? 'bg-red-100 text-red-700' 
              : utilizationPercent > 70 
                ? 'bg-amber-100 text-amber-700'
                : 'bg-green-100 text-green-700'
          }`}>
            {utilizationPercent.toFixed(0)}%
          </div>
          {availableCapacity > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              +{availableCapacity.toLocaleString()}
            </div>
          )}
        </div>
      )}
      
      {/* Drop zone indicator */}
      {!isHoliday && orders.length === 0 && !isHighlighted && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-60 transition-opacity">
          <div className="flex flex-col items-center text-muted-foreground">
            <Plus className="h-6 w-6 mb-1" />
            <span className="text-xs">Drop here</span>
          </div>
        </div>
      )}
      
      {/* Drag highlight overlay */}
      {isHighlighted && !isHoliday && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-100/40 border-2 border-blue-400 border-dashed rounded-lg z-30 backdrop-blur-sm">
          <div className="text-sm font-semibold text-blue-700 bg-white/90 px-3 py-1.5 rounded-full shadow-sm">
            Drop Here
          </div>
        </div>
      )}
      
      {/* Holiday overlay */}
      {isHoliday && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="text-xs font-medium text-red-600 bg-red-100/80 px-2 py-1 rounded backdrop-blur-sm">
            Holiday
          </div>
        </div>
      )}
      
      {/* Orders in this cell */}
      <div className="p-1.5 space-y-1.5 relative z-10 h-full flex flex-col">
        {orders.map((order, index) => {
          const dateStr = date.toISOString().split('T')[0];
          const dailyQty = order.actualProduction?.[dateStr] || 0;
          const orderUtilization = (dailyQty / line.capacity) * 100;
          const isSelected = selectedOrders.has(order.id);
          const usingRemainingCapacity = isUsingRemainingCapacity(order);
          
          return (
            <div 
              key={`${order.id}-${dateStr}-${index}`}
              className={`rounded-lg text-xs p-2 group cursor-move transition-all duration-200 border-2 shadow-sm hover:shadow-md ${
                getOrderColorClasses(order, index)
              } ${isDragging ? 'opacity-50' : ''}`}
              draggable
              onDragStart={(e) => handleOrderDragStart(e, order)}
              onDragEnd={handleOrderDragEnd}
              onClick={(e) => handleOrderClick(e, order)}
              style={{ 
                minHeight: `${Math.max(orderUtilization * 0.6, 45)}px`
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                  {isMultiSelectMode && (
                    <div className="flex-shrink-0">
                      {isSelected ? (
                        <CheckSquare className="h-3 w-3 text-blue-600" />
                      ) : (
                        <Square className="h-3 w-3 text-gray-400" />
                      )}
                    </div>
                  )}
                  <GripVertical className="h-3 w-3 opacity-60 flex-shrink-0" />
                  <span className="truncate font-semibold text-xs">{order.poNumber}</span>
                </div>
                
                {!isMultiSelectMode && (
                  <div className="opacity-0 group-hover:opacity-100 flex space-x-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0 hover:bg-red-200/80"
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
                      className="h-5 w-5 p-0 hover:bg-gray-200/80"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOrderSplit(order.id, Math.floor(order.orderQuantity / 2));
                      }}
                      title="Split order"
                    >
                      <Scissors className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              
              <div className="space-y-1">
                <div className="text-xs opacity-80 truncate">Style: {order.styleId}</div>
                <div className="text-xs opacity-80">Qty: {dailyQty.toLocaleString()}</div>
                <div className="text-xs opacity-80">
                  {orderUtilization.toFixed(1)}% of line
                </div>
                {usingRemainingCapacity && (
                  <div className="text-xs font-medium text-amber-700">
                    Remaining Cap.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

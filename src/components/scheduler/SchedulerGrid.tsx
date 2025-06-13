
import React, { useCallback } from 'react';
import { Order, ProductionLine, Holiday } from '../../types/scheduler';
import { SchedulerCell } from './SchedulerCell';

interface DragState {
  isDragging: boolean;
  draggedOrders: Order[];
  draggedFromPending: boolean;
  highlightedCell: string | null;
}

interface SchedulerGridProps {
  productionLines: ProductionLine[];
  dates: Date[];
  orders: Order[];
  holidays: Holiday[];
  selectedOrders: Set<string>;
  isMultiSelectMode: boolean;
  dragState: DragState;
  onExternalDrop: (e: React.DragEvent, lineId: string, date: Date) => void;
  onInternalDragStart: (orders: Order[]) => void;
  onInternalDrop: (lineId: string, date: Date) => void;
  onOrderSelect: (orderId: string, isSelected: boolean) => void;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
  onCellHighlight: (cellKey: string | null) => void;
  getOrdersForCell: (lineId: string, date: Date) => Order[];
  getUsedCapacity: (lineId: string, date: Date) => number;
  getAvailableCapacity: (lineId: string, date: Date) => number;
}

export const SchedulerGrid: React.FC<SchedulerGridProps> = ({
  productionLines,
  dates,
  orders,
  holidays,
  selectedOrders,
  isMultiSelectMode,
  dragState,
  onExternalDrop,
  onInternalDragStart,
  onInternalDrop,
  onOrderSelect,
  onOrderMovedToPending,
  onOrderSplit,
  onCellHighlight,
  getOrdersForCell,
  getUsedCapacity,
  getAvailableCapacity
}) => {
  const isHoliday = useCallback((date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  }, [holidays]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    if (!isHoliday(date)) {
      const cellKey = `${lineId}-${date.toISOString().split('T')[0]}`;
      onCellHighlight(cellKey);
    }
  }, [isHoliday, onCellHighlight]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only clear highlight if we're truly leaving the cell
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      onCellHighlight(null);
    }
  }, [onCellHighlight]);

  const handleDrop = useCallback((e: React.DragEvent, lineId: string, date: Date) => {
    e.preventDefault();
    onCellHighlight(null);
    
    if (dragState.isDragging) {
      // Internal drop (from within scheduler)
      onInternalDrop(lineId, date);
    } else {
      // External drop (from pending orders)
      onExternalDrop(e, lineId, date);
    }
  }, [dragState.isDragging, onInternalDrop, onExternalDrop, onCellHighlight]);

  return (
    <div className="divide-y divide-border">
      {productionLines.map((line) => (
        <div key={line.id} className="flex hover:bg-muted/20 transition-colors">
          <div className="w-48 p-4 border-r border-border bg-card sticky left-0 z-20">
            <div className="font-medium text-foreground">{line.name}</div>
            <div className="text-sm text-muted-foreground">
              Capacity: {line.capacity.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Daily: {line.capacity.toLocaleString()} units
            </div>
          </div>
          
          {dates.map((date) => {
            const cellKey = `${line.id}-${date.toISOString().split('T')[0]}`;
            const isHighlighted = dragState.highlightedCell === cellKey;
            const cellOrders = getOrdersForCell(line.id, date);
            
            return (
              <SchedulerCell
                key={cellKey}
                line={line}
                date={date}
                orders={cellOrders}
                selectedOrders={selectedOrders}
                isMultiSelectMode={isMultiSelectMode}
                isHoliday={isHoliday(date)}
                isHighlighted={isHighlighted}
                usedCapacity={getUsedCapacity(line.id, date)}
                availableCapacity={getAvailableCapacity(line.id, date)}
                onDrop={(e) => handleDrop(e, line.id, date)}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, line.id, date)}
                onDragLeave={handleDragLeave}
                onInternalDragStart={onInternalDragStart}
                onOrderSelect={onOrderSelect}
                onOrderMovedToPending={onOrderMovedToPending}
                onOrderSplit={onOrderSplit}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

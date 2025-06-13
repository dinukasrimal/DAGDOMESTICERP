
import React, { useState, useCallback } from 'react';
import { Order, ProductionLine, Holiday } from '../../types/scheduler';
import { SchedulerCell } from './SchedulerCell';

interface SchedulerGridProps {
  productionLines: ProductionLine[];
  dates: Date[];
  orders: Order[];
  holidays: Holiday[];
  onDrop: (e: React.DragEvent, lineId: string, date: Date) => void;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
  getOrdersForCell: (lineId: string, date: Date) => Order[];
  getUsedCapacity: (lineId: string, date: Date) => number;
  getAvailableCapacity: (lineId: string, date: Date) => number;
}

export const SchedulerGrid: React.FC<SchedulerGridProps> = ({
  productionLines,
  dates,
  orders,
  holidays,
  onDrop,
  onOrderMovedToPending,
  onOrderSplit,
  getOrdersForCell,
  getUsedCapacity,
  getAvailableCapacity
}) => {
  const [dragHighlight, setDragHighlight] = useState<string | null>(null);

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
      setDragHighlight(`${lineId}-${date.toISOString().split('T')[0]}`);
    }
  }, [isHoliday]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragHighlight(null);
    }
  }, []);

  const handleCellDrop = useCallback((e: React.DragEvent, lineId: string, date: Date) => {
    setDragHighlight(null);
    onDrop(e, lineId, date);
  }, [onDrop]);

  return (
    <div className="divide-y divide-border">
      {productionLines.map((line) => (
        <div key={line.id} className="flex">
          <div className="w-48 p-4 border-r border-border bg-card">
            <div className="font-medium">{line.name}</div>
            <div className="text-sm text-muted-foreground">
              Capacity: {line.capacity}
            </div>
          </div>
          {dates.map((date) => {
            const cellKey = `${line.id}-${date.toISOString().split('T')[0]}`;
            const isHighlighted = dragHighlight === cellKey;
            
            return (
              <SchedulerCell
                key={cellKey}
                line={line}
                date={date}
                orders={getOrdersForCell(line.id, date)}
                isHoliday={isHoliday(date)}
                isHighlighted={isHighlighted}
                usedCapacity={getUsedCapacity(line.id, date)}
                availableCapacity={getAvailableCapacity(line.id, date)}
                onDrop={(e) => handleCellDrop(e, line.id, date)}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, line.id, date)}
                onDragLeave={handleDragLeave}
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

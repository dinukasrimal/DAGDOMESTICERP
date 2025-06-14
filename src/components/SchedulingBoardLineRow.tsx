
import React from 'react';
import { Button } from './ui/button';
import { FileDown, Plus } from 'lucide-react';
import SchedulingOrderCell from './SchedulingOrderCell';
import { Order, ProductionLine, Holiday } from '../types/scheduler';

interface SchedulingBoardLineRowProps {
  line: ProductionLine;
  dates: Date[];
  getOrdersForCell: (lineId: string, date: Date) => Order[];
  isHoliday: (date: Date) => boolean;
  calculateTotalUtilization: (lineId: string, date: Date) => number;
  getAvailableCapacity: (lineId: string, date: Date) => number;
  dragHighlight: string | null;
  handleDrop: (e: React.DragEvent, lineId: string, date: Date) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragEnter: (e: React.DragEvent, lineId: string, date: Date) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  onOrderMovedToPending: (order: Order) => void;
  onOrderSplit: (orderId: string, splitQuantity: number) => void;
  handleOrderDragStart: (e: React.DragEvent, order: Order) => void;
  handleOrderDragEnd: (e: React.DragEvent) => void;
  handleOrderClick: (e: React.MouseEvent, orderId: string) => void;
  shouldHighlightRed: (order: Order, date: Date) => boolean;
  selectedOrders: Set<string>;
  handleDownloadLinePdf: (lineId: string, lineName: string) => void;
}

export const SchedulingBoardLineRow: React.FC<SchedulingBoardLineRowProps> = ({
  line,
  dates,
  getOrdersForCell,
  isHoliday,
  calculateTotalUtilization,
  getAvailableCapacity,
  dragHighlight,
  handleDrop,
  handleDragOver,
  handleDragEnter,
  handleDragLeave,
  onOrderMovedToPending,
  onOrderSplit,
  handleOrderDragStart,
  handleOrderDragEnd,
  handleOrderClick,
  shouldHighlightRed,
  selectedOrders,
  handleDownloadLinePdf,
}) => (
  <div className="flex">
    {/* Left column: Line info + PDF download button. Not sticky, scrolls with rest of grid. */}
    <div className="w-48 p-4 border-r border-border bg-card flex flex-col items-start">
      <div className="font-medium">{line.name}</div>
      <div className="text-sm text-muted-foreground">
        Capacity: {line.capacity}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 flex items-center gap-1"
        onClick={() => handleDownloadLinePdf(line.id, line.name)}
        title="Download Production Plan PDF"
      >
        <FileDown className="w-4 h-4 mr-1" />
        <span>Plan PDF</span>
      </Button>
    </div>
    {dates.map((date) => {
      const cellKey = `${line.id}-${date.toISOString().split('T')[0]}`;
      const isHighlighted = dragHighlight === cellKey;
      const utilizationPercent = calculateTotalUtilization(line.id, date);
      const ordersInCell = getOrdersForCell(line.id, date);
      const isHolidayCell = isHoliday(date);
      const availableCapacity = getAvailableCapacity(line.id, date);

      return (
        <div
          key={cellKey}
          className={`w-32 min-h-[120px] border-r border-border relative transition-all duration-200 ${
            isHolidayCell 
              ? 'bg-muted/50' 
              : isHighlighted 
                ? 'bg-primary/20 border-primary border-2' 
                : 'bg-background hover:bg-muted/20'
          }`}
          onDrop={(e) => handleDrop(e, line.id, date)}
          onDragOver={handleDragOver}
          onDragEnter={(e) => handleDragEnter(e, line.id, date)}
          onDragLeave={handleDragLeave}
        >
          {/* Capacity utilization bar */}
          {utilizationPercent > 0 && !isHolidayCell && (
            <div 
              className="absolute bottom-0 left-0 right-0 bg-primary/30 transition-all duration-300"
              style={{ height: `${Math.min(utilizationPercent, 100)}%` }}
            />
          )}
          
          {/* Drop zone indicator */}
          {!isHolidayCell && ordersInCell.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          
          {/* Available capacity indicator */}
          {!isHolidayCell && availableCapacity > 0 && ordersInCell.length > 0 && (
            <div className="absolute top-1 right-1 text-xs bg-green-100 text-green-800 px-1 rounded">
              {availableCapacity}
            </div>
          )}
          
          {/* Drag highlight indicator */}
          {isHighlighted && !isHolidayCell && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/10 border-2 border-primary border-dashed rounded">
              <div className="text-xs font-medium text-primary bg-background px-2 py-1 rounded shadow">
                Drop Here
              </div>
            </div>
          )}
          
          {/* Orders in cell */}
          <div className="p-1 space-y-1 relative z-10 h-full flex flex-col">
            {ordersInCell.map((scheduledOrder, index) => {
              const dateStr = date.toISOString().split('T')[0];
              const dailyQty = scheduledOrder.actualProduction?.[dateStr] || 0;
              const shouldHighlight = shouldHighlightRed(scheduledOrder, date);
              const orderUtilization = (dailyQty / line.capacity) * 100;
              const isSelected = selectedOrders.has(scheduledOrder.id);

              return (
                <SchedulingOrderCell
                  key={`${scheduledOrder.id}-${dateStr}`}
                  scheduledOrder={scheduledOrder}
                  date={date}
                  index={index}
                  line={line}
                  onOrderMovedToPending={onOrderMovedToPending}
                  onOrderSplit={onOrderSplit}
                  handleOrderDragStart={handleOrderDragStart}
                  handleOrderDragEnd={handleOrderDragEnd}
                  handleOrderClick={handleOrderClick}
                  shouldHighlight={shouldHighlight}
                  isSelected={isSelected}
                  dailyQty={dailyQty}
                  orderUtilization={orderUtilization}
                />
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
);

export default SchedulingBoardLineRow;

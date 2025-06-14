import React from "react";
import { ProductionLine, Holiday, RampUpPlan, Order } from "../../types/scheduler";
import { GripVertical, ArrowLeft, Scissors } from 'lucide-react';
import { Button } from '../ui/button';

// Types needed for grid rendering
interface ProductionGridProps {
  productionLines: ProductionLine[];
  dates: Date[];
  isHoliday: (date: Date) => boolean;
  getOrdersForCell: (lineId: string, date: Date) => Order[];
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
  selectedOrders: Set<string>;
  isMultiSelectMode: boolean;
  shouldHighlightRed: (order: Order, date: Date) => boolean;
}

export const ProductionGrid: React.FC<ProductionGridProps> = ({
  productionLines,
  dates,
  isHoliday,
  getOrdersForCell,
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
  selectedOrders,
  isMultiSelectMode,
  shouldHighlightRed,
}) => (
  <div className="flex-1">
    {productionLines.map((line) => (
      <div key={line.id} className="flex border-b border-border">
        {dates.map((date) => {
          const cellKey = `${line.id}-${date.toISOString().split("T")[0]}`;
          const isHighlighted = dragHighlight === cellKey;
          const utilizationPercent = calculateTotalUtilization(line.id, date);
          const ordersInCell = getOrdersForCell(line.id, date);
          const isHolidayCell = isHoliday(date);
          const availableCapacity = getAvailableCapacity(line.id, date);

          return (
            <div
              key={cellKey}
              className={`w-32 min-h-[120px] border-r border-border relative transition-all duration-200 flex-shrink-0 ${
                isHolidayCell 
                  ? "bg-muted/50"
                  : isHighlighted
                    ? "bg-primary/20 border-primary border-2"
                    : "bg-background hover:bg-muted/20"
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
                  <span className="h-4 w-4 text-muted-foreground">+</span>
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
                  const dateStr = date.toISOString().split("T")[0];
                  const dailyQty = scheduledOrder.actualProduction?.[dateStr] || 0;
                  const shouldHighlight = shouldHighlightRed(scheduledOrder, date);
                  const orderUtilization = (dailyQty / line.capacity) * 100;
                  const isSelected = selectedOrders.has(scheduledOrder.id);
                  
                  return (
                    <div 
                      key={`${scheduledOrder.id}-${dateStr}`}
                      className={`rounded text-xs p-1 group cursor-move transition-colors flex-1 min-h-[60px] ${
                        isSelected 
                          ? "ring-2 ring-blue-500 bg-blue-50" 
                          : shouldHighlight 
                            ? "bg-red-100 border-2 border-red-500 text-red-800" 
                            : index % 2 === 0
                              ? "bg-blue-100 border border-blue-300 text-blue-800"
                              : "bg-green-100 border border-green-300 text-green-800"
                      }`}
                      draggable
                      onDragStart={(e) => handleOrderDragStart(e, scheduledOrder)}
                      onDragEnd={handleOrderDragEnd}
                      onClick={(e) => handleOrderClick(e, scheduledOrder.id)}
                      style={{ 
                        height: `${Math.max(orderUtilization, 20)}%`,
                        minHeight: "60px"
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
                })}
              </div>
            </div>
          );
        })}
      </div>
    ))}
  </div>
);

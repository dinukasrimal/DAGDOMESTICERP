
import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { Order } from '../types/scheduler';
import { DraggableOrderSlot } from './DraggableOrderSlot';

interface DroppableCellProps {
  lineId: string;
  date: Date;
  orders: Order[];
  isHoliday: boolean;
  utilizationPercent: number;
  availableCapacity: number;
  onOrderMovedToPending?: (order: Order) => void;
  onOrderSplit?: (orderId: string, splitQuantity: number) => void;
  hoveredCard?: string | null;
  setHoveredCard?: (cardKey: string | null) => void;
  shouldHighlightRed?: (order: Order, date: Date) => boolean;
}

export const DroppableCell: React.FC<DroppableCellProps> = ({
  lineId,
  date,
  orders,
  isHoliday,
  utilizationPercent,
  availableCapacity,
  onOrderMovedToPending,
  onOrderSplit,
  hoveredCard,
  setHoveredCard,
  shouldHighlightRed
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `${lineId}-${date.toISOString().split('T')[0]}`,
    data: {
      lineId,
      date: date.toISOString().split('T')[0],
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-40 h-40 border-r border-gray-200 relative transition-all duration-200 ${
        isHoliday
          ? 'bg-red-50/50'
          : isOver
            ? 'bg-blue-100 border-blue-300 border-2'
            : 'bg-white hover:bg-gray-50'
      }`}
    >
      {/* Utilization Bar */}
      {utilizationPercent > 0 && !isHoliday && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-200 to-blue-100 transition-all duration-300 opacity-60"
          style={{ height: `${Math.min(utilizationPercent, 100)}%` }}
        />
      )}

      {/* Empty Cell Plus Icon */}
      {!isHoliday && orders.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <Plus className="h-6 w-6 text-gray-400" />
        </div>
      )}

      {/* Available Capacity Badge */}
      {!isHoliday && availableCapacity > 0 && orders.length > 0 && (
        <div className="absolute top-2 right-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-md font-semibold shadow-sm">
          {availableCapacity}
        </div>
      )}

      {/* Drop Highlight */}
      {isOver && !isHoliday && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50 border-2 border-blue-300 border-dashed rounded-sm">
          <div className="text-sm font-semibold text-blue-600 bg-white px-3 py-2 rounded-md shadow-sm">
            Drop Here
          </div>
        </div>
      )}

      {/* Orders in Cell */}
      <div className="absolute inset-0 p-1 overflow-hidden">
        <div className="h-full flex flex-col gap-0.5">
          <SortableContext items={orders.map(o => o.id)} strategy={verticalListSortingStrategy}>
            {orders.map((scheduledOrder, index) => {
              const cardCount = orders.length;
              const availableHeight = 152; // 160px - 8px padding
              const minCardHeight = 36; // Minimum height to show product and percentage
              const idealCardHeight = Math.max(minCardHeight, Math.floor(availableHeight / cardCount) - 2);
              const cardHeight = cardCount > 3 ? minCardHeight : idealCardHeight;
              const cardKey = `${scheduledOrder.id}-${date.toISOString().split('T')[0]}`;

              return (
                <div
                  key={scheduledOrder.id}
                  style={{
                    height: hoveredCard === cardKey ? 'auto' : `${cardHeight}px`,
                    minHeight: hoveredCard === cardKey ? '120px' : `${cardHeight}px`,
                    maxHeight: hoveredCard === cardKey ? '200px' : `${cardHeight}px`
                  }}
                >
                  <DraggableOrderSlot
                    scheduledOrder={scheduledOrder}
                    date={date}
                    onOrderMovedToPending={onOrderMovedToPending}
                    onOrderSplit={onOrderSplit}
                    hoveredCard={hoveredCard}
                    setHoveredCard={setHoveredCard}
                    shouldHighlightRed={shouldHighlightRed}
                  />
                </div>
              );
            })}
          </SortableContext>
        </div>
      </div>
    </div>
  );
};

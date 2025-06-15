
import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Order } from '../types/scheduler';

interface DragDropContextType {
  selectedOrders: Set<string>;
  setSelectedOrders: (orders: Set<string>) => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (mode: boolean) => void;
  handleOrderSelect: (orderId: string, ctrlKey: boolean) => void;
  clearSelection: () => void;
  activeId: string | null;
}

const DragDropContextValue = createContext<DragDropContextType | null>(null);

export const useDragDrop = () => {
  const context = useContext(DragDropContextValue);
  if (!context) {
    throw new Error('useDragDrop must be used within a DragDropProvider');
  }
  return context;
};

interface DragDropProviderProps {
  children: React.ReactNode;
  orders: Order[];
  onOrderScheduled: (order: Order, startDate: Date, endDate: Date, dailyPlan: { [date: string]: number }) => Promise<void>;
  onOrderMovedToPending: (order: Order) => void;
}

export const DragDropProvider: React.FC<DragDropProviderProps> = ({
  children,
  orders,
  onOrderScheduled,
  onOrderMovedToPending
}) => {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleOrderSelect = useCallback((orderId: string, ctrlKey: boolean) => {
    if (ctrlKey) {
      setIsMultiSelectMode(true);
      setSelectedOrders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(orderId)) {
          newSet.delete(orderId);
          if (newSet.size === 0) {
            setIsMultiSelectMode(false);
          }
        } else {
          newSet.add(orderId);
        }
        return newSet;
      });
    } else if (!selectedOrders.has(orderId)) {
      setSelectedOrders(new Set());
      setIsMultiSelectMode(false);
    }
  }, [selectedOrders]);

  const clearSelection = useCallback(() => {
    setSelectedOrders(new Set());
    setIsMultiSelectMode(false);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    console.log('🔄 Drag started:', event.active.id);
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    console.log('📍 Drag ended:', event);
    setActiveId(null);
    
    const { active, over } = event;
    if (!over) return;

    const draggedOrderId = active.id as string;
    const draggedOrder = orders.find(o => o.id === draggedOrderId);
    if (!draggedOrder) return;

    // Parse drop target information
    const overData = over.data.current;
    if (!overData || !overData.lineId || !overData.date) return;

    const { lineId, date } = overData;
    console.log(`📋 Dropping on line ${lineId} at ${date}`);

    // Determine which orders to move
    let ordersToMove = [draggedOrder];
    if (isMultiSelectMode && selectedOrders.has(draggedOrderId)) {
      ordersToMove = orders.filter(o => selectedOrders.has(o.id));
      console.log(`🔄 Moving ${ordersToMove.length} selected orders`);
    }

    // Move all orders to pending first to prevent conflicts
    for (const order of ordersToMove) {
      await onOrderMovedToPending(order);
    }

    // Clear selection after successful operation
    clearSelection();
  }, [orders, selectedOrders, isMultiSelectMode, onOrderMovedToPending, clearSelection]);

  const value: DragDropContextType = {
    selectedOrders,
    setSelectedOrders,
    isMultiSelectMode,
    setIsMultiSelectMode,
    handleOrderSelect,
    clearSelection,
    activeId,
  };

  return (
    <DragDropContextValue.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {children}
        <DragOverlay>
          {activeId ? (
            <div className="bg-blue-100 border border-blue-300 rounded p-2 shadow-lg">
              <div className="text-xs font-semibold">
                {isMultiSelectMode && selectedOrders.size > 1
                  ? `${selectedOrders.size} orders selected`
                  : orders.find(o => o.id === activeId)?.poNumber || 'Order'}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </DragDropContextValue.Provider>
  );
};

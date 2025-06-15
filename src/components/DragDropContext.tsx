
import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Order } from '../types/scheduler';

interface DragDropContextProps {
  children: React.ReactNode;
  onDragStart?: (event: DragStartEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  dragOverlay?: React.ReactNode;
}

interface DragDropContextValue {
  selectedOrders: Set<string>;
  isMultiSelectMode: boolean;
  handleOrderSelect: (orderId: string, isMultiSelect?: boolean) => void;
  clearSelection: () => void;
}

const DragDropContextState = createContext<DragDropContextValue | undefined>(undefined);

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
  const [activeId, setActiveId] = useState<string | null>(null);

  const isMultiSelectMode = selectedOrders.size > 0;

  const handleOrderSelect = useCallback((orderId: string, isMultiSelect: boolean = false) => {
    setSelectedOrders(prev => {
      const newSelection = new Set(prev);
      
      if (isMultiSelect) {
        if (newSelection.has(orderId)) {
          newSelection.delete(orderId);
        } else {
          newSelection.add(orderId);
        }
      } else {
        if (newSelection.has(orderId) && newSelection.size === 1) {
          newSelection.clear();
        } else {
          newSelection.clear();
          newSelection.add(orderId);
        }
      }
      
      return newSelection;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedOrders(new Set());
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedOrderId = active.id as string;
    const [lineId, dateStr] = (over.id as string).split('-');
    
    console.log(`Drag end: ${draggedOrderId} to ${lineId} on ${dateStr}`);
    
    // Handle the drag and drop logic here
    // This is where you would implement the actual scheduling logic
  };

  const contextValue: DragDropContextValue = {
    selectedOrders,
    isMultiSelectMode,
    handleOrderSelect,
    clearSelection,
  };

  return (
    <DragDropContextState.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {children}
        <DragOverlay>
          {activeId ? (
            <div className="bg-blue-100 border border-blue-300 p-2 rounded shadow-lg">
              Dragging order...
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </DragDropContextState.Provider>
  );
};

export const useDragDrop = (): DragDropContextValue => {
  const context = useContext(DragDropContextState);
  if (context === undefined) {
    throw new Error('useDragDrop must be used within a DragDropProvider');
  }
  return context;
};

export const DragDropContext: React.FC<DragDropContextProps> = ({
  children,
  onDragStart,
  onDragEnd,
  dragOverlay
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {children}
      <DragOverlay>
        {dragOverlay}
      </DragOverlay>
    </DndContext>
  );
};

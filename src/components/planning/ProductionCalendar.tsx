import React, { useCallback, useMemo } from 'react';
import { useDrop } from 'react-dnd';
import { format, isSameDay, isWeekend } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  MoreVertical, 
  AlertCircle, 
  Calendar,
  ArrowLeft,
  Package,
  Split
} from 'lucide-react';

import { PlannedProductionCard } from './PlannedProductionCard';
import { ProductionLineHeader } from './ProductionLineHeader';

import type { 
  Purchase, 
  ProductionLine, 
  PlannedProduction, 
  Holiday 
} from '@/types/planning';

interface ProductionCalendarProps {
  productionLines: ProductionLine[];
  plannedProduction: PlannedProduction[];
  holidays: Holiday[];
  weekDays: Date[];
  selectedPlanned: Set<string>;
  onPurchaseDrop: (purchase: Purchase, lineId: string, date: Date, targetPlanned?: PlannedProduction) => void;
  onPlannedMove: (planned: PlannedProduction, newLineId: string, newDate: Date) => void;
  onPlannedRightClick: (event: React.MouseEvent, planned: PlannedProduction) => void;
  onPlannedSelect: (plannedId: string, isMultiSelect: boolean) => void;
  onMovePlannedToSidebar: (plannedId: string) => void;
  onSplitPlanned: (planned: PlannedProduction) => void;
}

interface CalendarCellProps {
  line: ProductionLine;
  date: Date;
  plannedItems: PlannedProduction[];
  holidays: Holiday[];
  selectedPlanned: Set<string>;
  onPurchaseDrop: (purchase: Purchase, lineId: string, date: Date, targetPlanned?: PlannedProduction) => void;
  onPlannedMove: (planned: PlannedProduction, newLineId: string, newDate: Date) => void;
  onPlannedRightClick: (event: React.MouseEvent, planned: PlannedProduction) => void;
  onPlannedSelect: (plannedId: string, isMultiSelect: boolean) => void;
  onMovePlannedToSidebar: (plannedId: string) => void;
  onSplitPlanned: (planned: PlannedProduction) => void;
}

const CalendarCell: React.FC<CalendarCellProps> = ({
  line,
  date,
  plannedItems,
  holidays,
  selectedPlanned,
  onPurchaseDrop,
  onPlannedMove,
  onPlannedRightClick,
  onPlannedSelect,
  onMovePlannedToSidebar,
  onSplitPlanned
}) => {
  const dateStr = format(date, 'yyyy-MM-dd');
  const isToday = isSameDay(date, new Date());
  const isWeekendDay = isWeekend(date);
  const isHoliday = holidays.some(h => h.date === dateStr);
  const isPastDate = date < new Date(new Date().setHours(0, 0, 0, 0));

  // Calculate capacity usage
  const usedCapacity = plannedItems.reduce((sum, item) => sum + item.planned_quantity, 0);
  const remainingCapacity = line.capacity - usedCapacity;
  const capacityPercentage = (usedCapacity / line.capacity) * 100;

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ['purchase', 'planned_production'],
    drop: (item: Purchase | PlannedProduction, monitor) => {
      const itemType = monitor.getItemType();
      
      if (itemType === 'purchase') {
        const purchase = item as Purchase;
        const targetPlanned = plannedItems.length > 0 ? plannedItems[0] : undefined;
        onPurchaseDrop(purchase, line.id, date, targetPlanned);
      } else if (itemType === 'planned_production') {
        const planned = item as PlannedProduction;
        onPlannedMove(planned, line.id, date);
      }
    },
    canDrop: () => !isWeekendDay && !isHoliday && !isPastDate,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const cellClassName = cn(
    'min-h-[120px] border-r border-b border-gray-200 p-2 transition-colors relative',
    {
      'bg-blue-50 border-blue-200': isToday,
      'bg-red-50': isHoliday,
      'bg-orange-50': isWeekendDay && !isHoliday,
      'bg-gray-100': isPastDate && !isToday,
      'bg-green-100 border-green-300': isOver && canDrop,
      'bg-red-100 border-red-300': isOver && !canDrop,
      'hover:bg-gray-50': !isOver && !isToday && !isHoliday && !isWeekendDay && !isPastDate,
    }
  );

  return (
    <div ref={drop} className={cellClassName}>
      {/* Date indicator */}
      {isToday && (
        <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
      )}
      
      {/* Holiday indicator */}
      {isHoliday && (
        <div className="absolute top-1 left-1 w-2 h-2 bg-red-500 rounded-full" />
      )}

      {/* Capacity indicator */}
      {plannedItems.length > 0 && (
        <div className="absolute bottom-1 right-1 text-xs text-gray-500">
          <Badge 
            variant="outline" 
            className={cn(
              'text-xs px-1 py-0',
              capacityPercentage > 100 ? 'bg-red-100 text-red-800' :
              capacityPercentage > 80 ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            )}
          >
            {usedCapacity}/{line.capacity}
          </Badge>
        </div>
      )}

      {/* Planned production items */}
      <div className="space-y-1">
        {plannedItems.map((planned, index) => (
          <PlannedProductionCard
            key={planned.id}
            planned={planned}
            isSelected={selectedPlanned.has(planned.id)}
            onSelect={(isMultiSelect) => onPlannedSelect(planned.id, isMultiSelect)}
            onRightClick={(event) => onPlannedRightClick(event, planned)}
            onMoveToSidebar={() => onMovePlannedToSidebar(planned.id)}
            onSplit={() => onSplitPlanned(planned)}
          />
        ))}
      </div>

      {/* Empty state indicators */}
      {plannedItems.length === 0 && (
        <>
          {isWeekendDay && !isHoliday && (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-orange-600 font-medium">Weekend</span>
            </div>
          )}
          {isHoliday && (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-red-600 font-medium">Holiday</span>
            </div>
          )}
          {isPastDate && !isToday && !isWeekendDay && !isHoliday && (
            <div className="flex items-center justify-center h-full">
              <span className="text-xs text-gray-400 font-medium">Past</span>
            </div>
          )}
          {!isPastDate && !isWeekendDay && !isHoliday && canDrop && (
            <div className="flex items-center justify-center h-full opacity-0 hover:opacity-50 transition-opacity">
              <div className="text-center">
                <Package className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                <span className="text-xs text-gray-400">Drop here</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const ProductionCalendar: React.FC<ProductionCalendarProps> = ({
  productionLines,
  plannedProduction,
  holidays,
  weekDays,
  selectedPlanned,
  onPurchaseDrop,
  onPlannedMove,
  onPlannedRightClick,
  onPlannedSelect,
  onMovePlannedToSidebar,
  onSplitPlanned
}) => {
  // Group planned production by line and date
  const plannedByLineAndDate = useMemo(() => {
    const grouped: Record<string, Record<string, PlannedProduction[]>> = {};
    
    plannedProduction.forEach(planned => {
      const lineId = planned.line_id;
      const date = planned.planned_date;
      
      if (!grouped[lineId]) {
        grouped[lineId] = {};
      }
      if (!grouped[lineId][date]) {
        grouped[lineId][date] = [];
      }
      
      grouped[lineId][date].push(planned);
    });

    // Sort by order_index within each date
    Object.keys(grouped).forEach(lineId => {
      Object.keys(grouped[lineId]).forEach(date => {
        grouped[lineId][date].sort((a, b) => a.order_index - b.order_index);
      });
    });

    return grouped;
  }, [plannedProduction]);

  const getPlannedForLineAndDate = useCallback((lineId: string, date: Date): PlannedProduction[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return plannedByLineAndDate[lineId]?.[dateStr] || [];
  }, [plannedByLineAndDate]);

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div className="min-w-[800px]">
        {/* Calendar Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
          <div className="grid" style={{ gridTemplateColumns: '200px repeat(7, 1fr)' }}>
            {/* Empty cell for line names column */}
            <div className="p-4 border-r border-gray-200 bg-gray-50">
              <span className="font-semibold text-sm text-gray-700">Production Lines</span>
            </div>
            
            {/* Date headers */}
            {weekDays.map((date) => {
              const isToday = isSameDay(date, new Date());
              const isWeekendDay = isWeekend(date);
              const dateStr = format(date, 'yyyy-MM-dd');
              const isHoliday = holidays.some(h => h.date === dateStr);
              
              return (
                <div
                  key={date.toISOString()}
                  className={cn(
                    'p-4 border-r border-gray-200 text-center',
                    {
                      'bg-blue-100 border-blue-200': isToday,
                      'bg-red-100': isHoliday,
                      'bg-orange-100': isWeekendDay && !isHoliday,
                      'bg-gray-50': !isToday && !isHoliday && !isWeekendDay,
                    }
                  )}
                >
                  <div className={cn(
                    'text-sm font-semibold',
                    {
                      'text-blue-700': isToday,
                      'text-red-700': isHoliday,
                      'text-orange-700': isWeekendDay && !isHoliday,
                      'text-gray-700': !isToday && !isHoliday && !isWeekendDay,
                    }
                  )}>
                    {format(date, 'EEE')}
                  </div>
                  <div className={cn(
                    'text-lg font-bold mt-1',
                    {
                      'text-blue-800': isToday,
                      'text-red-800': isHoliday,
                      'text-orange-800': isWeekendDay && !isHoliday,
                      'text-gray-800': !isToday && !isHoliday && !isWeekendDay,
                    }
                  )}>
                    {format(date, 'd')}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {format(date, 'MMM')}
                  </div>
                  {isToday && (
                    <div className="text-xs text-blue-600 font-medium mt-1">Today</div>
                  )}
                  {isHoliday && (
                    <div className="text-xs text-red-600 font-medium mt-1">Holiday</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Calendar Body */}
        <div className="grid" style={{ gridTemplateColumns: '200px repeat(7, 1fr)' }}>
          {productionLines.map((line) => (
            <React.Fragment key={line.id}>
              {/* Production Line Header */}
              <ProductionLineHeader line={line} />
              
              {/* Calendar cells for this line */}
              {weekDays.map((date) => (
                <CalendarCell
                  key={`${line.id}-${date.toISOString()}`}
                  line={line}
                  date={date}
                  plannedItems={getPlannedForLineAndDate(line.id, date)}
                  holidays={holidays}
                  selectedPlanned={selectedPlanned}
                  onPurchaseDrop={onPurchaseDrop}
                  onPlannedMove={onPlannedMove}
                  onPlannedRightClick={onPlannedRightClick}
                  onPlannedSelect={onPlannedSelect}
                  onMovePlannedToSidebar={onMovePlannedToSidebar}
                  onSplitPlanned={onSplitPlanned}
                />
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Empty state */}
        {productionLines.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">No production lines configured</p>
            <p className="text-gray-400 text-xs mt-1">
              Create production lines to start planning
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
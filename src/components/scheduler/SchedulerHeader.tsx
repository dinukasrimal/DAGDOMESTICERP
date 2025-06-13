
import React from 'react';
import { CalendarDays } from 'lucide-react';
import { Holiday } from '../../types/scheduler';

interface SchedulerHeaderProps {
  dates: Date[];
  holidays: Holiday[];
}

export const SchedulerHeader: React.FC<SchedulerHeaderProps> = ({ dates, holidays }) => {
  const isHoliday = (date: Date) => {
    return holidays.some(h => h.date.toDateString() === date.toDateString());
  };

  const getHolidayName = (date: Date) => {
    const holiday = holidays.find(h => h.date.toDateString() === date.toDateString());
    return holiday?.name || '';
  };

  return (
    <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
      <div className="flex">
        <div className="w-48 p-4 border-r border-border bg-card">
          <div className="flex items-center space-x-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Production Lines</span>
          </div>
        </div>
        {dates.map((date) => {
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const holiday = isHoliday(date);
          
          return (
            <div
              key={date.toISOString()}
              className={`w-32 p-2 border-r border-border text-center transition-colors ${
                holiday 
                  ? 'bg-red-50 border-red-200 text-red-800' 
                  : isWeekend 
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-card'
              }`}
            >
              <div className="text-xs font-medium">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className="text-sm font-semibold">
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              {holiday && (
                <div className="text-xs text-red-600 font-medium mt-1 truncate" title={getHolidayName(date)}>
                  {getHolidayName(date)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

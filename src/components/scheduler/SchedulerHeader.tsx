
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

  return (
    <div className="sticky top-0 z-10 bg-card border-b border-border">
      <div className="flex">
        <div className="w-48 p-4 border-r border-border bg-card">
          <div className="flex items-center space-x-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Production Lines</span>
          </div>
        </div>
        {dates.map((date) => (
          <div
            key={date.toISOString()}
            className={`w-32 p-2 border-r border-border text-center ${
              isHoliday(date) ? 'bg-red-50 border-red-200' : 'bg-card'
            }`}
          >
            <div className="text-xs font-medium">
              {date.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="text-sm">
              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            {isHoliday(date) && (
              <div className="text-xs text-red-600 font-medium">Holiday</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

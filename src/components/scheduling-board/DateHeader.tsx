
import React from "react";
import { CalendarDays } from "lucide-react";
import { Holiday } from "../../types/scheduler";

interface DateHeaderProps {
  dates: Date[];
  isHoliday: (date: Date) => boolean;
}

export const DateHeader: React.FC<DateHeaderProps> = ({ dates, isHoliday }) => (
  <div className="flex">
    {dates.map((date) => (
      <div
        key={date.toISOString()}
        className={`w-32 min-h-[64px] p-2 border-r border-border text-center flex-shrink-0 flex flex-col justify-center
          ${isHoliday(date) ? "bg-muted/50" : "bg-card"}
        `}
      >
        <div className="text-xs font-medium">
          {date.toLocaleDateString("en-US", { weekday: "short" })}
        </div>
        <div className="text-base font-semibold">
          {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
        {isHoliday(date) && (
          <div className="text-xs text-destructive font-medium">Holiday</div>
        )}
      </div>
    ))}
  </div>
);

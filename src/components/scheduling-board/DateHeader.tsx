
import React from "react";
import { CalendarDays } from "lucide-react";
import { Holiday } from "../../types/scheduler";

interface DateHeaderProps {
  dates: Date[];
  isHoliday: (date: Date) => boolean;
  headerScrollRef: React.RefObject<HTMLDivElement>;
}

export const DateHeader: React.FC<DateHeaderProps> = ({ dates, isHoliday, headerScrollRef }) => (
  <div className="flex w-full z-20">
    {/* Fixed line header column */}
    <div className="w-48 p-4 border-r border-border bg-card flex-shrink-0" style={{ position: "sticky", left: 0, top: 0, zIndex: 20 }}>
      <div className="flex items-center space-x-2 mb-2">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <span className="font-medium">Production Lines</span>
      </div>
    </div>
    {/* Scrollable date headers */}
    <div
      ref={headerScrollRef}
      className="flex overflow-hidden flex-1"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--background)",
      }}
    >
      {dates.map(date => (
        <div
          key={date.toISOString()}
          className={`w-32 p-2 border-r border-border text-center flex-shrink-0 ${
            isHoliday(date) ? "bg-muted" : "bg-card"
          }`}
        >
          <div className="text-xs font-medium">
            {date.toLocaleDateString("en-US", { weekday: "short" })}
          </div>
          <div className="text-sm">
            {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
          {isHoliday(date) && (
            <div className="text-xs text-destructive">Holiday</div>
          )}
        </div>
      ))}
    </div>
  </div>
);


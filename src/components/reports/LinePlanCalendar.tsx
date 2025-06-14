
import React from "react";
import { Order } from "@/types/scheduler";

interface LinePlanCalendarProps {
  year: number;
  month: number; // 1-based: Jan=1, Dec=12
  orders: Order[];
  lineName: string;
}

// Helper to create a calendar matrix and fill with orders for each day
function getCalendarGrid(year: number, month: number, orders: Order[]): {
  weeks: { day: number | null; date: Date | null; orders: Order[] }[][];
} {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const weeks: { day: number | null; date: Date | null; orders: Order[] }[][] = [];
  let week: typeof weeks[0] = [];
  let dayIdx = 0;

  // Fill leading nulls for days before the 1st of month
  for (let i = 0; i < firstDay.getDay(); i++) {
    week.push({ day: null, date: null, orders: [] });
    dayIdx++;
  }
  // Fill actual days
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month - 1, day);
    // Orders scheduled on this date
    const ordersOnDay = orders.filter((order) => {
      if (!order.planStartDate || !order.planEndDate) return false;
      // Is this date within the scheduled range (inclusive)?
      return (
        date >= order.planStartDate &&
        date <= order.planEndDate
      );
    });
    week.push({ day, date, orders: ordersOnDay });
    dayIdx++;
    if (dayIdx % 7 === 0) {
      weeks.push(week);
      week = [];
      dayIdx = 0;
    }
  }
  // Fill trailing nulls
  if (week.length > 0) {
    while (week.length < 7) {
      week.push({ day: null, date: null, orders: [] });
    }
    weeks.push(week);
  }
  return { weeks };
}

export const LinePlanCalendar: React.FC<LinePlanCalendarProps> = ({
  year,
  month,
  orders,
  lineName,
}) => {
  const { weeks } = getCalendarGrid(year, month, orders);
  const monthStr = new Date(year, month - 1).toLocaleString("default", { month: "long" });

  return (
    <div className="mb-2 w-full">
      <h2 className="text-lg font-semibold mb-2 text-center">{lineName} Plan - {monthStr} {year}</h2>
      <div className="overflow-x-auto">
        <table className="w-full bg-card border rounded-md text-sm">
          <thead>
            <tr className="bg-secondary">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((wd) => (
                <th key={wd} className="p-2 border w-1/7 text-center">{wd}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wIdx) => (
              <tr key={wIdx}>
                {week.map((cell, dIdx) => (
                  <td
                    key={dIdx}
                    className={`border p-1 align-top min-h-[42px] relative ${cell.orders.length ? "bg-blue-50" : ""}`}
                    style={{ verticalAlign: "top", height: 45 }}
                  >
                    {cell.day && (
                      <div className="font-bold text-xs">{cell.day}</div>
                    )}
                    {cell.orders.map((order) => (
                      <div key={order.id} className="text-xs mt-1 rounded bg-blue-100 text-blue-800 px-1 py-0.5 mb-0.5 whitespace-nowrap">
                        {order.poNumber}
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

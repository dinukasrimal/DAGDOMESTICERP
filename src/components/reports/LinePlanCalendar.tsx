
import React from 'react';
import { Order, Holiday, ProductionLine } from '../../types/scheduler';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addDays } from 'date-fns';

interface LinePlanCalendarProps {
  orders: Order[];
  holidays: Holiday[];
  year: number;
  month: number;
  productionLine: ProductionLine;
  reportId: string;
}

export const LinePlanCalendar: React.FC<LinePlanCalendarProps> = ({
  orders,
  holidays,
  year,
  month,
  productionLine,
  reportId
}) => {
  const monthStart = startOfMonth(new Date(year, month, 1));
  const monthEnd = endOfMonth(new Date(year, month, 1));
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get orders with production data for each day
  const getOrdersForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return orders.filter(order => {
      if (!order.actualProduction) return false;
      return order.actualProduction[dateStr] && order.actualProduction[dateStr] > 0;
    });
  };

  // Check if a day is a holiday
  const isHoliday = (date: Date) => {
    return holidays.some(holiday => isSameDay(new Date(holiday.date), date));
  };

  // Calculate delivery date (PED + 2 days)
  const getDeliveryDate = (planEndDate: Date | null) => {
    if (!planEndDate) return 'N/A';
    const deliveryDate = addDays(new Date(planEndDate), 2);
    return format(deliveryDate, 'dd/MM/yyyy');
  };

  // Get unique orders for the table
  const uniqueOrders = orders.filter((order, index, self) => 
    index === self.findIndex(o => o.id === order.id)
  );

  return (
    <div id={reportId} className="p-6 bg-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-center mb-2">
          Production Plan Report
        </h2>
        <h3 className="text-lg font-semibold text-center mb-1">
          {productionLine.name}
        </h3>
        <p className="text-center text-gray-600">
          {format(new Date(year, month, 1), 'MMMM yyyy')}
        </p>
      </div>

      {/* Calendar View */}
      <div className="mb-8">
        <h4 className="text-lg font-semibold mb-4">Monthly Calendar</h4>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-2 text-center font-semibold bg-gray-100 border">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for days before month starts */}
          {Array.from({ length: monthStart.getDay() }).map((_, index) => (
            <div key={`empty-${index}`} className="p-2 border bg-gray-50"></div>
          ))}
          
          {/* Days of the month */}
          {daysInMonth.map(date => {
            const dayOrders = getOrdersForDay(date);
            const isHolidayDay = isHoliday(date);
            
            return (
              <div
                key={format(date, 'yyyy-MM-dd')}
                className={`p-2 border min-h-[80px] ${
                  isHolidayDay ? 'bg-red-100' : dayOrders.length > 0 ? 'bg-blue-100' : 'bg-white'
                }`}
              >
                <div className="font-semibold text-sm">
                  {format(date, 'd')}
                </div>
                {isHolidayDay && (
                  <div className="text-xs text-red-600 font-medium">Holiday</div>
                )}
                {dayOrders.map(order => (
                  <div key={order.id} className="text-xs bg-blue-200 rounded px-1 mt-1 truncate">
                    {order.poNumber}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Orders Table */}
      <div>
        <h4 className="text-lg font-semibold mb-4">Order Details</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order Number</TableHead>
              <TableHead>PSD (Plan Start Date)</TableHead>
              <TableHead>PED (Plan End Date)</TableHead>
              <TableHead>Delivery Date (PED + 2 days)</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uniqueOrders.length > 0 ? (
              uniqueOrders.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.poNumber}</TableCell>
                  <TableCell>
                    {order.planStartDate ? format(new Date(order.planStartDate), 'dd/MM/yyyy') : 'N/A'}
                  </TableCell>
                  <TableCell>
                    {order.planEndDate ? format(new Date(order.planEndDate), 'dd/MM/yyyy') : 'N/A'}
                  </TableCell>
                  <TableCell>
                    {getDeliveryDate(order.planEndDate)}
                  </TableCell>
                  <TableCell>{order.orderQuantity}</TableCell>
                  <TableCell className="capitalize">{order.status?.replace('_', ' ')}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-500">
                  No orders scheduled for this month
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Legend */}
      <div className="mt-6 flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-100 border"></div>
          <span>Scheduled Orders</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-100 border"></div>
          <span>Holidays</span>
        </div>
      </div>
    </div>
  );
};


import React, { useState, useMemo } from 'react';
import { Order } from '../../types/scheduler';
import { addDays, format, getYear, getMonth, parse } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DeliveryReportContentProps {
  orders: Order[];
  reportId: string;
}

export const DeliveryReportContent: React.FC<DeliveryReportContentProps> = ({ orders, reportId }) => {
  const currentYear = getYear(new Date());
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date())); // 0-indexed

  const years = useMemo(() => {
    const uniqueYears = new Set<number>();
    orders.forEach(order => {
      if (order.planEndDate) {
        const deliveryDate = addDays(new Date(order.planEndDate), 2);
        uniqueYears.add(getYear(deliveryDate));
      }
    });
    if (uniqueYears.size === 0) uniqueYears.add(currentYear); // ensure at least current year
    return Array.from(uniqueYears).sort((a, b) => b - a);
  }, [orders, currentYear]);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const reportData = useMemo(() => {
    return orders
      .filter(order => order.status === 'completed' && order.planEndDate)
      .map(order => {
        const ped = new Date(order.planEndDate!);
        const deliveryDate = addDays(ped, 2);
        return {
          ...order,
          pedStr: format(ped, 'yyyy-MM-dd'),
          deliveryDateStr: format(deliveryDate, 'yyyy-MM-dd'),
          deliveryYear: getYear(deliveryDate),
          deliveryMonth: getMonth(deliveryDate),
        };
      })
      .filter(order => order.deliveryYear === selectedYear && order.deliveryMonth === selectedMonth);
  }, [orders, selectedYear, selectedMonth]);

  return (
    <div id={reportId}>
      <div className="flex gap-4 mb-4 items-center">
        <div>
          <label htmlFor="year-select" className="text-sm font-medium mr-2">Year:</label>
          <Select
            value={selectedYear.toString()}
            onValueChange={(val) => setSelectedYear(parseInt(val))}
          >
            <SelectTrigger className="w-[120px]" id="year-select">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="month-select" className="text-sm font-medium mr-2">Month:</label>
          <Select
            value={selectedMonth.toString()}
            onValueChange={(val) => setSelectedMonth(parseInt(val))}
          >
            <SelectTrigger className="w-[180px]" id="month-select">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((month, index) => (
                <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <h3 className="text-lg font-semibold mb-2">Order Delivery Details</h3>
       <ScrollArea className="h-[400px] border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Style ID</TableHead>
              <TableHead>Order Qty</TableHead>
              <TableHead>PED</TableHead>
              <TableHead>Calculated Delivery Date (PED+2)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportData.map(order => (
              <TableRow key={order.id}>
                <TableCell>{order.poNumber}</TableCell>
                <TableCell>{order.styleId}</TableCell>
                <TableCell>{order.orderQuantity}</TableCell>
                <TableCell>{order.pedStr}</TableCell>
                <TableCell>{order.deliveryDateStr}</TableCell>
              </TableRow>
            ))}
            {reportData.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center">No delivery data for selected month/year.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

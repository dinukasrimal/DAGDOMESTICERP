
import React, { useMemo } from 'react';
import { Order, Holiday } from '../../types/scheduler';
import { subDays, format, startOfWeek, parseISO, getWeek, isSameWeek } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CuttingReportContentProps {
  orders: Order[];
  holidays: Holiday[]; // We might need this if cutting days should skip holidays
  reportId: string;
}

interface WeeklyCuttingSuggestion {
  weekNumber: number;
  weekStartDate: string;
  suggestedCuttingDay: string;
  orders: Order[];
}

export const CuttingReportContent: React.FC<CuttingReportContentProps> = ({ orders, reportId }) => {
  const reportData = useMemo(() => {
    return orders
      .filter(order => order.planStartDate && (order.status === 'scheduled' || order.status === 'in_progress'))
      .map(order => {
        const psd = order.planStartDate ? new Date(order.planStartDate) : null;
        const ped = order.planEndDate ? new Date(order.planEndDate) : null;
        const cuttingDay = psd ? subDays(psd, 3) : null;
        return {
          ...order,
          psdStr: psd ? format(psd, 'yyyy-MM-dd') : 'N/A',
          pedStr: ped ? format(ped, 'yyyy-MM-dd') : 'N/A',
          cuttingDayStr: cuttingDay ? format(cuttingDay, 'yyyy-MM-dd') : 'N/A',
        };
      });
  }, [orders]);

  const weeklySuggestions = useMemo(() => {
    const suggestions: WeeklyCuttingSuggestion[] = [];
    const groupedByWeek: { [week: number]: Order[] } = {};

    reportData.forEach(order => {
      if (order.planStartDate) {
        const psdDate = new Date(order.planStartDate);
        // getISOWeek is not in date-fns v3. Use getWeek with { weekStartsOn: 1 } for ISO-like week.
        const weekNum = getWeek(psdDate, { weekStartsOn: 1 });
        if (!groupedByWeek[weekNum]) {
          groupedByWeek[weekNum] = [];
        }
        groupedByWeek[weekNum].push(order);
      }
    });

    for (const weekNumStr in groupedByWeek) {
      const weekNum = parseInt(weekNumStr);
      const weekOrders = groupedByWeek[weekNum];
      if (weekOrders.length > 0 && weekOrders[0].planStartDate) {
        const firstPsdOfWeek = new Date(weekOrders[0].planStartDate);
        const weekStart = startOfWeek(firstPsdOfWeek, { weekStartsOn: 1 }); // Monday
        
        // Suggest cutting on Monday of the week of PSDs
        const suggestedCuttingDay = weekStart;

        suggestions.push({
          weekNumber: weekNum,
          weekStartDate: format(weekStart, 'yyyy-MM-dd'),
          suggestedCuttingDay: format(suggestedCuttingDay, 'yyyy-MM-dd'),
          orders: weekOrders,
        });
      }
    }
    return suggestions.sort((a, b) => a.weekNumber - b.weekNumber);
  }, [reportData]);

  return (
    <div id={reportId}>
      <h3 className="text-lg font-semibold mb-2">Order Cutting Details</h3>
      <ScrollArea className="h-[300px] border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Style ID</TableHead>
              <TableHead>Order Qty</TableHead>
              <TableHead>PSD</TableHead>
              <TableHead>PED</TableHead>
              <TableHead>Calculated Cutting Day (PSD-3)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportData.map(order => (
              <TableRow key={order.id}>
                <TableCell>{order.poNumber}</TableCell>
                <TableCell>{order.styleId}</TableCell>
                <TableCell>{order.orderQuantity}</TableCell>
                <TableCell>{order.psdStr}</TableCell>
                <TableCell>{order.pedStr}</TableCell>
                <TableCell>{order.cuttingDayStr}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <h3 className="text-lg font-semibold mt-6 mb-2">Weekly Cutting Suggestions (AI)</h3>
      <p className="text-sm text-muted-foreground mb-2">
        Suggestion: Consolidate cutting for orders with PSDs in the same week to the suggested cutting day (Monday of that week).
      </p>
      <ScrollArea className="h-[300px] border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week (Starts)</TableHead>
              <TableHead>Suggested Cutting Day</TableHead>
              <TableHead>Orders (PO Numbers)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weeklySuggestions.map(suggestion => (
              <TableRow key={suggestion.weekStartDate}>
                <TableCell>{suggestion.weekStartDate}</TableCell>
                <TableCell>{suggestion.suggestedCuttingDay}</TableCell>
                <TableCell>{suggestion.orders.map(o => o.poNumber).join(', ')}</TableCell>
              </TableRow>
            ))}
            {weeklySuggestions.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center">No cutting suggestions available based on current orders.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

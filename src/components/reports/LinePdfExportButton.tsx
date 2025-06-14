
import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addDays, format, getYear, getMonth } from 'date-fns';
import { downloadElementAsPdf } from '@/lib/pdfUtils';
import { Order } from '@/types/scheduler';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface LinePdfExportButtonProps {
  lineId: string;
  lineName: string;
  orders: Order[];
}

export const LinePdfExportButton: React.FC<LinePdfExportButtonProps> = ({ lineId, lineName, orders }) => {
  const [open, setOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(getYear(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date()));
  const [isGenerating, setIsGenerating] = useState(false);

  // Get unique years from orders' planStartDate
  const years = useMemo(() => {
    const setYears = new Set<number>();
    orders.forEach(o => {
      if (o.planStartDate) setYears.add(getYear(new Date(o.planStartDate)));
    });
    const yearsArray = Array.from(setYears);
    if (yearsArray.length === 0) yearsArray.push(getYear(new Date()));
    return yearsArray.sort((a, b) => b - a);
  }, [orders]);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const filteredOrders = useMemo(() => {
    return orders
      .filter(o =>
        o.planStartDate &&
        getYear(new Date(o.planStartDate)) === selectedYear &&
        getMonth(new Date(o.planStartDate)) === selectedMonth
      );
  }, [orders, selectedYear, selectedMonth]);

  const reportId = `pdf-line-${lineId}-report`;

  const handleDownload = async () => {
    setIsGenerating(true);
    // We mount the hidden table for PDF, then trigger download
    setTimeout(async () => {
      await downloadElementAsPdf(reportId, `${lineName}_ProductionPlan_${months[selectedMonth]}_${selectedYear}`);
      setIsGenerating(false);
      setOpen(false);
    }, 200); // Allow render
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="ml-2"
        onClick={() => setOpen(true)}
        disabled={isGenerating}
      >
        {isGenerating ? 'Generating...' : 'Export Plan PDF'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export {lineName} Plan as PDF</DialogTitle>
          </DialogHeader>
          <div className="flex gap-4 my-2 items-center">
            <div>
              <label className="text-sm font-medium mr-2">Year:</label>
              <Select
                value={selectedYear.toString()}
                onValueChange={v => setSelectedYear(parseInt(v))}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue placeholder="Year"/>
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mr-2">Month:</label>
              <Select
                value={selectedMonth.toString()}
                onValueChange={v => setSelectedMonth(parseInt(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Month"/>
                </SelectTrigger>
                <SelectContent>
                  {months.map((m, i) => (
                    <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="max-h-56 overflow-auto mb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order No.</TableHead>
                  <TableHead>PSD (Start)</TableHead>
                  <TableHead>PED (End)</TableHead>
                  <TableHead>Delivery (PED+2)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length > 0 ? filteredOrders.map(order => {
                  const psd = order.planStartDate ? format(new Date(order.planStartDate), 'yyyy-MM-dd') : '-';
                  const ped = order.planEndDate ? format(new Date(order.planEndDate), 'yyyy-MM-dd') : '-';
                  const delivery = order.planEndDate ? format(addDays(new Date(order.planEndDate), 2), 'yyyy-MM-dd') : '-';
                  return (
                    <TableRow key={order.id}>
                      <TableCell>{order.poNumber}</TableCell>
                      <TableCell>{psd}</TableCell>
                      <TableCell>{ped}</TableCell>
                      <TableCell>{delivery}</TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No orders scheduled for selected month/year.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="default"
              onClick={handleDownload}
              disabled={filteredOrders.length === 0 || isGenerating}
            >
              Download PDF
            </Button>
          </DialogFooter>
          {/* Hidden report for PDF generation */}
          <div id={reportId} style={{ position: 'absolute', top: -10000, left: -10000, width: 900, background: '#fff', padding: 16 }}>
            <h2 className="text-xl font-bold mb-2">{lineName} Production Plan - {months[selectedMonth]}, {selectedYear}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order No.</TableHead>
                  <TableHead>PSD (Start)</TableHead>
                  <TableHead>PED (End)</TableHead>
                  <TableHead>Delivery (PED+2)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map(order => {
                  const psd = order.planStartDate ? format(new Date(order.planStartDate), 'yyyy-MM-dd') : '-';
                  const ped = order.planEndDate ? format(new Date(order.planEndDate), 'yyyy-MM-dd') : '-';
                  const delivery = order.planEndDate ? format(addDays(new Date(order.planEndDate), 2), 'yyyy-MM-dd') : '-';
                  return (
                    <TableRow key={order.id}>
                      <TableCell>{order.poNumber}</TableCell>
                      <TableCell>{psd}</TableCell>
                      <TableCell>{ped}</TableCell>
                      <TableCell>{delivery}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

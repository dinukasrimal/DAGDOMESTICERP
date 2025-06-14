
import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Order, Holiday, ProductionLine } from '../../types/scheduler';
import { LinePlanCalendar } from './LinePlanCalendar';
import { downloadElementAsPdf } from '../../lib/pdfUtils';

interface LinePlanReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  productionLine: ProductionLine;
  orders: Order[];
  holidays: Holiday[];
}

export const LinePlanReportDialog: React.FC<LinePlanReportDialogProps> = ({
  isOpen,
  onClose,
  productionLine,
  orders,
  holidays
}) => {
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [showReport, setShowReport] = useState(false);

  // Generate year options (current year and next 2 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 3 }, (_, i) => currentYear + i);

  // Month options
  const monthOptions = [
    { value: '0', label: 'January' },
    { value: '1', label: 'February' },
    { value: '2', label: 'March' },
    { value: '3', label: 'April' },
    { value: '4', label: 'May' },
    { value: '5', label: 'June' },
    { value: '6', label: 'July' },
    { value: '7', label: 'August' },
    { value: '8', label: 'September' },
    { value: '9', label: 'October' },
    { value: '10', label: 'November' },
    { value: '11', label: 'December' }
  ];

  // Filter orders for the selected line and month/year
  const filteredOrders = useMemo(() => {
    if (!selectedYear || !selectedMonth || !showReport) return [];

    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth);

    return orders.filter(order => {
      if (order.assignedLineId !== productionLine.id) return false;
      if (!order.planStartDate || !order.planEndDate) return false;

      const startDate = new Date(order.planStartDate);
      const endDate = new Date(order.planEndDate);

      // Check if the order spans across the selected month/year
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);

      return (
        (startDate <= monthEnd && endDate >= monthStart) ||
        (startDate.getFullYear() === year && startDate.getMonth() === month) ||
        (endDate.getFullYear() === year && endDate.getMonth() === month)
      );
    });
  }, [orders, productionLine.id, selectedYear, selectedMonth, showReport]);

  const handleGenerateReport = () => {
    if (selectedYear && selectedMonth) {
      setShowReport(true);
    }
  };

  const handleDownloadPdf = () => {
    downloadElementAsPdf('line-plan-report-content', `${productionLine.name}_Plan_${selectedYear}_${monthOptions[parseInt(selectedMonth)].label}`);
  };

  const handleDialogClose = () => {
    setShowReport(false);
    setSelectedYear('');
    setSelectedMonth('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Production Plan Report - {productionLine.name}</DialogTitle>
        </DialogHeader>

        {!showReport ? (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Select Year</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose year" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Select Month</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose month" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(month => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-grow overflow-auto">
            <LinePlanCalendar
              orders={filteredOrders}
              holidays={holidays}
              year={parseInt(selectedYear)}
              month={parseInt(selectedMonth)}
              productionLine={productionLine}
              reportId="line-plan-report-content"
            />
          </div>
        )}

        <DialogFooter className="mt-4">
          {!showReport ? (
            <>
              <Button onClick={handleDialogClose} variant="outline">
                Cancel
              </Button>
              <Button 
                onClick={handleGenerateReport} 
                disabled={!selectedYear || !selectedMonth}
              >
                Generate Report
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setShowReport(false)} variant="outline">
                Back to Selection
              </Button>
              <Button onClick={handleDownloadPdf}>
                Download PDF
              </Button>
              <Button onClick={handleDialogClose} variant="secondary">
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

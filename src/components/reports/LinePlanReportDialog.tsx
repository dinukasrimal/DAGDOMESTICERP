
import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Download } from "lucide-react";
import { downloadElementAsPdf } from "@/lib/pdfUtils";
import { Order, ProductionLine } from "@/types/scheduler";
import { LinePlanCalendar } from "./LinePlanCalendar";
import { Input } from "@/components/ui/input";

// Utility: get all orders assigned and scheduled for the given line in the given month/year
function getOrdersForLineAndMonth(orders: Order[], lineId: string, year: number, month: number) {
  // month: 1-based (Jan = 1, Dec = 12)
  return orders.filter((order) => {
    if (order.assignedLineId !== lineId || !order.planStartDate || !order.planEndDate) return false;
    const startYear = order.planStartDate.getFullYear();
    const startMonth = order.planStartDate.getMonth() + 1;
    const endYear = order.planEndDate.getFullYear();
    const endMonth = order.planEndDate.getMonth() + 1;
    // Any part of order in the target month?
    return (
      (startYear < year || (startYear === year && startMonth <= month)) &&
      (endYear > year || (endYear === year && endMonth >= month))
    );
  });
}

interface LinePlanReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  line: ProductionLine | null;
  orders: Order[];
}

export const LinePlanReportDialog: React.FC<LinePlanReportDialogProps> = ({
  isOpen,
  onClose,
  line,
  orders,
}) => {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1);

  // Filtered orders for calendar and table
  const filteredOrders = useMemo(() => {
    if (!line) return [];
    return getOrdersForLineAndMonth(orders, line.id, selectedYear, selectedMonth);
  }, [orders, line, selectedYear, selectedMonth]);

  // For PDF download
  const handleDownloadPdf = async () => {
    if (!line) return;
    const elemId = "line-plan-report-content";
    await downloadElementAsPdf(elemId, `${line.name.replace(/\s+/g, "_")}_Plan_${selectedYear}_${String(selectedMonth).padStart(2, "0")}`);
  };

  if (!isOpen || !line) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[900px] w-full max-h-[96vh] flex flex-col gap-2">
        <DialogHeader>
          <DialogTitle>
            {line.name} Plan Report
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-4 items-center mb-2">
          <label className="flex items-center gap-1 text-sm font-medium">
            <CalendarIcon size={16} /> Year:
            <Input
              type="number"
              min={2020}
              max={2100}
              className="w-20"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            />
          </label>
          <label className="flex items-center gap-1 text-sm font-medium">
            Month:
            <select
              className="border rounded px-2 py-1"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }).map((_, idx) => (
                <option value={idx + 1} key={idx}>
                  {new Date(2000, idx).toLocaleString("default", { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <Button className="ml-auto" variant="outline" onClick={handleDownloadPdf}>
            <Download size={16} className="mr-1" /> Download Plan (PDF)
          </Button>
        </div>
        {/* Calendar + Table for printing */}
        <div id="line-plan-report-content" className="bg-white rounded p-2 border">
          <LinePlanCalendar
            year={selectedYear}
            month={selectedMonth}
            orders={filteredOrders}
            lineName={line.name}
          />
          <div className="mt-6">
            <h3 className="text-base font-semibold mb-2">Order Table</h3>
            <div className="overflow-auto">
              <table className="w-full border text-sm bg-background">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-2 border">Order No</th>
                    <th className="p-2 border">PSD</th>
                    <th className="p-2 border">PED</th>
                    <th className="p-2 border">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td className="text-center p-2 border" colSpan={4}>No orders scheduled</td>
                    </tr>
                  )}
                  {filteredOrders.map((order) => {
                    const PSD = order.planStartDate
                      ? order.planStartDate.toISOString().split("T")[0]
                      : "-";
                    const PED = order.planEndDate
                      ? order.planEndDate.toISOString().split("T")[0]
                      : "-";
                    const delivery = order.planEndDate
                      ? (() => {
                          const d = new Date(order.planEndDate!);
                          d.setDate(d.getDate() + 2);
                          return d.toISOString().split("T")[0];
                        })()
                      : "-";
                    return (
                      <tr key={order.id}>
                        <td className="border p-2">{order.poNumber}</td>
                        <td className="border p-2">{PSD}</td>
                        <td className="border p-2">{PED}</td>
                        <td className="border p-2">{delivery}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

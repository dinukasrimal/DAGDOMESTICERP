import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { CuttingRecordSidebar } from '@/components/cutting/CuttingRecordSidebar';
import { CuttingRecordList } from '@/components/cutting/CuttingRecordList';
import { cuttingRecordService, type CuttingRecord } from '@/services/cuttingRecordService';
import { toast } from '@/components/ui/use-toast';

const CuttingRecords: React.FC = () => {
  const [records, setRecords] = useState<CuttingRecord[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'create' | 'edit'>('create');
  const [activeRecord, setActiveRecord] = useState<CuttingRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setIsLoading(true);
    cuttingRecordService
      .listCuttingRecords()
      .then(setRecords)
      .catch((error) => {
        console.error(error);
        toast({
          title: 'Unable to load cutting records',
          description: error instanceof Error ? error.message : 'Please try again later.',
          variant: 'destructive',
        });
      })
      .finally(() => setIsLoading(false));
  }, []);

  const filteredRecords = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const sorted = [...records].sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    });

    if (!term) return sorted;

    return sorted.filter((record) => {
      const matchPo = record.poNumber.toLowerCase().includes(term);
      const matchCode = record.cuttingCode.toLowerCase().includes(term);
      const matchProducts = record.lineItems.some((item) =>
        item.productName.toLowerCase().includes(term)
      );

      return matchPo || matchCode || matchProducts;
    });
  }, [records, searchTerm]);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    setSidebarMode('create');
    setActiveRecord(null);
  }, []);

  const handleNewRecord = () => {
    setSidebarMode('create');
    setActiveRecord(null);
    setIsSidebarOpen(true);
  };

  const handleEditRecord = (record: CuttingRecord) => {
    setSidebarMode('edit');
    setActiveRecord(record);
    setIsSidebarOpen(true);
  };

  const handleSaveRecord = (record: CuttingRecord) => {
    setRecords((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === record.id);
      if (existingIndex === -1) {
        return [record, ...prev];
      }
      const next = [...prev];
      next[existingIndex] = record;
      return next;
    });
    closeSidebar();
  };

  const handleDeleteRecord = async (record: CuttingRecord) => {
    const confirmed = window.confirm(`Delete cutting record ${record.poNumber}?`);
    if (!confirmed) return;

    try {
      await cuttingRecordService.deleteCuttingRecord(record.id);
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
      toast({
        title: 'Cutting record deleted',
        description: `${record.poNumber} removed successfully.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Failed to delete cutting record',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    }
  };

  const handlePrintRecord = (record: CuttingRecord) => {
    const printWindow = window.open('', 'cutting-record-print', 'width=800,height=900');
    if (!printWindow) {
      toast({
        title: 'Unable to open print window',
        description: 'Please allow pop-ups for this site and try again.',
        variant: 'destructive',
      });
      return;
    }

    const totalCutQty = record.totalCutQuantity ?? record.lineItems.reduce((sum, line) => {
      const qty = typeof line.cutQuantity === 'number' ? line.cutQuantity : 0;
      return sum + qty;
    }, 0);

    const documentHtml = `
      <html>
        <head>
          <title>Cutting Record - ${record.poNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 8px; }
            h2 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f5f5f5; }
            .meta { margin-top: 12px; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1>Cutting Record</h1>
          <div class="meta">
            <div><strong>PO:</strong> ${record.poNumber}</div>
            <div><strong>Recorded:</strong> ${record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</div>
            <div><strong>Weight:</strong> ${record.weightKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg</div>
            <div><strong>Total Cut:</strong> ${totalCutQty.toLocaleString()} pcs</div>
          </div>
          <h2>Line Items</h2>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Ordered</th>
                <th>Cut Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              ${record.lineItems.map((line) => `
                <tr>
                  <td>${line.productName}</td>
                  <td>${typeof line.orderedQuantity === 'number' ? line.orderedQuantity.toLocaleString() : '—'}</td>
                  <td>${typeof line.cutQuantity === 'number' ? line.cutQuantity.toLocaleString() : '0'}</td>
                  <td>${line.unitOfMeasure ?? ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(documentHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <ModernLayout
      title="Cutting Records"
      description="Capture cutting activity with accurate weights and line details."
      icon={PlusCircle}
      gradient="bg-gradient-to-r from-emerald-500 to-teal-500"
    >
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Record new cutting entries</h2>
            <p className="text-sm text-muted-foreground">
              Select a PO, log cut quantities per line, and store the mandatory weight of each cut.
            </p>
          </div>
          <Button onClick={handleNewRecord} className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" />
            New Cutting Record
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="w-full md:w-80">
            <Input
              placeholder="Search by PO number, cutting ID, or product..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredRecords.length} record{filteredRecords.length === 1 ? '' : 's'} shown
          </div>
        </div>

        <Separator />

        <CuttingRecordList
          records={filteredRecords}
          isLoading={isLoading}
          onEdit={handleEditRecord}
          onDelete={handleDeleteRecord}
          onPrint={handlePrintRecord}
        />
      </div>

      <CuttingRecordSidebar
        open={isSidebarOpen}
        mode={sidebarMode}
        record={activeRecord}
        onOpenChange={(value) => {
          if (!value) {
            closeSidebar();
          } else {
            setIsSidebarOpen(true);
          }
        }}
        onSave={handleSaveRecord}
      />
    </ModernLayout>
  );
};

export default CuttingRecords;

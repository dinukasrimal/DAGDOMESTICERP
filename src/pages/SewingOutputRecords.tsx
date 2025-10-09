import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Shirt } from 'lucide-react';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { SewingOutputSidebar } from '@/components/sewing/SewingOutputSidebar';
import { SewingOutputList } from '@/components/sewing/SewingOutputList';
import {
  sewingOutputRecordService,
  type SewingOutputRecordEntry,
} from '@/services/sewingOutputRecordService';
import { toast } from '@/components/ui/use-toast';

const SewingOutputRecords: React.FC = () => {
  const [records, setRecords] = useState<SewingOutputRecordEntry[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setIsLoading(true);
    sewingOutputRecordService
      .listRecords()
      .then(setRecords)
      .catch((error) => {
        console.error(error);
        toast({
          title: 'Unable to load sewing output records',
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
      const supplierMatch = record.supplierName.toLowerCase().includes(term);
      const codeMatch = record.outputCode.toLowerCase().includes(term);
      const poMatch = record.lineItems.some((line) => line.poNumber.toLowerCase().includes(term));
      return supplierMatch || codeMatch || poMatch;
    });
  }, [records, searchTerm]);

  const handleSaveRecord = (record: SewingOutputRecordEntry) => {
    setRecords((prev) => [record, ...prev]);
    setIsSidebarOpen(false);
  };

  const handleDeleteRecord = async (record: SewingOutputRecordEntry) => {
    const confirmed = window.confirm(`Delete sewing output record ${record.outputCode}?`);
    if (!confirmed) return;

    try {
      await sewingOutputRecordService.deleteRecord(record.id);
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
      toast({
        title: 'Sewing output deleted',
        description: `${record.outputCode} removed successfully.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Failed to delete sewing output record',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    }
  };

  const handlePrintRecord = (record: SewingOutputRecordEntry) => {
    const printWindow = window.open('', 'sewing-output-print', 'width=800,height=900');
    if (!printWindow) {
      toast({
        title: 'Unable to open print window',
        description: 'Please allow pop-ups for this site and try again.',
        variant: 'destructive',
      });
      return;
    }

    const documentHtml = `
      <html>
        <head>
          <title>Sewing Output - ${record.outputCode}</title>
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
          <h1>Sewing Output Record</h1>
          <div class="meta">
            <div><strong>Output ID:</strong> ${record.outputCode}</div>
            <div><strong>Supplier:</strong> ${record.supplierName}</div>
            <div><strong>Recorded:</strong> ${record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</div>
            <div><strong>Total Output:</strong> ${record.totalOutputQuantity.toLocaleString()}</div>
          </div>
          <h2>Purchase Orders</h2>
          <table>
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Output Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${record.lineItems.map((line) => `
                <tr>
                  <td>${line.poNumber}</td>
                  <td>${line.outputQuantity.toLocaleString()}</td>
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

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  return (
    <ModernLayout
      title="Sewing Output Records"
      description="Record sewing output for suppliers across multiple purchase orders."
      icon={Shirt}
      gradient="bg-gradient-to-r from-indigo-500 to-violet-500"
    >
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Record new sewing output</h2>
            <p className="text-sm text-muted-foreground">
              Select a supplier and log sewing outputs across one or more purchase orders in a single entry.
            </p>
          </div>
          <Button onClick={() => setIsSidebarOpen(true)} className="flex items-center gap-2">
            <Shirt className="h-4 w-4" />
            New Sewing Output
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="w-full md:w-80">
            <Input
              placeholder="Search by supplier, output ID, or PO..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredRecords.length} record{filteredRecords.length === 1 ? '' : 's'} shown
          </div>
        </div>

        <Separator />

        <SewingOutputList
          records={filteredRecords}
          isLoading={isLoading}
          onDelete={handleDeleteRecord}
          onPrint={handlePrintRecord}
        />
      </div>

      <SewingOutputSidebar
        open={isSidebarOpen}
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

export default SewingOutputRecords;

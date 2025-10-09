import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScissorsSquare } from 'lucide-react';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { CutIssueRecordSidebar } from '@/components/cut-issue/CutIssueRecordSidebar';
import { CutIssueRecordList } from '@/components/cut-issue/CutIssueRecordList';
import {
  cutIssueRecordService,
  type CutIssueRecordEntry,
} from '@/services/cutIssueRecordService';
import { toast } from '@/components/ui/use-toast';

const CutIssueRecords: React.FC = () => {
  const [records, setRecords] = useState<CutIssueRecordEntry[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'create' | 'edit'>('create');
  const [activeRecord, setActiveRecord] = useState<CutIssueRecordEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setIsLoading(true);
    cutIssueRecordService
      .listCutIssueRecords()
      .then(setRecords)
      .catch((error) => {
        console.error(error);
        toast({
          title: 'Unable to load cut issue records',
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
      const poMatch = record.poNumber.toLowerCase().includes(term);
      const codeMatch = record.issueCode.toLowerCase().includes(term);
      const supplierMatch = (record.supplierName ?? '').toLowerCase().includes(term);
      const productMatch = record.lineItems.some((item) =>
        item.productName.toLowerCase().includes(term)
      );
      return poMatch || codeMatch || supplierMatch || productMatch;
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

  const handleEditRecord = (record: CutIssueRecordEntry) => {
    setSidebarMode('edit');
    setActiveRecord(record);
    setIsSidebarOpen(true);
  };

  const handleSaveRecord = (record: CutIssueRecordEntry) => {
    setRecords((prev) => {
      const index = prev.findIndex((item) => item.id === record.id);
      if (index === -1) {
        return [record, ...prev];
      }
      const next = [...prev];
      next[index] = record;
      return next;
    });
    closeSidebar();
  };

  const handleDeleteRecord = async (record: CutIssueRecordEntry) => {
    const confirmed = window.confirm(`Delete cut issue record ${record.issueCode}?`);
    if (!confirmed) return;

    try {
      await cutIssueRecordService.deleteCutIssueRecord(record.id);
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
      toast({
        title: 'Cut issue deleted',
        description: `${record.issueCode} removed successfully.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Failed to delete cut issue record',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    }
  };

  const handlePrintRecord = (record: CutIssueRecordEntry) => {
    const printWindow = window.open('', 'cut-issue-print', 'width=800,height=900');
    if (!printWindow) {
      toast({
        title: 'Unable to open print window',
        description: 'Please allow pop-ups for this site and try again.',
        variant: 'destructive',
      });
      return;
    }

    const totalIssuedQty = record.totalCutQuantity ?? record.lineItems.reduce((sum, line) => {
      const qty = typeof line.cutQuantity === 'number' ? line.cutQuantity : 0;
      return sum + qty;
    }, 0);

    const documentHtml = `
      <html>
        <head>
          <title>Cut Issue Record - ${record.issueCode}</title>
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
          <h1>Cut Issue Record</h1>
          <div class="meta">
            <div><strong>Issue ID:</strong> ${record.issueCode}</div>
            <div><strong>PO:</strong> ${record.poNumber}</div>
            <div><strong>Supplier:</strong> ${record.supplierName ?? '—'}</div>
            <div><strong>Recorded:</strong> ${record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</div>
            <div><strong>Weight:</strong> ${record.weightKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg</div>
            <div><strong>Total Issued:</strong> ${totalIssuedQty.toLocaleString()} pcs</div>
          </div>
          <h2>Line Items</h2>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Ordered</th>
                <th>Issued Quantity</th>
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
      title="Cut Issue Records"
      description="Track cut issues with supplier details and issued quantities."
      icon={ScissorsSquare}
      gradient="bg-gradient-to-r from-rose-500 to-orange-500"
    >
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Record new cut issues</h2>
            <p className="text-sm text-muted-foreground">
              Select a PO, choose the supplier, log issued quantities per line, and capture the mandatory weight.
            </p>
          </div>
          <Button onClick={handleNewRecord} className="flex items-center gap-2">
            <ScissorsSquare className="h-4 w-4" />
            New Cut Issue
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="w-full md:w-80">
            <Input
              placeholder="Search by PO, issue ID, supplier, or product..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredRecords.length} record{filteredRecords.length === 1 ? '' : 's'} shown
          </div>
        </div>

        <Separator />

        <CutIssueRecordList
          records={filteredRecords}
          isLoading={isLoading}
          onEdit={handleEditRecord}
          onDelete={handleDeleteRecord}
          onPrint={handlePrintRecord}
        />
      </div>

      <CutIssueRecordSidebar
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

export default CutIssueRecords;

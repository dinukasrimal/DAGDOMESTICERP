import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { issueReturnService, type IssueReturnHeader } from '@/services/issueReturnService';
import { generateSupplierReturnPdf } from '@/lib/pdfUtils';
import { supabase } from '@/integrations/supabase/client';
import { Package, Eye, FileDown } from 'lucide-react';

type TrimReturnRow = {
  materialId: number;
  materialName: string;
  unit: string;
  issuedQty: number;
  unitCost: number;
  returnQty: number;
};

type CutIssueRecord = {
  id: string;
  issue_code: string;
  line_items: Array<{ orderLineId?: string; productName?: string; cutQuantity?: number; unitOfMeasure?: string }>;
  weight_kg: number | null;
};

type CutReturnRow = {
  recordId: string;
  lineIndex: number;
  issueCode: string;
  productName: string;
  currentQty: number;
  unit: string;
  returnQty: number;
};

type PurchaseOrderRecord = {
  id: string;
  name: string | null;
  partner_name: string | null;
  order_lines?: unknown;
};

type IssueReturnRow = IssueReturnHeader & { supplier_display_name?: string; po_number?: string; line_count: number };

type ReturnLineDetail = {
  id: string;
  materialName?: string;
  unit?: string;
  quantity: number;
  notes?: string | null;
  sourceCode?: string | null;
};


const IssueReturns: React.FC = () => {
  const { toast } = useToast();
  const [returns, setReturns] = useState<IssueReturnRow[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingReturn, setViewingReturn] = useState<IssueReturnRow | null>(null);
  const [viewLines, setViewLines] = useState<ReturnLineDetail[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const loadReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const list = await issueReturnService.listReturns();
      setReturns(list as IssueReturnRow[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({ title: 'Failed to load issue returns', description: message, variant: 'destructive' });
    } finally {
      setLoadingReturns(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  const filteredReturns = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return returns;
    return returns.filter(row => (
      (row.return_number || '').toLowerCase().includes(needle) ||
      (row.po_number || '').toLowerCase().includes(needle) ||
      ((row.supplier_display_name || row.supplier_name || '')).toLowerCase().includes(needle)
    ));
  }, [returns, search]);

  const fetchReturnLines = useCallback(async (row: IssueReturnRow): Promise<ReturnLineDetail[]> => {
    const { data, error } = await supabase
      .from('issue_return_lines')
      .select('id, quantity, raw_material:raw_materials(name, purchase_unit), cut_issue_record:cut_issue_records(issue_code)')
      .eq('issue_return_id', row.id);
    if (error) throw new Error(error.message);
    return (data || []).map((entry: any) => ({
      id: entry.id as string,
      materialName: entry.raw_material?.name ?? undefined,
      unit: entry.raw_material?.purchase_unit ?? undefined,
      quantity: Number(entry.quantity || 0),
      sourceCode: entry.cut_issue_record?.issue_code ?? null,
    }));
  }, []);

  const handleViewReturn = useCallback(async (row: IssueReturnRow) => {
    setViewingReturn(row);
    setViewLines([]);
    setViewDialogOpen(true);
    setViewLoading(true);
    try {
      const lines = await fetchReturnLines(row);
      setViewLines(lines);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load return details.';
      toast({ title: 'Load failed', description: message, variant: 'destructive' });
      setViewLines([]);
    } finally {
      setViewLoading(false);
    }
  }, [fetchReturnLines, toast]);

  const handlePrintReturn = useCallback(async (row: IssueReturnRow) => {
    if (row.return_type !== 'trims') {
      toast({ title: 'PDF unavailable', description: 'PDF export is supported for trims returns only.', variant: 'destructive' });
      return;
    }
    try {
      const lines = await fetchReturnLines(row);
      if (!lines.length) {
        toast({ title: 'No lines to print', description: 'This return does not contain any trims lines.', variant: 'destructive' });
        return;
      }
      await generateSupplierReturnPdf({
        poNumber: row.po_number || undefined,
        supplierName: row.supplier_display_name || row.supplier_name || undefined,
        returnDate: row.return_date,
        lines: lines.map(line => ({
          material: line.materialName || line.sourceCode || 'Item',
          unit: line.unit || '',
          quantity: line.quantity,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate PDF.';
      toast({ title: 'PDF failed', description: message, variant: 'destructive' });
    }
  }, [fetchReturnLines, toast]);

  return (
    <ModernLayout
      title="Return From Issues"
      description="Return trims or cut issues from production back to stores"
      icon={Package}
      gradient="bg-gradient-to-r from-slate-500 to-slate-700"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-xl">Issue Returns</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="issue-return-search" className="text-sm text-gray-600">Search</Label>
            <Input
              id="issue-return-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by return number, supplier, or PO"
              className="max-w-sm"
            />
          </div>
          <Button onClick={() => setDialogOpen(true)}>Create Return</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Return History</CardTitle>
            <CardDescription>Recorded returns from issues</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingReturns ? (
              <div className="text-sm text-gray-600">Loading…</div>
            ) : filteredReturns.length === 0 ? (
              <div className="text-sm text-gray-500">No returns found.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>PO</TableHead>
                      <TableHead>Lines</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns.map(row => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono">{row.return_number}</TableCell>
                        <TableCell>{new Date(row.return_date).toLocaleDateString()}</TableCell>
                        <TableCell className="capitalize">{row.return_type}</TableCell>
                        <TableCell>{row.supplier_display_name || row.supplier_name || '—'}</TableCell>
                        <TableCell>{row.po_number || '—'}</TableCell>
                        <TableCell>{row.line_count}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { void handleViewReturn(row); }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { void handlePrintReturn(row); }}
                              disabled={row.return_type !== 'trims'}
                              title={row.return_type === 'trims' ? 'Download PDF' : 'PDF available for trims only'}
                            >
                              <FileDown className="h-4 w-4 mr-1" />
                              PDF
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={viewDialogOpen}
        onOpenChange={(open) => {
          setViewDialogOpen(open);
          if (!open) {
            setViewingReturn(null);
            setViewLines([]);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Issue Return Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {viewingReturn && (
              <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                <div><span className="font-semibold text-gray-900">Return No:</span> {viewingReturn.return_number}</div>
                <div><span className="font-semibold text-gray-900">Date:</span> {new Date(viewingReturn.return_date).toLocaleDateString()}</div>
                <div className="capitalize"><span className="font-semibold text-gray-900">Type:</span> {viewingReturn.return_type}</div>
                <div><span className="font-semibold text-gray-900">Supplier:</span> {viewingReturn.supplier_display_name || viewingReturn.supplier_name || '—'}</div>
                <div><span className="font-semibold text-gray-900">PO:</span> {viewingReturn.po_number || '—'}</div>
              </div>
            )}

            {viewLoading ? (
              <div className="text-sm text-gray-600">Loading lines…</div>
            ) : viewLines.length === 0 ? (
              <div className="text-sm text-gray-500">No lines recorded for this return.</div>
            ) : (
              <div className="overflow-x-auto rounded border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material / Item</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewLines.map(line => (
                      <TableRow key={line.id}>
                        <TableCell>{line.materialName || line.sourceCode || 'Item'}</TableCell>
                        <TableCell>{line.unit || '—'}</TableCell>
                        <TableCell className="text-right">{line.quantity.toLocaleString()}</TableCell>
                        <TableCell>{line.sourceCode || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateIssueReturnDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          setDialogOpen(false);
          void loadReturns();
        }}
      />
    </ModernLayout>
  );
};

interface CreateIssueReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const CreateIssueReturnDialog: React.FC<CreateIssueReturnDialogProps> = ({ open, onOpenChange, onSaved }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'trims' | 'cut'>('trims');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [selectedPOId, setSelectedPOId] = useState('');
  const [trimRows, setTrimRows] = useState<TrimReturnRow[]>([]);
  const [cutRows, setCutRows] = useState<CutReturnRow[]>([]);
  const [cutRecords, setCutRecords] = useState<CutIssueRecord[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  useEffect(() => {
    if (!open) {
      setActiveTab('trims');
      setSelectedSupplierName('');
      setPoSearch('');
      setSelectedPOId('');
      setTrimRows([]);
      setCutRows([]);
      setCutRecords([]);
      setPurchaseOrders([]);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('purchases')
          .select('id, name, partner_name, order_lines')
          .order('date_order', { ascending: false })
          .limit(400);
        if (error) throw new Error(error.message);
        const normalized = (data || []).map(row => ({
          id: String(row.id),
          name: typeof row.name === 'string' ? row.name : null,
          partner_name: typeof row.partner_name === 'string' ? row.partner_name : null,
          order_lines: Array.isArray(row.order_lines) ? row.order_lines : [],
        })) as PurchaseOrderRecord[];
        setPurchaseOrders(normalized);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please try again.';
        toast({ title: 'Failed to load purchase orders', description: message, variant: 'destructive' });
      }
    })();
  }, [open, toast]);

  const supplierOptions = useMemo(() => {
    const names = new Set<string>();
    purchaseOrders.forEach(po => {
      const name = po.partner_name?.trim();
      if (name) names.add(name);
    });
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ value: name, label: name }));
  }, [purchaseOrders]);

  const filteredPOs = useMemo(() => {
    const needle = poSearch.trim().toLowerCase();
    const selectedSupplierLower = selectedSupplierName.trim().toLowerCase();
    return purchaseOrders.filter(po => {
      const supplierLower = (po.partner_name ?? '').toLowerCase();
      if (selectedSupplierLower && supplierLower !== selectedSupplierLower) return false;
      if (!needle) return true;
      if ((po.name ?? '').toLowerCase().includes(needle)) return true;
      if (supplierLower.includes(needle)) return true;
      const lines = Array.isArray(po.order_lines) ? po.order_lines : [];
      return lines.some(line => {
        if (typeof line !== 'object' || line === null) return false;
        const record = line as Record<string, unknown>;
        const productName = record.product_name ?? record.name ?? record.description;
        return typeof productName === 'string' && productName.toLowerCase().includes(needle);
      });
    });
  }, [purchaseOrders, selectedSupplierName, poSearch]);

  const selectedPO = useMemo(
    () => purchaseOrders.find(po => String(po.id) === String(selectedPOId)) || null,
    [purchaseOrders, selectedPOId]
  );

  useEffect(() => {
    if (!selectedPO) {
      setTrimRows([]);
      setCutRows([]);
      setCutRecords([]);
      return;
    }
    const poReference = selectedPO.name ?? selectedPO.id ?? '';
    if (activeTab === 'trims') {
      (async () => {
        setLoadingLines(true);
        try {
          const { data, error } = await supabase
            .from('raw_material_inventory')
            .select(
              'id, raw_material_id, quantity_on_hand, quantity_available, transaction_type, unit_price, location, raw_material:raw_materials(id, name, purchase_unit, category_id)'
            )
            .eq('po_number', poReference)
            .in('transaction_type', ['issue', 'adjustment', 'return']);
          if (error) throw error;
          const materialMap = new Map<
            number,
            {
              material: {
                id: number;
                name: string | null;
                purchase_unit: string | null;
                category_id: number | null;
              };
              totalIssued: number;
              totalReturned: number;
              weightedCost: number;
            }
          >();
          (data || []).forEach(entry => {
            const material = entry.raw_material as unknown as {
              id: number;
              name: string | null;
              purchase_unit: string | null;
              category_id: number | null;
            } | null;
            if (!material) return;
            const categoryId = material.category_id ?? null;
            if (categoryId === 1) return; // skip fabrics
            const quantityRaw = Number(entry.quantity_on_hand ?? entry.quantity_available ?? 0);
            if (!Number.isFinite(quantityRaw)) return;
            const existing = materialMap.get(material.id) ?? {
              material,
              totalIssued: 0,
              totalReturned: 0,
              weightedCost: 0,
            };
            const unitCost = Number(entry.unit_price || 0);
            const location = typeof entry.location === 'string' ? entry.location.toLowerCase() : '';
            const txType = String(entry.transaction_type || '').toLowerCase();
            if (txType === 'issue') {
              const issuedQty = Math.abs(quantityRaw);
              if (issuedQty > 0) {
                existing.totalIssued += issuedQty;
                if (unitCost > 0) {
                  existing.weightedCost += unitCost * issuedQty;
                }
              }
            } else if (txType === 'adjustment' || txType === 'return') {
              const returnedQty = Math.max(0, quantityRaw);
              if (returnedQty > 0 && (location.includes('return') || txType === 'return')) {
                existing.totalReturned += returnedQty;
              }
            }
            materialMap.set(material.id, existing);
          });
          const rows: TrimReturnRow[] = [];
          materialMap.forEach(value => {
            const remaining = value.totalIssued - value.totalReturned;
            if (remaining <= 0) return;
            const avgCost =
              value.weightedCost > 0 && value.totalIssued > 0
                ? value.weightedCost / value.totalIssued
                : 0;
            rows.push({
              materialId: value.material.id,
              materialName: value.material.name || 'Material',
              unit: value.material.purchase_unit || 'pcs',
              issuedQty: remaining,
              unitCost: avgCost,
              returnQty: 0,
            });
          });
          rows.sort((a, b) => a.materialName.localeCompare(b.materialName));
          setTrimRows(rows);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Please try again.';
          toast({ title: 'Failed to load issue lines', description: message, variant: 'destructive' });
          setTrimRows([]);
        } finally {
          setLoadingLines(false);
        }
      })();
    } else {
      (async () => {
        setLoadingLines(true);
        try {
          const { data } = await supabase
            .from('cut_issue_records')
            .select('id, issue_code, line_items, weight_kg')
            .eq('po_number', poReference)
            .order('created_at', { ascending: false });
          const records = (data || []) as CutIssueRecord[];
          setCutRecords(records);
          const rows: CutReturnRow[] = [];
          records.forEach(record => {
            record.line_items?.forEach((item, index) => {
              const currentQty = Number(item.cutQuantity || 0);
              if (currentQty <= 0) return;
              rows.push({
                recordId: record.id,
                lineIndex: index,
                issueCode: record.issue_code,
                productName: item.productName || 'Item',
                currentQty,
                unit: item.unitOfMeasure || 'pcs',
                returnQty: 0,
              });
            });
          });
          setCutRows(rows);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Please try again.';
          toast({ title: 'Failed to load cut issues', description: message, variant: 'destructive' });
          setCutRows([]);
        } finally {
          setLoadingLines(false);
        }
      })();
    }
  }, [activeTab, selectedPO, toast]);

  const supplierName = useMemo(() => {
    if (selectedSupplierName) return selectedSupplierName;
    return selectedPO?.partner_name ?? '—';
  }, [selectedSupplierName, selectedPO]);

  const handleSaveTrimReturn = async () => {
    if (!selectedPO) {
      toast({ title: 'Select a purchase order', variant: 'destructive' });
      return;
    }
    const selectedLines = trimRows.filter(row => row.returnQty > 0);
    if (!selectedLines.length) {
      toast({ title: 'Enter return quantity', description: 'Specify at least one return quantity.', variant: 'destructive' });
      return;
    }
    try {
      const trimmedSupplier = supplierName !== '—' ? supplierName.trim() : '';
      const chosenSupplier = trimmedSupplier ? trimmedSupplier : null;
      const header = await issueReturnService.createHeader({
        return_type: 'trims',
        supplier_id: null,
        supplier_name: chosenSupplier,
        po_id: null,
        po_number: selectedPO.name ?? selectedPO.id ?? null,
        notes: null,
      });

      await issueReturnService.addLines(header.id, selectedLines.map(row => ({
        goods_issue_line_id: null,
        raw_material_id: row.materialId,
        quantity: row.returnQty,
        counts_inventory: true,
      })));

      for (const row of selectedLines) {
        const qty = row.returnQty;
        const unitPrice = Number.isFinite(row.unitCost) ? row.unitCost : 0;
        const now = new Date().toISOString();
        const { error: insertError } = await supabase.from('raw_material_inventory').insert({
          raw_material_id: row.materialId,
          quantity_on_hand: qty,
          quantity_available: qty,
          quantity_reserved: 0,
          unit_price: unitPrice,
          inventory_value: qty * unitPrice,
          location: 'Return from issue',
          transaction_type: 'adjustment',
          transaction_ref: header.return_number,
          po_number: selectedPO.name ?? selectedPO.id ?? null,
          last_updated: now,
        });
        if (insertError) throw new Error(insertError.message);
      }

      await generateSupplierReturnPdf({
        poNumber: selectedPO.name ?? selectedPO.id ?? undefined,
        supplierName: chosenSupplier ?? undefined,
        returnDate: new Date().toISOString().slice(0, 10),
        lines: selectedLines.map(row => ({ material: row.materialName, unit: row.unit, quantity: row.returnQty })),
      });

      toast({ title: 'Return saved', description: header.return_number });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({ title: 'Failed to save trims return', description: message, variant: 'destructive' });
    }
  };

  const handleSaveCutReturn = async () => {
    if (!selectedPO) {
      toast({ title: 'Select a purchase order', variant: 'destructive' });
      return;
    }
    const selectedLines = cutRows.filter(row => row.returnQty > 0);
    if (!selectedLines.length) {
      toast({ title: 'Enter return quantity', description: 'Specify at least one return quantity.', variant: 'destructive' });
      return;
    }
    try {
      const trimmedSupplier = supplierName !== '—' ? supplierName.trim() : '';
      const chosenSupplier = trimmedSupplier ? trimmedSupplier : null;
      const header = await issueReturnService.createHeader({
        return_type: 'cut',
        supplier_id: null,
        supplier_name: chosenSupplier,
        po_id: null,
        po_number: selectedPO.name ?? selectedPO.id ?? null,
        notes: null,
      });
      await issueReturnService.addLines(header.id, selectedLines.map(row => ({
        cut_issue_record_id: row.recordId,
        quantity: row.returnQty,
        counts_inventory: false,
      })));

      // Update cut issue records
      for (const record of cutRecords) {
        const matchingRows = selectedLines.filter(row => row.recordId === record.id);
        if (!matchingRows.length) continue;
        const updatedItems = record.line_items.map((item, index) => {
          const match = matchingRows.find(row => row.lineIndex === index);
          if (!match) return item;
          const newQty = Math.max(0, (item.cutQuantity || 0) - match.returnQty);
          return { ...item, cutQuantity: newQty };
        });
        const total = updatedItems.reduce((sum, item) => sum + Number(item.cutQuantity || 0), 0);
        await supabase
          .from('cut_issue_records')
          .update({ line_items: updatedItems, total_cut_quantity: total })
          .eq('id', record.id);
      }

      toast({ title: 'Cut return saved', description: header.return_number });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({ title: 'Failed to save cut return', description: message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Issue Return</DialogTitle>
          <CardDescription>Select PO and return quantities for trims or cut issues</CardDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as 'trims' | 'cut'); setSelectedPOId(''); setTrimRows([]); setCutRows([]); setCutRecords([]); }}>
            <TabsList>
              <TabsTrigger value="trims">Trims Return</TabsTrigger>
              <TabsTrigger value="cut">Cut Returns</TabsTrigger>
            </TabsList>

            <TabsContent value="trims">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Supplier</Label>
                  <SearchableSelect
                    value={selectedSupplierName}
                    onChange={(value) => { setSelectedSupplierName(value); setSelectedPOId(''); setTrimRows([]); setPoSearch(''); }}
                    placeholder="Select supplier"
                    searchPlaceholder="Search suppliers..."
                    options={supplierOptions}
                  />
                </div>
                <div>
                  <Label>Search PO / material</Label>
                  <Input
                    value={poSearch}
                    onChange={(e) => setPoSearch(e.target.value)}
                    placeholder="Type PO number, material, supplier"
                  />
                </div>
                <div>
                  <Label>Purchase Order</Label>
                  <SearchableSelect
                    value={selectedPOId}
                    onChange={(value) => setSelectedPOId(value)}
                    placeholder={selectedSupplierName ? 'Select purchase order' : 'Select supplier first'}
                    searchPlaceholder="Search purchase orders..."
                    options={filteredPOs.map(po => ({
                      value: String(po.id),
                      label: po.name || po.id,
                      description: po.partner_name || '',
                    }))}
                    disabled={!selectedSupplierName}
                  />
                </div>
              </div>

              {selectedPO && (
                <div className="space-y-3 mt-4">
                  <CardTitle className="text-base">Issued Trims</CardTitle>
                  {loadingLines ? (
                    <div className="text-sm text-gray-600">Loading issue lines…</div>
                  ) : trimRows.length === 0 ? (
                    <div className="text-sm text-gray-500">No trims found for this PO.</div>
                  ) : (
                    <div className="overflow-x-auto rounded border bg-white">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Material</TableHead>
                            <TableHead>Issued</TableHead>
                            <TableHead>Return Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trimRows.map((row, idx) => (
                            <TableRow key={`${row.materialId}-${idx}`}>
                              <TableCell>{row.materialName}</TableCell>
                              <TableCell>{row.issuedQty.toFixed(3)} {row.unit}</TableCell>
                              <TableCell>
                                <Input
                                  value={row.returnQty}
                                  inputMode="decimal"
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(',', '.');
                                    const value = raw === '' ? 0 : Number(raw);
                                    setTrimRows(prev => prev.map((line, lineIdx) => lineIdx === idx ? { ...line, returnQty: Math.min(Math.max(value || 0, 0), row.issuedQty) } : line));
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="flex justify-end mt-4">
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleSaveTrimReturn} disabled={!trimRows.some(row => row.returnQty > 0)}>Save Trims Return</Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="cut">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Supplier</Label>
                  <SearchableSelect
                    value={selectedSupplierName}
                    onChange={(value) => { setSelectedSupplierName(value); setSelectedPOId(''); setCutRows([]); setPoSearch(''); }}
                    placeholder="Select supplier"
                    searchPlaceholder="Search suppliers..."
                    options={supplierOptions}
                  />
                </div>
                <div>
                  <Label>Search PO / item</Label>
                  <Input
                    value={poSearch}
                    onChange={(e) => setPoSearch(e.target.value)}
                    placeholder="Type PO number or item"
                  />
                </div>
                <div>
                  <Label>Purchase Order</Label>
                  <SearchableSelect
                    value={selectedPOId}
                    onChange={(value) => setSelectedPOId(value)}
                    placeholder={selectedSupplierName ? 'Select purchase order' : 'Select supplier first'}
                    searchPlaceholder="Search purchase orders..."
                    options={filteredPOs.map(po => ({
                      value: String(po.id),
                      label: po.name || po.id,
                      description: po.partner_name || '',
                    }))}
                    disabled={!selectedSupplierName}
                  />
                </div>
              </div>

              {selectedPO && (
                <div className="space-y-3 mt-4">
                  <CardTitle className="text-base">Cut Issues</CardTitle>
                  {loadingLines ? (
                    <div className="text-sm text-gray-600">Loading cut issues…</div>
                  ) : cutRows.length === 0 ? (
                    <div className="text-sm text-gray-500">No cut issues for this PO.</div>
                  ) : (
                    <div className="overflow-x-auto rounded border bg-white">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Issue Code</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Issued Qty</TableHead>
                            <TableHead>Return Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cutRows.map((row, idx) => (
                            <TableRow key={`${row.recordId}-${idx}`}>
                              <TableCell>{row.issueCode}</TableCell>
                              <TableCell>{row.productName}</TableCell>
                              <TableCell>{row.currentQty.toFixed(3)} {row.unit}</TableCell>
                              <TableCell>
                                <Input
                                  value={row.returnQty}
                                  inputMode="decimal"
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(',', '.');
                                    const value = raw === '' ? 0 : Number(raw);
                                    setCutRows(prev => prev.map((line, lineIdx) => lineIdx === idx ? { ...line, returnQty: Math.min(Math.max(value || 0, 0), row.currentQty) } : line));
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="flex justify-end mt-4">
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleSaveCutReturn} disabled={!cutRows.some(row => row.returnQty > 0)}>Save Cut Return</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IssueReturns;

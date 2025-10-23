import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { useToast } from '@/hooks/use-toast';
import { PurchaseOrderService, type PurchaseOrder } from '@/services/purchaseOrderService';
import { supplierReturnService } from '@/services/supplierReturnService';
import { GoodsIssueService } from '@/services/goodsIssueService';
import { RawMaterialsService } from '@/services/rawMaterialsService';
import { generateSupplierReturnPdf } from '@/lib/pdfUtils';
import { supabase } from '@/integrations/supabase/client';
import { Truck, QrCode, FileDown } from 'lucide-react';

const purchaseOrderService = new PurchaseOrderService();
const goodsIssueService = new GoodsIssueService();
const rawMaterialsService = new RawMaterialsService();

interface ReturnLineDraft {
  raw_material_id: number;
  material: string;
  unit: string;
  unit_price?: number;
  isFabric: boolean;
  quantity: number;
  barcodes?: string[];
}

interface SupplierReturnRow {
  id: string;
  return_number: string;
  po_number?: string;
  supplier_name?: string;
  return_date: string;
  line_count: number;
}

const SupplierReturns: React.FC = () => {
  const { toast } = useToast();
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [returns, setReturns] = useState<SupplierReturnRow[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');

  const loadReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const list = await supplierReturnService.listReturns();
      setReturns(list as SupplierReturnRow[]);
    } catch (error: any) {
      toast({ title: 'Failed to load returns', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoadingReturns(false);
    }
  }, [toast]);

  const filteredReturns = useMemo(() => {
    const needle = listSearch.trim().toLowerCase();
    if (!needle) return returns;
    return returns.filter(row => (
      (row.return_number || '').toLowerCase().includes(needle) ||
      (row.supplier_name || '').toLowerCase().includes(needle) ||
      (row.po_number || '').toLowerCase().includes(needle)
    ));
  }, [returns, listSearch]);

  useEffect(() => {
    (async () => {
      try {
        const data = await purchaseOrderService.getAllPurchaseOrders();
        setPOs(data);
      } catch (error: any) {
        toast({ title: 'Failed to load purchase orders', description: error?.message || 'Please try again.', variant: 'destructive' });
      }
    })();
    void loadReturns();
  }, [loadReturns, toast]);

  return (
    <ModernLayout
      title="Supplier Returns"
      description="Create and review returns back to suppliers"
      icon={Truck}
      gradient="bg-gradient-to-r from-amber-500 to-orange-600"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-xl">Supplier Returns</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="supplier-return-search" className="text-sm text-gray-600">Search</Label>
            <Input
              id="supplier-return-search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Search by return number or supplier"
              className="max-w-sm"
            />
          </div>
          <Button onClick={() => setDialogOpen(true)}>Create Return</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Return History</CardTitle>
            <CardDescription>Saved returns with auto-generated numbers</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingReturns ? (
              <div className="text-sm text-gray-600">Loading…</div>
            ) : filteredReturns.length === 0 ? (
              <div className="text-sm text-gray-500">No returns recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>PO</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Lines</TableHead>
                      <TableHead>PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono">{row.return_number}</TableCell>
                        <TableCell>{new Date(row.return_date).toLocaleDateString()}</TableCell>
                        <TableCell>{row.po_number || '—'}</TableCell>
                        <TableCell>{row.supplier_name || '—'}</TableCell>
                        <TableCell>{row.line_count}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const { data } = await supabase
                                .from('supplier_return_lines')
                                .select('raw_material_id, quantity, unit, unit_price, barcodes, raw_materials(name, purchase_unit)')
                                .eq('supplier_return_id', row.id);
                              const lines = (data || []).map((l: any) => ({
                                material: l.raw_materials?.name || String(l.raw_material_id),
                                unit: l.unit || l.raw_materials?.purchase_unit || 'kg',
                                quantity: Number(l.quantity || 0),
                                barcodes: (l.barcodes || []) as string[],
                              }));
                              const today = new Date(row.return_date).toISOString().slice(0, 10);
                              generateSupplierReturnPdf({
                                poNumber: row.po_number || 'PO',
                                supplierName: row.supplier_name || undefined,
                                returnDate: today,
                                lines,
                              });
                            }}
                          >
                            <FileDown className="h-4 w-4 mr-2" /> PDF
                          </Button>
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

      <CreateSupplierReturnDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        purchaseOrders={pos}
        onSaved={() => {
          setDialogOpen(false);
          void loadReturns();
        }}
      />
    </ModernLayout>
  );
};

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrders: PurchaseOrder[];
  onSaved: () => void;
}

const CreateSupplierReturnDialog: React.FC<CreateDialogProps> = ({ open, onOpenChange, purchaseOrders, onSaved }) => {
  const { toast } = useToast();

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [selectedPOId, setSelectedPOId] = useState('');
  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    purchaseOrders.forEach(po => {
      const id = String(po.supplier?.id ?? (po as any).supplier_id ?? '');
      if (!id || id === 'undefined') return;
      const name = po.supplier?.name || `Supplier ${id}`;
      if (!map.has(id)) map.set(id, name);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [purchaseOrders]);

  const filteredPOs = useMemo(() => {
    const needle = poSearch.trim().toLowerCase();
    return purchaseOrders.filter(po => {
      const supplierId = String(po.supplier?.id ?? (po as any).supplier_id ?? '');
      if (selectedSupplierId && supplierId !== selectedSupplierId) return false;
      if (!needle) return true;
      if ((po.po_number || '').toLowerCase().includes(needle)) return true;
      if ((po.supplier?.name || '').toLowerCase().includes(needle)) return true;
      return (po.lines || []).some(line => (line.raw_material?.name || '').toLowerCase().includes(needle));
    });
  }, [purchaseOrders, selectedSupplierId, poSearch]);

  const selectedPO = useMemo(() => filteredPOs.find(p => String(p.id) === String(selectedPOId)) || null, [filteredPOs, selectedPOId]);
  const poOptions = useMemo(() => filteredPOs.map(po => ({
    value: String(po.id),
    label: po.po_number,
    description: po.supplier?.name || ''
  })), [filteredPOs]);
  const [selectedLineId, setSelectedLineId] = useState('');
  const selectedLine = useMemo(() => selectedPO?.lines?.find(l => String(l.id) === String(selectedLineId)) || null, [selectedPO, selectedLineId]);
  const unitLabel = useMemo(() => selectedLine?.raw_material?.purchase_unit || 'kg', [selectedLine]);
  const isFabric = useMemo(() => {
    const mat = selectedLine?.raw_material;
    if (!mat) return false;
    return mat.category_id === 1 || (mat.name || '').toLowerCase().includes('fabric');
  }, [selectedLine]);

  // barcode scanning state
  const [showScanner, setShowScanner] = useState(false);
  const [showWeightEntry, setShowWeightEntry] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [rollWeightInput, setRollWeightInput] = useState('');
  const [rolls, setRolls] = useState<Array<{ barcode: string; qty: number }>>([]);
  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const weightFocusTimeoutRef = useRef<number | null>(null);
  const requestWeightInputFocus = useCallback((delay = 10) => {
    if (weightFocusTimeoutRef.current !== null) {
      window.clearTimeout(weightFocusTimeoutRef.current);
      weightFocusTimeoutRef.current = null;
    }
    weightFocusTimeoutRef.current = window.setTimeout(() => {
      if (weightInputRef.current) {
        weightInputRef.current.focus({ preventScroll: true });
        weightInputRef.current.select();
      }
      weightFocusTimeoutRef.current = null;
    }, delay);
  }, []);

  const isWeightMode = useMemo(() => (unitLabel || 'kg').toLowerCase().includes('kg'), [unitLabel]);
  const decimalInputPattern = /^\d*(?:\.\d*)?$/;
  const totalScannedQty = useMemo(() => rolls.reduce((sum, r) => sum + r.qty, 0), [rolls]);

  const [returnQty, setReturnQty] = useState('');
  const [returnLines, setReturnLines] = useState<ReturnLineDraft[]>([]);

  useEffect(() => {
    if (!open) {
      setSelectedSupplierId('');
      setPoSearch('');
      setSelectedPOId('');
      setSelectedLineId('');
      setRolls([]);
      setReturnQty('');
      setReturnLines([]);
      setShowScanner(false);
      setShowWeightEntry(false);
      setScannedBarcode('');
      setRollWeightInput('');
    }
  }, [open]);

  useEffect(() => {
    if (selectedPOId && !selectedPO) {
      setSelectedPOId('');
      setSelectedLineId('');
      setReturnLines([]);
      setRolls([]);
      setReturnQty('');
    }
  }, [selectedPOId, selectedPO]);

  const lineOptions = useMemo(() => (
    selectedPO?.lines?.map(line => ({
      value: String(line.id),
      label: line.raw_material?.name || 'Material',
      description: `${line.quantity} ${line.raw_material?.purchase_unit} @ LKR ${line.unit_price}`,
    })) || []
  ), [selectedPO]);

  const addLine = () => {
    if (!selectedPO || !selectedLine) {
      toast({ title: 'Select a material', description: 'Choose a purchase order line first.', variant: 'destructive' });
      return;
    }
    const qty = isFabric ? totalScannedQty : (parseFloat(returnQty) || 0);
    if (qty <= 0) {
      toast({ title: 'Quantity required', variant: 'destructive' });
      return;
    }
    const draft: ReturnLineDraft = {
      raw_material_id: Number(selectedLine.raw_material_id),
      material: selectedLine.raw_material?.name || 'Material',
      unit: unitLabel,
      unit_price: Number(selectedLine.unit_price || 0),
      isFabric,
      quantity: qty,
      barcodes: isFabric ? rolls.map(r => r.barcode) : undefined,
    };
    setReturnLines(prev => [...prev, draft]);
    setRolls([]);
    setReturnQty('');
    setScannedBarcode('');
    setShowScanner(false);
    toast({ title: 'Line added', description: `${draft.material} – ${draft.quantity} ${draft.unit}` });
  };

  const handleScan = async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    if (!selectedLine) {
      toast({ title: 'Select material', description: 'Choose a purchase order line first.', variant: 'destructive' });
      return;
    }
    if (rolls.some(r => r.barcode === code)) {
      toast({ title: 'Duplicate barcode', description: 'This barcode is already scanned for the current line.', variant: 'destructive' });
      return;
    }
    const { data } = await supabase
      .from('raw_material_inventory')
      .select('quantity_available')
      .eq('raw_material_id', Number(selectedLine.raw_material_id))
      .eq('roll_barcode', code)
      .gt('quantity_available', 0)
      .limit(1);
    if (!data || data.length === 0) {
      toast({ title: 'Not in stock', description: 'This barcode has no available quantity.', variant: 'destructive' });
      return;
    }
    setScannedBarcode(code);
    setRollWeightInput('');
    setShowWeightEntry(true);
    requestWeightInputFocus(50);
  };

  const confirmAddRoll = () => {
    const qty = parseFloat(rollWeightInput);
    if (!scannedBarcode || Number.isNaN(qty) || qty <= 0) {
      toast({ title: 'Invalid quantity', description: `Enter a valid ${isWeightMode ? 'weight' : 'length'} in ${unitLabel}.`, variant: 'destructive' });
      return;
    }
    setRolls(prev => [...prev, { barcode: scannedBarcode, qty }]);
    setShowWeightEntry(false);
    setScannedBarcode('');
    setRollWeightInput('');
  };

  const removeRoll = (barcode: string) => setRolls(prev => prev.filter(r => r.barcode !== barcode));

  const handleSaveReturn = async () => {
    if (!selectedPO) {
      toast({ title: 'Select a purchase order', variant: 'destructive' });
      return;
    }
    if (!returnLines.length) {
      toast({ title: 'Add at least one line', variant: 'destructive' });
      return;
    }
    try {
      const supplierId = Number(selectedPO.supplier?.id || selectedPO.supplier_id || 0);
      if (!supplierId) {
        toast({ title: 'Missing supplier', description: 'The selected PO has no supplier.', variant: 'destructive' });
        return;
      }
      const header = await supplierReturnService.createHeader({ po_id: String(selectedPO.id), supplier_id: supplierId, notes: undefined });
      await supplierReturnService.addLines(header.id, returnLines.map(line => ({
        raw_material_id: line.raw_material_id,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        barcodes: line.barcodes,
      })));

      const today = new Date().toISOString().split('T')[0];
      await goodsIssueService.createGoodsIssue({
        issue_date: today,
        issue_type: 'adjustment',
        reference_number: selectedPO.po_number,
        notes: `Supplier Return • ${selectedPO.supplier?.name || 'Supplier'} • PO: ${selectedPO.po_number}`,
        lines: returnLines.map(line => ({
          raw_material_id: String(line.raw_material_id),
          quantity_issued: Number(line.quantity),
          notes: line.isFabric ? `${line.unit}=${line.quantity}` : undefined,
        })),
      });

      for (const line of returnLines) {
        if (line.isFabric && line.barcodes && line.barcodes.length) {
          await rawMaterialsService.markRollsIssuedByBarcodes(line.raw_material_id, line.barcodes);
        }
      }

      try {
        generateSupplierReturnPdf({
          poNumber: selectedPO.po_number,
          supplierName: selectedPO.supplier?.name || undefined,
          returnDate: today,
          lines: returnLines.map(line => ({ material: line.material, unit: line.unit, quantity: line.quantity, barcodes: line.barcodes }))
        });
      } catch {}

      toast({ title: 'Supplier return saved', description: header.return_number });
      onSaved();
    } catch (error: any) {
      toast({ title: 'Failed to save return', description: error?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Supplier Return</DialogTitle>
          <CardDescription>Select a purchase order, add lines, and save the return note</CardDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Supplier</Label>
              <SearchableSelect
                value={selectedSupplierId}
                onChange={(value) => {
                  setSelectedSupplierId(value);
                  setSelectedPOId('');
                  setSelectedLineId('');
                  setPoSearch('');
                  setRolls([]);
                  setReturnQty('');
                  setReturnLines([]);
                }}
                placeholder="Select supplier"
                searchPlaceholder="Search suppliers..."
                options={supplierOptions}
              />
            </div>
            <div>
              <Label>Search (PO / Material / Supplier)</Label>
              <Input
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                placeholder="Type PO number, material, or supplier"
              />
            </div>
            <div>
              <Label>Purchase Order</Label>
              <SearchableSelect
                value={selectedPOId}
                onChange={(value) => {
                  setSelectedPOId(value);
                  setSelectedLineId('');
                  setRolls([]);
                  setReturnQty('');
                  setReturnLines([]);
                }}
                placeholder={selectedSupplierId ? 'Select purchase order' : 'Select supplier first'}
                searchPlaceholder="Search purchase orders..."
                options={poOptions}
                disabled={!selectedSupplierId}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Selected Supplier</Label>
              <Input value={selectedPO?.supplier?.name || supplierOptions.find(opt => opt.value === selectedSupplierId)?.label || '—'} disabled />
            </div>
            <div>
              <Label>Return Date</Label>
              <Input value={new Date().toISOString().slice(0, 10)} disabled />
            </div>
          </div>

          {selectedPO && (
            <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
              <CardTitle className="text-base">Add Line</CardTitle>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Material</Label>
                  <SearchableSelect
                    value={selectedLineId}
                    onChange={(value) => { setSelectedLineId(value); setRolls([]); setReturnQty(''); }}
                    placeholder="Select material"
                    searchPlaceholder="Search materials..."
                    options={lineOptions}
                  />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Input value={unitLabel} disabled />
                </div>
              </div>

              {selectedLine && (
                isFabric ? (
                  <>
                    <div className="flex items-center gap-3">
                      <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowScanner(true)}>
                        <QrCode className="h-4 w-4 mr-2" /> Scan Fabric Rolls
                      </Button>
                      <div className="text-sm text-gray-600">
                        Total: <span className="font-semibold">{totalScannedQty.toFixed(isWeightMode ? 3 : 2)} {unitLabel}</span> • Rolls: <span className="font-semibold">{rolls.length}</span>
                      </div>
                    </div>
                    {rolls.length > 0 && (
                      <div className="overflow-x-auto rounded border bg-white">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Barcode</TableHead>
                              <TableHead>Qty ({unitLabel})</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rolls.map((r, idx) => (
                              <TableRow key={`${r.barcode}-${idx}`}>
                                <TableCell className="font-mono">{r.barcode}</TableCell>
                                <TableCell>{r.qty.toFixed(isWeightMode ? 3 : 2)}</TableCell>
                                <TableCell>
                                  <Button variant="outline" size="sm" onClick={() => removeRoll(r.barcode)}>Remove</Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={addLine}>Add Line</Button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-3 gap-4 items-end">
                    <div>
                      <Label>Quantity to Return ({unitLabel})</Label>
                      <Input
                        value={returnQty}
                        placeholder="0.00"
                        inputMode="decimal"
                        onChange={(e) => {
                          const raw = e.target.value.replace(',', '.');
                          if (raw === '' || decimalInputPattern.test(raw)) setReturnQty(raw);
                        }}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={addLine}>Add Line</Button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {returnLines.length > 0 && (
            <div className="space-y-2">
              <CardTitle className="text-base">Lines Added</CardTitle>
              <div className="overflow-x-auto rounded border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Barcodes</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnLines.map((line, idx) => (
                      <TableRow key={`${line.raw_material_id}-${idx}`}>
                        <TableCell>{line.material}</TableCell>
                        <TableCell>{line.quantity.toFixed((line.unit || 'kg').toLowerCase().includes('kg') ? 3 : 2)}</TableCell>
                        <TableCell>{line.unit}</TableCell>
                        <TableCell className="text-xs text-gray-600 max-w-[360px] whitespace-pre-wrap break-words">{(line.barcodes || []).join(', ')}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => setReturnLines(prev => prev.filter((_, i) => i !== idx))}>Remove</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between items-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSaveReturn} className="bg-green-600 hover:bg-green-700">
            Save & Post Return
          </Button>
        </DialogFooter>

        <BarcodeScanner
          isOpen={showScanner}
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          scannedRolls={rolls.map(r => ({ barcode: r.barcode, weight: isWeightMode ? r.qty : 0 as any, length: !isWeightMode ? r.qty : undefined })) as any}
          currentScanningLine={selectedLine?.raw_material?.name || 'Material'}
          unitLabel={unitLabel}
          quantityMetric={isWeightMode ? 'weight' : 'length'}
          onRemoveRoll={(barcode) => removeRoll(barcode)}
          onDone={() => setShowScanner(false)}
        >
          {showWeightEntry && scannedBarcode && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50" style={{ zIndex: 2147483646, pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
              <Card className="w-full max-w-md mx-4 bg-white" onClick={(e) => e.stopPropagation()} style={{ position: 'relative', zIndex: 2147483647, pointerEvents: 'auto' }}>
                <CardHeader>
                  <CardTitle className="text-lg">Enter {isWeightMode ? 'Weight' : 'Length'}</CardTitle>
                  <CardDescription>Barcode: <strong>{scannedBarcode}</strong></CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>{isWeightMode ? `Weight (${unitLabel}) *` : `Length (${unitLabel}) *`}</Label>
                    <Input
                      ref={weightInputRef}
                      value={rollWeightInput}
                      placeholder="0.00"
                      inputMode="decimal"
                      onChange={(e) => {
                        const raw = e.target.value.replace(',', '.');
                        if (raw === '' || decimalInputPattern.test(raw)) setRollWeightInput(raw);
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmAddRoll(); }}>Add Roll</Button>
                    <Button variant="outline" className="flex-1" onClick={() => { setShowWeightEntry(false); setScannedBarcode(''); setRollWeightInput(''); }}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </BarcodeScanner>
      </DialogContent>
    </Dialog>
  );
};

export default SupplierReturns;

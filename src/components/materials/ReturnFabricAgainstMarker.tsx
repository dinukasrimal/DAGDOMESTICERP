import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarcodeScanner, type BarcodeScannerHandle } from '@/components/ui/BarcodeScanner';
import { useToast } from '@/hooks/use-toast';
import { markerRequestService } from '@/services/markerRequestService';
import type { MarkerRequest } from '@/services/markerRequestService';
import type { MarkerFabricAssignment } from '@/types/marker';
import { markerReturnService } from '@/services/markerReturnService';
import { PurchaseOrderService } from '@/services/purchaseOrderService';
import { GoodsReceivedService, type FabricRoll, type CreateGoodsReceivedLine } from '@/services/goodsReceivedService';
import { RawMaterialsService, type RawMaterialWithInventory } from '@/services/rawMaterialsService';
import { generateMarkerReturnPdf } from '@/lib/pdfUtils';
import { supabase } from '@/integrations/supabase/client';
import { QrCode, FileDown } from 'lucide-react';
import type { MarkerPurchaseOrder, MarkerPurchaseOrderLine } from '@/types/marker';

const purchaseOrderService = new PurchaseOrderService();
const goodsReceivedService = new GoodsReceivedService();
const rawMaterialsService = new RawMaterialsService();

interface ReturnLineDraft {
  raw_material: RawMaterialWithInventory;
  unit: string;
  unit_price: number;
  quantity: number;
  barcodes: FabricRoll[];
}

interface MarkerReturnRow {
  id: string;
  return_number: string;
  marker_number?: string;
  po_number?: string;
  return_date: string;
  line_count: number;
}

type MarkerReturnLineRow = {
  raw_material_id: number;
  quantity: number;
  unit?: string | null;
  barcodes?: string[] | null;
  raw_materials?: { name?: string | null; purchase_unit?: string | null } | null;
};

const ReturnFabricAgainstMarker: React.FC = () => {
  const { toast } = useToast();
  const [markerReturns, setMarkerReturns] = useState<MarkerReturnRow[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const list = await markerReturnService.listReturns();
      setMarkerReturns(list as MarkerReturnRow[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({ title: 'Failed to load marker returns', description: message, variant: 'destructive' });
    } finally {
      setLoadingReturns(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  const filteredReturns = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return markerReturns;
    return markerReturns.filter(row => {
      return (
        (row.return_number || '').toLowerCase().includes(needle) ||
        (row.marker_number || '').toLowerCase().includes(needle) ||
        (row.po_number || '').toLowerCase().includes(needle)
      );
    });
  }, [markerReturns, searchTerm]);

  return (
    <ModernLayout
      title="Return Fabric (Marker)"
      description="Return fabric rolls back into stock against a marker request"
      icon={QrCode}
      gradient="bg-gradient-to-r from-purple-500 to-indigo-600"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">Marker Returns</CardTitle>
          <Button onClick={() => setDialogOpen(true)}>Create Return</Button>
        </div>

        <div className="flex items-center gap-3">
          <Label htmlFor="marker-return-search" className="text-sm text-gray-600">Search</Label>
          <Input
            id="marker-return-search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by return number, marker, or PO"
            className="max-w-sm"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Return History</CardTitle>
            <CardDescription>Recorded marker returns with auto-generated numbers</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingReturns ? (
              <div className="text-sm text-gray-600">Loading…</div>
            ) : filteredReturns.length === 0 ? (
              <div className="text-sm text-gray-500">No marker returns recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Marker</TableHead>
                      <TableHead>PO</TableHead>
                      <TableHead>Lines</TableHead>
                      <TableHead>PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns.map(row => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono">{row.return_number}</TableCell>
                        <TableCell>{new Date(row.return_date).toLocaleDateString()}</TableCell>
                        <TableCell>{row.marker_number || '—'}</TableCell>
                        <TableCell>{row.po_number || '—'}</TableCell>
                        <TableCell>{row.line_count}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const [{ data: headerData }, { data: lineRows }] = await Promise.all([
                                supabase
                                  .from('marker_returns')
                                  .select<{ marker_id: string | null; purchase_order_id: string | null }>('marker_id, purchase_order_id')
                                  .eq('id', row.id)
                                  .single(),
                                supabase
                                  .from('marker_return_lines')
                                  .select<MarkerReturnLineRow>('raw_material_id, quantity, unit, barcodes, raw_materials(name, purchase_unit)')
                                  .eq('marker_return_id', row.id),
                              ]);
                              const markerRes = headerData?.marker_id
                                ? await supabase
                                    .from('marker_requests')
                                    .select<{ marker_number: string | null }>('marker_number')
                                    .eq('id', headerData.marker_id)
                                    .single()
                                : null;
                              const mapped = (lineRows || []).map((line) => ({
                                material: line.raw_materials?.name || String(line.raw_material_id),
                                unit: line.unit || line.raw_materials?.purchase_unit || 'kg',
                                quantity: Number(line.quantity || 0),
                                barcodes: (line.barcodes || []) ?? [],
                              }));
                              const today = new Date(row.return_date).toISOString().slice(0, 10);
                              await generateMarkerReturnPdf({
                                markerNumber: markerRes?.data?.marker_number || 'Marker',
                                poNumber: row.po_number,
                                returnDate: today,
                                lines: mapped,
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

      <CreateMarkerReturnDialog
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

interface CreateMarkerReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const CreateMarkerReturnDialog: React.FC<CreateMarkerReturnDialogProps> = ({ open, onOpenChange, onSaved }) => {
  const { toast } = useToast();

  const [markers, setMarkers] = useState<MarkerRequest[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<MarkerPurchaseOrder[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialWithInventory[]>([]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState('');
  const [selectedMarkerId, setSelectedMarkerId] = useState('');
  const selectedPurchaseOrder = useMemo(
    () => purchaseOrders.find(po => String(po.id) === String(selectedPurchaseOrderId)) || null,
    [purchaseOrders, selectedPurchaseOrderId]
  );
  const selectedMarker = useMemo(() => markers.find(m => String(m.id) === String(selectedMarkerId)) || null, [markers, selectedMarkerId]);

  const [availableMaterials, setAvailableMaterials] = useState<RawMaterialWithInventory[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const selectedMaterial = useMemo(() => availableMaterials.find(m => String(m.id) === String(selectedMaterialId)) || null, [availableMaterials, selectedMaterialId]);

  const [rolls, setRolls] = useState<FabricRoll[]>([]);
  const barcodeScannerRef = useRef<BarcodeScannerHandle | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [activeScan, setActiveScan] = useState<{ barcode: string } | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const weightFocusTimeoutRef = useRef<number | null>(null);
  const recentScanMapRef = useRef<Map<string, number>>(new Map());
  const duplicateToastRef = useRef<number>(0);
  const stockToastRef = useRef<number>(0);

  const requestWeightInputFocus = useCallback((delay = 10) => {
    if (weightFocusTimeoutRef.current !== null) {
      window.clearTimeout(weightFocusTimeoutRef.current);
      weightFocusTimeoutRef.current = null;
    }
    weightFocusTimeoutRef.current = window.setTimeout(() => {
      if (weightInputRef.current) {
        try { weightInputRef.current.focus({ preventScroll: true } as any); } catch {}
      }
      weightFocusTimeoutRef.current = null;
    }, delay);
  }, []);

  const isWeightMode = useMemo(() => (selectedMaterial?.purchase_unit || 'kg').toLowerCase().includes('kg'), [selectedMaterial]);
  const decimalInputPattern = /^\d*(?:\.\d*)?$/;
  const totalQty = useMemo(() => rolls.reduce((sum, roll) => sum + (isWeightMode ? Number(roll.weight || 0) : Number(roll.length || 0)), 0), [rolls, isWeightMode]);

  const [returnLines, setReturnLines] = useState<ReturnLineDraft[]>([]);
  const existingBarcodes = useMemo(() => {
    const set = new Set<string>();
    rolls.forEach(roll => set.add(roll.barcode));
    returnLines.forEach(line => line.barcodes.forEach(barcode => { if (barcode) set.add(barcode); }));
    return set;
  }, [rolls, returnLines]);

  useEffect(() => {
    if (activeScan) {
      requestWeightInputFocus(50);
    }
  }, [activeScan, requestWeightInputFocus]);

  useEffect(() => {
    if (!open) {
      setSelectedMarkerId('');
      setSelectedMaterialId('');
      setSelectedPurchaseOrderId('');
      setAvailableMaterials([]);
      setRolls([]);
      setReturnLines([]);
      setShowScanner(false);
      setActiveScan(null);
      setWeightInput('');
      recentScanMapRef.current.clear();
    }
  }, [open]);

  useEffect(() => {
    (async () => {
      if (!open) return;
      try {
        const list = await markerRequestService.listMarkerRequests();
        setMarkers(list);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please try again.';
        toast({ title: 'Failed to load marker requests', description: message, variant: 'destructive' });
      }
      try {
        const { data, error } = await supabase
          .from('purchases')
          .select('*')
          .not('state', 'eq', 'done')
          .not('state', 'eq', 'cancel')
          .order('date_order', { ascending: false })
          .limit(200);

        if (error) throw error;

        const mapped: MarkerPurchaseOrder[] = (data || []).map((order: any) => {
          let orderLines: MarkerPurchaseOrderLine[] = [];
          try {
            const rawLines = typeof order.order_lines === 'string'
              ? JSON.parse(order.order_lines)
              : order.order_lines;
            if (Array.isArray(rawLines)) {
              orderLines = rawLines.map((line: any, index: number) => {
                const qtyRaw = line.product_qty ?? line.product_uom_qty ?? line.qty ?? line.quantity ?? 0;
                const pendingRaw = line.pending_qty ?? line.to_deliver_qty ?? line.to_invoice_qty ?? null;
                return {
                  id: line.id ?? `${order.id}-line-${index}`,
                  product_name: line.product_name || line.name || 'Unknown Product',
                  product_id: line.product_id || line.id,
                  product_qty: Number(qtyRaw),
                  qty_received: Number(line.qty_received ?? line.received_qty ?? line.qty_done ?? 0),
                  qty_delivered: Number(line.qty_delivered ?? 0),
                  qty_done: Number(line.qty_done ?? 0),
                  pending_qty: pendingRaw != null ? Number(pendingRaw) : undefined,
                  reference: line.reference || line.default_code || null,
                } as MarkerPurchaseOrderLine;
              });
            }
          } catch (error) {
            console.warn('Failed to parse order lines for PO', order.name, error);
          }

          return {
            id: order.id,
            name: order.name,
            partner_name: order.partner_name,
            date_order: order.date_order,
            state: order.state,
            po_number: order.name,
            pending_qty: order.pending_qty ?? 0,
            order_lines: orderLines,
          } as MarkerPurchaseOrder;
        });

        setPurchaseOrders(mapped);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please try again.';
        toast({ title: 'Failed to load purchase orders', description: message, variant: 'destructive' });
      }
      try {
        const mats = await rawMaterialsService.getRawMaterials(false);
        setRawMaterials(mats);
      } catch {
        // ignore load errors for raw materials
      }
    })();
  }, [open, toast]);

  useEffect(() => {
    if (!selectedPurchaseOrderId) {
      if (selectedMarkerId) setSelectedMarkerId('');
      return;
    }
    if (!selectedMarkerId) return;
    const marker = markers.find(m => String(m.id) === String(selectedMarkerId));
    const poIds = marker?.po_ids?.map(id => String(id)) || [];
    if (!poIds.includes(String(selectedPurchaseOrderId))) {
      setSelectedMarkerId('');
    }
  }, [selectedPurchaseOrderId, markers, selectedMarkerId]);

  useEffect(() => {
    if (!selectedMarker) {
      setAvailableMaterials([]);
      setSelectedMaterialId('');
      return;
    }
    const assignments = new Set<number>();
    const combined: MarkerFabricAssignment[] = [
      ...((selectedMarker.fabric_assignments as MarkerFabricAssignment[] | undefined) ?? []),
      ...(selectedMarker.fabric_assignment ? [selectedMarker.fabric_assignment as MarkerFabricAssignment] : []),
    ];
    combined.forEach(assign => {
      if (assign && assign.raw_material_id != null) {
        assignments.add(Number(assign.raw_material_id));
      }
    });
    const filtered = rawMaterials.filter(mat => assignments.has(Number(mat.id)));
    setAvailableMaterials(filtered);
    if (!filtered.some(mat => String(mat.id) === String(selectedMaterialId))) {
      setSelectedMaterialId(filtered.length ? String(filtered[0].id) : '');
    }
  }, [selectedMarker, rawMaterials, selectedMaterialId]);

  const poOptions = useMemo(() => purchaseOrders.map(po => ({
    value: String(po.id),
    label: po.po_number || `PO ${po.id}`,
    description: po.partner_name,
  })), [purchaseOrders]);

  const filteredMarkers = useMemo(() => {
    if (!selectedPurchaseOrderId) return [];
    return markers.filter(marker => {
      const ids = Array.isArray(marker.po_ids) ? marker.po_ids.map(id => String(id)) : [];
      return ids.includes(String(selectedPurchaseOrderId));
    });
  }, [markers, selectedPurchaseOrderId]);

  const markerOptions = useMemo(() => filteredMarkers.map(marker => ({ value: String(marker.id), label: marker.marker_number || `Marker ${marker.id}` })), [filteredMarkers]);
  const materialOptions = useMemo(() => availableMaterials.map(mat => ({ value: String(mat.id), label: mat.name, description: mat.code || '' })), [availableMaterials]);

  const addLine = () => {
    if (!selectedMaterial) {
      toast({ title: 'Select fabric', description: 'Choose a fabric material before adding a line.', variant: 'destructive' });
      return;
    }
    if (rolls.length === 0) {
      toast({ title: 'Scan rolls first', description: 'Scan at least one roll for this fabric.', variant: 'destructive' });
      return;
    }
    const barcodeEntries = rolls.map<FabricRoll>(roll => ({
      barcode: roll.barcode,
      weight: roll.weight,
      length: roll.length,
    }));
    const newLine: ReturnLineDraft = {
      raw_material: selectedMaterial,
      unit: selectedMaterial.purchase_unit || 'kg',
      unit_price: 0,
      quantity: totalQty,
      barcodes: barcodeEntries,
    };
    setReturnLines(prev => [...prev, newLine]);
    setRolls([]);
    setScannedBarcode('');
    toast({ title: 'Line added', description: `${selectedMaterial.name} – ${totalQty.toFixed(3)} ${newLine.unit}` });
  };

  const handleScan = async (rawBarcode: string) => {
    const barcode = rawBarcode.trim();
    if (!barcode || activeScan) return;
    if (!selectedMaterial) {
      toast({ title: 'Select fabric', variant: 'destructive' });
      return;
    }

    const now = Date.now();
    const lastSeen = recentScanMapRef.current.get(barcode) || 0;
    if (now - lastSeen < 8000) return;
    if (existingBarcodes.has(barcode)) {
      if (now - duplicateToastRef.current > 1500) {
        duplicateToastRef.current = now;
        toast({ title: 'Duplicate barcode', description: 'Already scanned for this return.', variant: 'destructive' });
      }
      recentScanMapRef.current.set(barcode, now);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('raw_material_inventory')
        .select('quantity_available')
        .eq('roll_barcode', barcode)
        .gt('quantity_available', 0)
        .limit(1);
      if (error) throw error;
      if (data && data.length) {
        if (now - stockToastRef.current > 1500) {
          stockToastRef.current = now;
          toast({ title: 'Already in stock', description: 'This roll is already available in stores and cannot be returned again.', variant: 'destructive' });
        }
        recentScanMapRef.current.set(barcode, now);
        return;
      }

      barcodeScannerRef.current?.pause();
      recentScanMapRef.current.set(barcode, now);
      setActiveScan({ barcode });
      setWeightInput('');
      requestWeightInputFocus(50);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({ title: 'Scanner error', description: message, variant: 'destructive' });
    }
  };

  const handleConfirmRoll = () => {
    if (!activeScan || !selectedMaterial) return;
    const qty = parseFloat(weightInput || '');
    if (Number.isNaN(qty) || qty <= 0) {
      toast({ title: 'Invalid quantity', description: `Enter a valid ${isWeightMode ? 'weight' : 'length'} in ${selectedMaterial.purchase_unit || 'kg'}.`, variant: 'destructive' });
      return;
    }
    const roll: FabricRoll = {
      barcode: activeScan.barcode,
      weight: isWeightMode ? qty : 0,
      length: !isWeightMode ? qty : undefined,
    };
    setRolls(prev => [...prev, roll]);
    recentScanMapRef.current.set(activeScan.barcode, Date.now());
    setActiveScan(null);
    setWeightInput('');
    barcodeScannerRef.current?.resume();
  };

  const handleCancelRoll = () => {
    if (!activeScan) return;
    recentScanMapRef.current.set(activeScan.barcode, Date.now());
    setActiveScan(null);
    setWeightInput('');
    barcodeScannerRef.current?.resume();
  };

  const removeRoll = (barcode: string) => setRolls(prev => prev.filter(roll => roll.barcode !== barcode));

  const removeReturnLine = (index: number) => setReturnLines(prev => prev.filter((_, idx) => idx !== index));

  const deriveUnitPrice = async (materialId: number, marker: MarkerRequest): Promise<number> => {
    try {
      const { data: issues } = await supabase
        .from('goods_issue')
        .select<{ id: string }>('id')
        .eq('reference_number', marker.marker_number || '')
        .limit(20);
      const issueIds = (issues ?? []).map(item => item.id);
      if (issueIds.length) {
        const { data: lines } = await supabase
          .from('goods_issue_lines')
          .select<{ quantity_issued: number; unit_cost: number }>('quantity_issued, unit_cost')
          .in('goods_issue_id', issueIds)
          .eq('raw_material_id', materialId);
        const items = lines ?? [];
        const totalQty = items.reduce((sum, line) => sum + Number(line.quantity_issued || 0), 0);
        const totalValue = items.reduce((sum, line) => sum + Number(line.quantity_issued || 0) * Number(line.unit_cost || 0), 0);
        if (totalQty > 0 && totalValue > 0) return totalValue / totalQty;
      }
      const { data: layers } = await supabase
        .from('raw_material_inventory')
        .select<{ unit_price: number | null; last_updated: string | null }>('unit_price, last_updated')
        .eq('raw_material_id', materialId)
        .or('transaction_type.is.null,transaction_type.eq.grn')
        .order('last_updated', { ascending: false })
        .limit(1);
      if (layers && layers.length) {
        return Number(layers[0]?.unit_price ?? 0);
      }
    } catch {
      // ignore pricing errors; fallback to zero
    }
    return 0;
  };

  const handleSave = async () => {
    if (!selectedMarker) {
      toast({ title: 'Select a marker request', variant: 'destructive' });
      return;
    }
    if (!returnLines.length) {
      toast({ title: 'Add at least one line', variant: 'destructive' });
      return;
    }
    try {
      // Derive supplier from first material (fallback 1)
      const supplierId = Number(returnLines[0].raw_material.supplier_id ?? returnLines[0].raw_material.supplier?.id ?? 1);
      const enhancedLines = await Promise.all(returnLines.map(async (line) => {
        const unitPrice = line.unit_price > 0 ? line.unit_price : await deriveUnitPrice(line.raw_material.id, selectedMarker);
        return { ...line, unit_price: unitPrice };
      }));

      const poLines = enhancedLines.map(line => ({
        raw_material_id: Number(line.raw_material.id),
        quantity: line.quantity,
        unit_price: line.unit_price,
      }));

      const po = await purchaseOrderService.createPurchaseOrder({
        supplier_id: supplierId,
        order_date: new Date().toISOString().split('T')[0],
        notes: `Marker Return ${selectedMarker.marker_number}`,
        lines: poLines,
      });

      const header = await markerReturnService.createHeader({ marker_id: String(selectedMarker.id), purchase_order_id: po.id, notes: null });

      const grnLines: CreateGoodsReceivedLine[] = [];
      const rollDetails: Array<{ material: string; unit: string; quantity: number; barcodes?: string[] }> = [];

      for (const line of enhancedLines) {
        const poLine = po.lines?.find(pl => pl.raw_material_id === line.raw_material.id);
        if (!poLine) continue;
        if (line.barcodes.length === 0) continue;
        const isWeightLine = (line.unit || 'kg').toLowerCase().includes('kg');
        for (const roll of line.barcodes) {
          const qty = isWeightLine ? Number(roll.weight || 0) : Number(roll.length || 0);
          if (qty <= 0) continue;
          grnLines.push({
            purchase_order_line_id: poLine.id,
            raw_material_id: Number(line.raw_material.id),
            quantity_received: qty,
            unit_price: line.unit_price,
            roll_barcode: roll.barcode,
            roll_weight: roll.weight,
            roll_length: roll.length,
          });
        }
        rollDetails.push({
          material: line.raw_material.name,
          unit: line.unit,
          quantity: line.quantity,
          barcodes: line.barcodes.map(b => b.barcode || ''),
        });
      }

      if (!grnLines.length) {
        toast({ title: 'No rolls to return', description: 'Scan at least one barcode before saving.', variant: 'destructive' });
        return;
      }

      const grn = await goodsReceivedService.createGoodsReceived({
        purchase_order_id: po.id,
        received_date: new Date().toISOString().split('T')[0],
        notes: `Marker Return ${selectedMarker.marker_number}`,
        lines: grnLines,
      });

      try {
        await goodsReceivedService.verifyGoodsReceived(grn.id);
      } catch (error) {
        try { await goodsReceivedService.postGoodsReceived(grn.id); } catch {}
      }

      await markerReturnService.addLines(header.id, enhancedLines.map(line => ({
        raw_material_id: Number(line.raw_material.id),
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        barcodes: line.barcodes.map(b => b.barcode || ''),
      })));

      await generateMarkerReturnPdf({
        markerNumber: selectedMarker.marker_number || 'Marker',
        poNumber: po.po_number,
        returnDate: new Date().toISOString().split('T')[0],
        lines: rollDetails,
      });

      toast({ title: 'Marker return saved', description: header.return_number });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({ title: 'Failed to save marker return', description: message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Marker Return</DialogTitle>
          <CardDescription>Select a marker, add fabric lines, and return them to stock</CardDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Purchase Order</Label>
              <SearchableSelect
                value={selectedPurchaseOrderId}
                onChange={(value) => {
                  setSelectedPurchaseOrderId(value);
                  setSelectedMarkerId('');
                  setSelectedMaterialId('');
                  setReturnLines([]);
                  setRolls([]);
                }}
                placeholder="Select purchase order"
                searchPlaceholder="Search POs..."
                options={poOptions}
              />
            </div>
            <div>
              <Label>Marker Request</Label>
              <SearchableSelect
                value={selectedMarkerId}
                onChange={(value) => { setSelectedMarkerId(value); setSelectedMaterialId(''); setReturnLines([]); setRolls([]); }}
                placeholder={selectedPurchaseOrder ? 'Select marker request' : 'Select a PO first'}
                searchPlaceholder="Search markers..."
                options={markerOptions}
                disabled={!selectedPurchaseOrder || markerOptions.length === 0}
              />
              {selectedPurchaseOrder && markerOptions.length === 0 && (
                <p className="text-xs text-red-600 mt-1">No markers found for this purchase order.</p>
              )}
            </div>
            <div>
              <Label>Return Date</Label>
              <Input value={new Date().toISOString().slice(0, 10)} disabled />
            </div>
            <div>
              <Label>Lines Added</Label>
              <Input value={returnLines.length} disabled />
            </div>
          </div>

          {selectedMarker && (
            <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
              <CardTitle className="text-base">Add Fabric Line</CardTitle>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Fabric Material</Label>
                  <SearchableSelect
                    value={selectedMaterialId}
                    onChange={(value) => { setSelectedMaterialId(value); setRolls([]); }}
                    placeholder="Select fabric"
                    searchPlaceholder="Search fabrics..."
                    options={materialOptions}
                  />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Input value={selectedMaterial?.purchase_unit || 'kg'} disabled />
                </div>
              </div>

              {selectedMaterial && (
                <>
                  <div className="flex items-center gap-3">
                    <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowScanner(true)}>
                      <QrCode className="h-4 w-4 mr-2" /> Scan Fabric Rolls
                    </Button>
                    <div className="text-sm text-gray-600">
                      Total: <span className="font-semibold">{totalQty.toFixed(isWeightMode ? 3 : 2)} {selectedMaterial.purchase_unit || 'kg'}</span> • Rolls: <span className="font-semibold">{rolls.length}</span>
                    </div>
                  </div>
                  {rolls.length > 0 && (
                    <div className="overflow-x-auto rounded border bg-white">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Barcode</TableHead>
                            <TableHead>Qty ({selectedMaterial.purchase_unit || 'kg'})</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rolls.map((roll, idx) => (
                            <TableRow key={`${roll.barcode}-${idx}`}>
                              <TableCell className="font-mono">{roll.barcode}</TableCell>
                              <TableCell>{(isWeightMode ? Number(roll.weight || 0) : Number(roll.length || 0)).toFixed(isWeightMode ? 3 : 2)}</TableCell>
                              <TableCell>
                                <Button variant="outline" size="sm" onClick={() => removeRoll(roll.barcode)}>Remove</Button>
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
                      <TableRow key={`${line.raw_material.id}-${idx}`}>
                        <TableCell>{line.raw_material.name}</TableCell>
                        <TableCell>{line.quantity.toFixed((line.unit || 'kg').toLowerCase().includes('kg') ? 3 : 2)}</TableCell>
                        <TableCell>{line.unit}</TableCell>
                        <TableCell className="text-xs text-gray-600 max-w-[360px] whitespace-pre-wrap break-words">{line.barcodes.map(b => b.barcode).join(', ')}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => removeReturnLine(idx)}>Remove</Button>
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
          <Button className="bg-green-600 hover:bg-green-700" onClick={handleSave}>Save & Post Return</Button>
        </DialogFooter>

        <BarcodeScanner
          ref={barcodeScannerRef}
          isOpen={showScanner}
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          scannedRolls={rolls}
          currentScanningLine={selectedMaterial?.name || 'Fabric'}
          unitLabel={selectedMaterial?.purchase_unit || 'kg'}
          quantityMetric={isWeightMode ? 'weight' : 'length'}
          onRemoveRoll={(barcode) => removeRoll(barcode)}
          onDone={() => setShowScanner(false)}
          autoPauseOnScan
          feedback={false}
        />

        <Dialog open={Boolean(activeScan)}>
          <DialogContent
            className="max-w-md"
            style={{ zIndex: 2147483650 }}
            onInteractOutside={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => { e.preventDefault(); requestWeightInputFocus(10); }}
            onCloseAutoFocus={(e) => e.preventDefault()}
            key={activeScan?.barcode || 'scanner-weight'}
          >
            <DialogHeader>
              <DialogTitle>Enter {isWeightMode ? 'Weight' : 'Length'}</DialogTitle>
              <CardDescription>Barcode: <strong>{activeScan?.barcode}</strong></CardDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{isWeightMode ? `Weight (${selectedMaterial?.purchase_unit || 'kg'}) *` : `Length (${selectedMaterial?.purchase_unit || 'kg'}) *`}</Label>
                <Input
                  ref={weightInputRef}
                  type="text"
                  value={weightInput}
                  placeholder="0.00"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  pattern="[0-9]*[.,]?[0-9]*"
                  onChange={(e) => {
                    const raw = e.target.value.replace(',', '.');
                    if (raw === '' || decimalInputPattern.test(raw)) setWeightInput(raw);
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={(e) => { e.preventDefault(); handleConfirmRoll(); }}>Add Roll</Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    handleCancelRoll();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default ReturnFabricAgainstMarker;

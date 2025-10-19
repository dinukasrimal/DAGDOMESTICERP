import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { markerRequestService, type MarkerRequest } from '@/services/markerRequestService';
import { PurchaseOrderService, type PurchaseOrder } from '@/services/purchaseOrderService';
import { GoodsReceivedService, type CreateGoodsReceived, type FabricRoll } from '@/services/goodsReceivedService';
import { RawMaterialsService, type RawMaterialWithInventory } from '@/services/rawMaterialsService';
import { supabase } from '@/integrations/supabase/client';
import { QrCode, Package, CheckCircle } from 'lucide-react';

const purchaseOrderService = new PurchaseOrderService();
const goodsReceivedService = new GoodsReceivedService();
const rawMaterialsService = new RawMaterialsService();

const ReturnFabricAgainstMarker: React.FC = () => {
  const { toast } = useToast();

  const [markers, setMarkers] = useState<MarkerRequest[]>([]);
  const [materials, setMaterials] = useState<RawMaterialWithInventory[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<MarkerRequest | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const selectedMaterial = useMemo(() => materials.find(m => String(m.id) === String(selectedMaterialId)) || null, [materials, selectedMaterialId]);
  // Only allow materials assigned on the selected marker
  const assignedMaterialIds = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedMarker) return ids;
    const anyMarker: any = selectedMarker as any;
    const list = [
      ...(((anyMarker?.fabric_assignments as any[]) ?? []) as any[]),
      ...((anyMarker?.fabric_assignment ? [anyMarker.fabric_assignment] : []) as any[]),
    ];
    list.forEach((a) => {
      const id = a?.raw_material_id != null ? String(a.raw_material_id) : null;
      if (id) ids.add(id);
    });
    return ids;
  }, [selectedMarker]);

  // Filter to assigned materials only
  const markerMaterials = useMemo(() => {
    if (assignedMaterialIds.size === 0) return [] as RawMaterialWithInventory[];
    return materials.filter(m => assignedMaterialIds.has(String(m.id)));
  }, [materials, assignedMaterialIds]);

  const [showScanner, setShowScanner] = useState(false);
  const [showWeightEntry, setShowWeightEntry] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [rollWeightInput, setRollWeightInput] = useState('');
  const [rollLengthInput, setRollLengthInput] = useState('');
  const [rolls, setRolls] = useState<FabricRoll[]>([]);
  // Past returns list (for the selected marker/material)
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [pastReturns, setPastReturns] = useState<
    Array<{
      grn_id: string;
      grn_number: string;
      received_date: string;
      material_id: number;
      material_name: string;
      unit: string;
      total_qty: number;
      roll_count: number;
      barcodes: string[];
    }>
  >([]);

  const decimalInputPattern = /^\d*(?:\.\d*)?$/;
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

  const unitLabel = useMemo(() => (selectedMaterial?.purchase_unit || 'kg'), [selectedMaterial]);
  const isWeightMode = useMemo(() => unitLabel.toLowerCase().includes('kg'), [unitLabel]);

  useEffect(() => {
    (async () => {
      try {
        const list = await markerRequestService.getMarkerRequests();
        setMarkers(list);
      } catch {}
      try {
        const mats = await rawMaterialsService.getRawMaterials(false);
        // Only fabrics
        setMaterials(mats.filter(m => m.category?.id === 1 || (m.category?.name || m.name || '').toLowerCase().includes('fabric')));
      } catch {}
    })();
  }, []);

  // Load past returns when marker/material changes
  useEffect(() => {
    const loadPastReturns = async () => {
      setPastReturns([]);
      if (!selectedMarker) return;
      setReturnsLoading(true);
      try {
        // Fetch GRNs whose notes contain the marker return tag
        const likeNote = `Marker Return ${selectedMarker.marker_number}`;
        const { data: grns, error: grnErr } = await supabase
          .from('goods_received')
          .select('id, grn_number, received_date, notes')
          .ilike('notes', `%${likeNote}%`)
          .order('received_date', { ascending: false });
        if (grnErr || !grns || grns.length === 0) { setReturnsLoading(false); return; }
        const grnIds = grns.map(g => g.id);

        // Fetch GRN lines for these GRNs (optionally filter by selected material)
        let linesQuery = supabase
          .from('goods_received_lines')
          .select('goods_received_id, raw_material_id, quantity_received, roll_barcode')
          .in('goods_received_id', grnIds);
        if (selectedMaterialId) {
          linesQuery = linesQuery.eq('raw_material_id', Number(selectedMaterialId));
        }
        const { data: lines, error: lineErr } = await linesQuery;
        if (lineErr || !lines || lines.length === 0) { setReturnsLoading(false); return; }

        // Fetch material names and units for involved materials
        const materialIds = Array.from(new Set(lines.map(l => l.raw_material_id))).filter(Boolean) as number[];
        let materialMap = new Map<number, { name: string; unit: string }>();
        if (materialIds.length) {
          const { data: mats } = await supabase
            .from('raw_materials')
            .select('id, name, purchase_unit')
            .in('id', materialIds);
          materialMap = new Map((mats || []).map((m: any) => [Number(m.id), { name: String(m.name || ''), unit: String(m.purchase_unit || 'kg') }]));
        }

        // Group by GRN and material
        const grnMap = new Map<string, { grn_number: string; date: string }>();
        for (const g of grns) grnMap.set(g.id, { grn_number: g.grn_number, date: g.received_date });

        const keyMap = new Map<string, { grn_id: string; grn_number: string; received_date: string; material_id: number; material_name: string; unit: string; total_qty: number; roll_count: number; barcodes: Set<string> }>();
        for (const l of lines) {
          const grnMeta = grnMap.get(l.goods_received_id);
          if (!grnMeta) continue;
          const mid = Number(l.raw_material_id);
          const mat = materialMap.get(mid) || { name: 'Material', unit: 'kg' };
          const key = `${l.goods_received_id}-${mid}`;
          const item = keyMap.get(key) || {
            grn_id: l.goods_received_id,
            grn_number: grnMeta.grn_number,
            received_date: grnMeta.date,
            material_id: mid,
            material_name: mat.name,
            unit: mat.unit,
            total_qty: 0,
            roll_count: 0,
            barcodes: new Set<string>(),
          };
          item.total_qty += Number(l.quantity_received || 0);
          if (l.roll_barcode) item.barcodes.add(String(l.roll_barcode));
          item.roll_count = item.barcodes.size;
          keyMap.set(key, item);
        }

        const result = Array.from(keyMap.values()).map(v => ({
          grn_id: v.grn_id,
          grn_number: v.grn_number,
          received_date: v.received_date,
          material_id: v.material_id,
          material_name: v.material_name,
          unit: v.unit,
          total_qty: v.total_qty,
          roll_count: v.roll_count,
          barcodes: Array.from(v.barcodes),
        }));
        setPastReturns(result);
      } finally {
        setReturnsLoading(false);
      }
    };
    void loadPastReturns();
  }, [selectedMarker, selectedMaterialId]);

  const markerOptions = useMemo(() => markers.map(m => ({ value: m.id, label: m.marker_number, description: (m.measurement_type || 'yard').toUpperCase() })), [markers]);
  const materialOptions = useMemo(() => markerMaterials.map(m => ({ value: String(m.id), label: m.name, description: m.code || '' })), [markerMaterials]);

  // If marker changes or assigned set shrinks, clear material if not allowed
  useEffect(() => {
    if (selectedMaterialId && !assignedMaterialIds.has(String(selectedMaterialId))) {
      setSelectedMaterialId('');
    }
  }, [assignedMaterialIds, selectedMaterialId]);

  const handleScan = async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    // prevent duplicates in this session
    if (rolls.some(r => r.barcode === code)) {
      toast({ title: 'Duplicate', description: 'Barcode already scanned in this return session.', variant: 'destructive' });
      return;
    }
    // ensure barcode not already exists in goods_received_lines
    const { data, error } = await supabase
      .from('goods_received_lines')
      .select('id')
      .eq('roll_barcode', code)
      .limit(1);
    if (!error && data && data.length > 0) {
      toast({ title: 'Already in stock', description: 'This barcode already exists in Goods Received. Use Goods Issue to consume it.', variant: 'destructive' });
      return;
    }
    setScannedBarcode(code);
    setRollWeightInput('');
    setRollLengthInput('');
    setShowWeightEntry(true);
    requestWeightInputFocus(50);
  };

  const confirmAddRoll = () => {
    const val = parseFloat(rollWeightInput);
    if (!scannedBarcode || Number.isNaN(val) || val <= 0) {
      toast({ title: 'Validation', description: `Enter a valid ${isWeightMode ? 'weight' : 'length'} in ${unitLabel}.`, variant: 'destructive' });
      return;
    }
    const newRoll: FabricRoll = isWeightMode
      ? { barcode: scannedBarcode, weight: val, length: undefined }
      : { barcode: scannedBarcode, weight: 0 as any, length: val };
    setRolls(prev => [...prev, newRoll]);
    setShowWeightEntry(false);
    setScannedBarcode('');
    setRollWeightInput('');
    setRollLengthInput('');
  };

  const removeRoll = (barcode: string) => setRolls(prev => prev.filter(r => r.barcode !== barcode));

  const totalQty = useMemo(() => rolls.reduce((s, r) => s + (isWeightMode ? (r.weight || 0) : (r.length || 0)), 0), [rolls, isWeightMode]);

  const handlePostReturn = async () => {
    try {
      if (!selectedMarker) {
        toast({ title: 'Marker required', description: 'Select a marker request first.', variant: 'destructive' });
        return;
      }
      if (!selectedMaterial) {
        toast({ title: 'Material required', description: 'Select a fabric material to return.', variant: 'destructive' });
        return;
      }
      if (rolls.length === 0) {
        toast({ title: 'No rolls', description: 'Scan at least one roll to return.', variant: 'destructive' });
        return;
      }

      // Hard validation: none of the scanned barcodes may already exist in GRN
      const codes = rolls.map(r => (r.barcode || '').trim()).filter(Boolean);
      if (codes.length > 0) {
        const { data: existing, error: dupErr } = await supabase
          .from('goods_received_lines')
          .select('roll_barcode')
          .in('roll_barcode', codes)
          .limit(codes.length);
        if (!dupErr && existing && existing.length > 0) {
          const dups = Array.from(new Set(existing.map(e => e.roll_barcode))).filter(Boolean) as string[];
          toast({
            title: 'Duplicate barcodes detected',
            description: `Already in GRN: ${dups.join(', ')}`,
            variant: 'destructive'
          });
          return;
        }
      }

      // Derive unit price from issues against this marker for this material (weighted avg)
      let unitPrice = 0;
      try {
        // Fetch goods_issue headers for this marker
        const { data: issues } = await supabase
          .from('goods_issue')
          .select('id')
          .eq('reference_number', selectedMarker.marker_number);
        const issueIds = (issues || []).map(i => i.id);
        if (issueIds.length) {
          const { data: giLines } = await supabase
            .from('goods_issue_lines')
            .select('quantity_issued, unit_cost')
            .in('goods_issue_id', issueIds)
            .eq('raw_material_id', Number(selectedMaterial.id));
          const lines = giLines || [];
          const totalQty = lines.reduce((s: number, l: any) => s + Number(l.quantity_issued || 0), 0);
          const totalCost = lines.reduce((s: number, l: any) => s + (Number(l.quantity_issued || 0) * Number(l.unit_cost || 0)), 0);
          if (totalQty > 0) unitPrice = totalCost / totalQty;
        }
        // Fallback: use latest GRN layer cost for this material
        if (!unitPrice || unitPrice <= 0) {
          const { data: layers } = await supabase
            .from('raw_material_inventory')
            .select('unit_price, last_updated, transaction_type')
            .eq('raw_material_id', Number(selectedMaterial.id))
            .or('transaction_type.is.null,transaction_type.eq.grn')
            .order('last_updated', { ascending: false })
            .limit(1);
          if (layers && layers.length) {
            unitPrice = Number((layers[0] as any).unit_price || 0) || 0;
          }
        }
      } catch {}

      // 1) Create a temporary PO to anchor GRN (Internal Return). Use derived unit price.
      const supplierId = selectedMaterial.supplier?.id || 1; // fallback supplier id
      const po = await purchaseOrderService.createPurchaseOrder({
        supplier_id: supplierId,
        order_date: new Date().toISOString().split('T')[0],
        notes: `Marker Return ${selectedMarker.marker_number}`,
        lines: [{ raw_material_id: Number(selectedMaterial.id), quantity: totalQty, unit_price: unitPrice || 0 }],
      });
      const poLine = po.lines?.find(l => String(l.raw_material_id) === String(selectedMaterial.id));
      if (!poLine) throw new Error('Failed to resolve PO line for selected material');

      // 2) Create GRN with rolls
      const grn: CreateGoodsReceived = {
        purchase_order_id: po.id,
        received_date: new Date().toISOString().split('T')[0],
        notes: `Marker Return ${selectedMarker.marker_number}`,
        lines: rolls.map(r => ({
          purchase_order_line_id: poLine.id,
          raw_material_id: Number(selectedMaterial.id),
          quantity_received: isWeightMode ? (r.weight || 0) : (r.length || 0),
          unit_price: poLine.unit_price,
          roll_barcode: r.barcode,
          roll_weight: r.weight,
          roll_length: r.length,
        }))
      };
      const newGrn = await goodsReceivedService.createGoodsReceived(grn);
      // Post to inventory so layers are created
      try {
        await goodsReceivedService.verifyGoodsReceived(newGrn.id);
      } catch (e) {
        // fallback
        try { await goodsReceivedService.postGoodsReceived(newGrn.id); } catch {}
      }
      toast({ title: 'Return posted', description: `${rolls.length} roll(s) added to stock for marker ${selectedMarker.marker_number}.` });
      setRolls([]);
      setShowScanner(false);
    } catch (err: any) {
      toast({ title: 'Failed to post return', description: err?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <ModernLayout
      title="Return Fabric Against Marker"
      description="Scan fabric rolls and return them to stock against a marker"
      icon={QrCode}
      gradient="bg-gradient-to-r from-purple-500 to-indigo-600"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Return Details</CardTitle>
            <CardDescription>Select a marker and the fabric material, then scan barcodes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Marker Request</Label>
                <SearchableSelect
                  value={selectedMarker?.id ? String(selectedMarker.id) : ''}
                  onChange={(v) => { setSelectedMarker(markers.find(m => String(m.id) === String(v)) || null); setSelectedMaterialId(''); }}
                  placeholder="Select marker"
                  searchPlaceholder="Search marker numbers..."
                  options={markerOptions}
                />
              </div>
              <div>
                <Label>Fabric Material</Label>
                <SearchableSelect
                  value={selectedMaterialId}
                  onChange={setSelectedMaterialId}
                  placeholder="Select fabric material"
                  searchPlaceholder="Search materials..."
                  options={materialOptions}
                />
                {selectedMarker && assignedMaterialIds.size === 0 && (
                  <div className="text-xs text-rose-600 mt-1">This marker has no fabric assignments. Cannot return rolls.</div>
                )}
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={unitLabel} disabled />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => {
                  if (!selectedMarker || !selectedMaterial) {
                    toast({ title: 'Select marker and material', variant: 'destructive' });
                    return;
                  }
                  setShowScanner(true);
                }}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <QrCode className="h-4 w-4 mr-2" /> Scan Rolls
              </Button>
              <div className="text-sm text-gray-600">
                Total: <span className="font-semibold">{totalQty.toFixed(isWeightMode ? 3 : 2)} {unitLabel}</span> • Rolls: <span className="font-semibold">{rolls.length}</span>
              </div>
            </div>

            {rolls.length > 0 && (
              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Qty ({unitLabel})</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rolls.map((r, i) => (
                      <TableRow key={`${r.barcode}-${i}`}>
                        <TableCell className="font-mono">{r.barcode}</TableCell>
                        <TableCell>{(isWeightMode ? (r.weight || 0) : (r.length || 0)).toFixed(isWeightMode ? 3 : 2)}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => removeRoll(r.barcode!)}>Remove</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-3 flex justify-end">
                  <Button onClick={handlePostReturn} className="bg-green-600 hover:bg-green-700">
                    <CheckCircle className="h-4 w-4 mr-2" /> Post Return
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedMarker && (
          <Card>
            <CardHeader>
              <CardTitle>Previous Returns</CardTitle>
              <CardDescription>All returns posted against marker {selectedMarker.marker_number}{selectedMaterial ? ` for ${selectedMaterial.name}` : ''}</CardDescription>
            </CardHeader>
            <CardContent>
              {returnsLoading ? (
                <div className="text-sm text-gray-600">Loading returns…</div>
              ) : pastReturns.length === 0 ? (
                <div className="text-sm text-gray-500">No returns found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>GRN</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead>Total Qty</TableHead>
                        <TableHead>Rolls</TableHead>
                        <TableHead>Barcodes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pastReturns.map((r) => (
                        <TableRow key={`${r.grn_id}-${r.material_id}`}>
                          <TableCell>{new Date(r.received_date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-mono">{r.grn_number}</TableCell>
                          <TableCell>{r.material_name}</TableCell>
                          <TableCell>{r.total_qty.toFixed((r.unit || 'kg').toLowerCase().includes('kg') ? 3 : 2)} {r.unit}</TableCell>
                          <TableCell>{r.roll_count}</TableCell>
                          <TableCell className="max-w-[420px] whitespace-pre-wrap break-words text-xs text-gray-600">
                            {r.barcodes.join(', ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Scanner */}
      <BarcodeScanner
        isOpen={showScanner}
        onScan={handleScan}
        onClose={() => setShowScanner(false)}
        scannedRolls={rolls}
        currentScanningLine={selectedMaterial?.name || 'Fabric'}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{isWeightMode ? `Weight (${unitLabel}) *` : `Length (${unitLabel}) *`}</Label>
                    <Input
                      ref={weightInputRef}
                      type="text"
                      inputMode="decimal"
                      value={rollWeightInput}
                      onChange={(e) => {
                        const raw = e.target.value.replace(',', '.');
                        if (raw === '' || decimalInputPattern.test(raw)) setRollWeightInput(raw);
                      }}
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmAddRoll(); }} className="flex-1 bg-green-600 hover:bg-green-700">Add Roll</Button>
                  <Button onClick={() => { setShowWeightEntry(false); setScannedBarcode(''); setRollWeightInput(''); setRollLengthInput(''); }} variant="outline" className="flex-1">Cancel</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </BarcodeScanner>
    </ModernLayout>
  );
};

export default ReturnFabricAgainstMarker;

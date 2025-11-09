import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, Search, TrendingUp } from 'lucide-react';

interface POBudgetSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type MaterialCategory = 'fabric' | 'others';

interface PoBudgetLine {
  key: string;
  materialName: string;
  category: MaterialCategory;
  unit: string;
  budgetQty: number;
  budgetCost: number;
  actualIssuedQty: number;
  actualIssuedCost: number;
  actualReturnedQty: number;
}

interface PoBudgetRow {
  id: string;
  poNumber: string;
  supplier?: string | null;
  orderedDate?: string | null;
  budgetFabricConsumption: number;
  budgetFabricCost: number;
  budgetOtherConsumption: number;
  budgetOtherCost: number;
  actualFabricIssued: number;
  actualFabricIssueCost: number;
  actualOtherIssued: number;
  actualOtherIssueCost: number;
  actualFabricReturned: number;
  actualTrimReturned: number;
  profitOrLoss: number;
  lines: PoBudgetLine[];
}

const normalizeName = (name?: string | null) =>
  (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const isFabricMaterial = (name?: string | null) => {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  const fabricHints = ['fabric', 'cloth', 'denim', 'jersey', 'knit', 'fleece', 'cotton', 'poly', 'lycra', 'gsm'];
  return fabricHints.some((hint) => normalized.includes(hint));
};

const classifyMaterial = (name?: string | null): MaterialCategory =>
  isFabricMaterial(name) ? 'fabric' : 'others';

const buildLineKey = (rawMaterialId?: number | null, materialName?: string | null, unit?: string | null) => {
  const idPart = rawMaterialId != null ? `id-${rawMaterialId}` : normalizeName(materialName) || 'unknown';
  const unitPart = (unit || '').toLowerCase();
  return `${idPart}::${unitPart}`;
};

const formatNumber = (value: number, fractionDigits = 2) => {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
};

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

const safeJsonParse = <T,>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const buildInitialRow = (order: any): PoBudgetRow & { lineMap: Map<string, PoBudgetLine> } => ({
  id: order.id,
  poNumber: order.name || order.po_number || `PO-${order.id}`,
  supplier: order.partner_name || order.supplier_name || null,
  orderedDate: order.date_order || order.created_at || null,
  budgetFabricConsumption: 0,
  budgetFabricCost: 0,
  budgetOtherConsumption: 0,
  budgetOtherCost: 0,
  actualFabricIssued: 0,
  actualFabricIssueCost: 0,
  actualOtherIssued: 0,
  actualOtherIssueCost: 0,
  actualFabricReturned: 0,
  actualTrimReturned: 0,
  profitOrLoss: 0,
  lines: [],
  lineMap: new Map<string, PoBudgetLine>(),
});

const ensureLine = (
  row: PoBudgetRow & { lineMap: Map<string, PoBudgetLine> },
  key: string,
  name: string,
  category: MaterialCategory,
  unit: string
) => {
  const existing = row.lineMap.get(key);
  if (existing) {
    if (!existing.unit) existing.unit = unit;
    return existing;
  }
  const created: PoBudgetLine = {
    key,
    materialName: name,
    category,
    unit,
    budgetQty: 0,
    budgetCost: 0,
    actualIssuedQty: 0,
    actualIssuedCost: 0,
    actualReturnedQty: 0,
  };
  row.lineMap.set(key, created);
  return created;
};

const usePoBudgetActuals = () => {
  const [data, setData] = useState<PoBudgetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: purchases, error: poError } = await supabase
        .from('raw_material_purchase_orders')
        .select(`
          id,
          po_number,
          supplier_name,
          order_date,
          raw_material_purchase_order_lines (
            id,
            raw_material_id,
            quantity,
            unit_price,
            purchase_unit,
            raw_materials ( name, base_unit, purchase_unit )
          )
        `)
        .order('order_date', { ascending: false })
        .limit(200);
      if (poError) throw poError;

      const orders = purchases || [];
      const rowMap = new Map<string, PoBudgetRow & { lineMap: Map<string, PoBudgetLine> }>();

      orders.forEach((order: any) => {
        const row = buildInitialRow({
          id: order.id,
          name: order.po_number,
          partner_name: order.supplier_name,
          date_order: order.order_date,
        });
        rowMap.set(row.poNumber, row);

        const lines = safeJsonParse(order.raw_material_purchase_order_lines, [] as any[]);
        lines.forEach((line: any, index: number) => {
          const quantity = Number(line.quantity ?? 0);
          if (!quantity) return;
          const unitPrice = Number(line.unit_price ?? 0);
          const materialName = line.raw_materials?.name || line.material_name || `Material ${index + 1}`;
          const unit = line.purchase_unit || line.raw_materials?.purchase_unit || line.raw_materials?.base_unit || 'units';
          const rawMaterialId = Number(line.raw_material_id);
          const category = classifyMaterial(materialName);
          const key = buildLineKey(rawMaterialId, materialName, unit) || `${row.poNumber}-${index}`;
          const lineRef = ensureLine(row, key, materialName, category, unit);
          lineRef.budgetQty += quantity;
          lineRef.budgetCost += quantity * unitPrice;
          if (category === 'fabric') {
            row.budgetFabricConsumption += quantity;
            row.budgetFabricCost += quantity * unitPrice;
          } else {
            row.budgetOtherConsumption += quantity;
            row.budgetOtherCost += quantity * unitPrice;
          }
        });
      });

      if (!rowMap.size) {
        setData([]);
        setLoading(false);
        return;
      }

      const poNumbers = Array.from(rowMap.keys());

      const goodsIssuesPromise = poNumbers.length
        ? supabase
            .from('goods_issue_lines')
            .select('raw_material_id, quantity_issued, unit_cost, raw_materials(name, purchase_unit, base_unit), goods_issue(reference_number)')
            .in('goods_issue.reference_number', poNumbers)
            .limit(5000)
        : Promise.resolve({ data: [], error: null });

      const markerReturnsPromise = poNumbers.length
        ? supabase
            .from('marker_returns')
            .select('id, po_number')
            .in('po_number', poNumbers)
            .limit(2000)
        : Promise.resolve({ data: [], error: null });

      const trimReturnsPromise = poNumbers.length
        ? supabase
            .from('issue_returns')
            .select('id, purchase_po_number, return_type')
            .eq('return_type', 'trims')
            .in('purchase_po_number', poNumbers)
            .limit(2000)
        : Promise.resolve({ data: [], error: null });

      const [issueLinesResult, markerReturnsResult, trimReturnsResult] = await Promise.all([
        goodsIssuesPromise,
        markerReturnsPromise,
        trimReturnsPromise,
      ]);

      const issueLines = issueLinesResult.data || [];
      issueLines.forEach((line: any) => {
        const poNumber = line.goods_issue?.reference_number;
        if (!poNumber) return;
        const row = rowMap.get(poNumber);
        if (!row) return;
        const qty = Number(line.quantity_issued || 0);
        if (!qty) return;
        const unitCost = Number(line.unit_cost || 0);
        const materialName = line.raw_materials?.name || 'Material';
        const unit = line.raw_materials?.purchase_unit || line.raw_materials?.base_unit || 'units';
        const category = classifyMaterial(materialName);
        const key = buildLineKey(line.raw_material_id, materialName, unit) || `${poNumber}-${row.lines.length}`;
        const lineRef = ensureLine(row, key, materialName, category, unit);
        lineRef.actualIssuedQty += qty;
        lineRef.actualIssuedCost += qty * unitCost;
        if (category === 'fabric') {
          row.actualFabricIssued += qty;
          row.actualFabricIssueCost += qty * unitCost;
        } else {
          row.actualOtherIssued += qty;
          row.actualOtherIssueCost += qty * unitCost;
        }
      });

      const markerReturnMap = new Map<string, string>();
      const markerReturnIds: string[] = [];
      (markerReturnsResult.data || []).forEach((ret: any) => {
        if (ret.po_number) {
          markerReturnMap.set(ret.id, ret.po_number);
          markerReturnIds.push(ret.id);
        }
      });
      if (markerReturnIds.length) {
        const { data: markerLines } = await supabase
          .from('marker_return_lines')
          .select('marker_return_id, quantity, raw_material_id, raw_materials(name, purchase_unit, base_unit)')
          .in('marker_return_id', markerReturnIds)
          .limit(5000);
        (markerLines || []).forEach((line: any) => {
          const poNumber = markerReturnMap.get(line.marker_return_id);
          if (!poNumber) return;
          const row = rowMap.get(poNumber);
          if (!row) return;
          const qty = Number(line.quantity || 0);
          row.actualFabricReturned += qty;
          const materialName = line.raw_materials?.name;
          const unit = line.raw_materials?.purchase_unit || line.raw_materials?.base_unit || 'units';
          const key = buildLineKey(line.raw_material_id, materialName, unit);
          const lineRef = ensureLine(row, key, materialName || 'Fabric Return', 'fabric', unit);
          lineRef.actualReturnedQty += qty;
        });
      }

      const trimReturnMap = new Map<string, string>();
      const trimReturnIds: string[] = [];
      (trimReturnsResult.data || []).forEach((ret: any) => {
        if (ret.purchase_po_number) {
          trimReturnMap.set(ret.id, ret.purchase_po_number);
          trimReturnIds.push(ret.id);
        }
      });
      if (trimReturnIds.length) {
        const { data: trimLines } = await supabase
          .from('issue_return_lines')
          .select('issue_return_id, quantity, raw_material_id, raw_materials(name, purchase_unit, base_unit)')
          .in('issue_return_id', trimReturnIds)
          .limit(5000);
        (trimLines || []).forEach((line: any) => {
          const poNumber = trimReturnMap.get(line.issue_return_id);
          if (!poNumber) return;
          const row = rowMap.get(poNumber);
          if (!row) return;
          const qty = Number(line.quantity || 0);
          row.actualTrimReturned += qty;
          const materialName = line.raw_materials?.name;
          const unit = line.raw_materials?.purchase_unit || line.raw_materials?.base_unit || 'units';
          const key = buildLineKey(line.raw_material_id, materialName, unit);
          const lineRef = ensureLine(row, key, materialName || 'Trim Return', 'others', unit);
          lineRef.actualReturnedQty += qty;
        });
      }

      const finalRows: PoBudgetRow[] = Array.from(rowMap.values()).map((row) => {
        const lines = Array.from(row.lineMap.values()).sort((a, b) => {
          if (a.category === b.category) return a.materialName.localeCompare(b.materialName);
          return a.category === 'fabric' ? -1 : 1;
        });
        const fabricAvgCost = row.actualFabricIssued
          ? row.actualFabricIssueCost / row.actualFabricIssued
          : row.budgetFabricConsumption
            ? row.budgetFabricCost / row.budgetFabricConsumption
            : 0;
        const otherAvgCost = row.actualOtherIssued
          ? row.actualOtherIssueCost / row.actualOtherIssued
          : row.budgetOtherConsumption
            ? row.budgetOtherCost / row.budgetOtherConsumption
            : 0;
        const returnsCredit = (row.actualFabricReturned * fabricAvgCost) + (row.actualTrimReturned * otherAvgCost);
        const actualNetCost = row.actualFabricIssueCost + row.actualOtherIssueCost - returnsCredit;
        const budgetCost = row.budgetFabricCost + row.budgetOtherCost;
        row.profitOrLoss = budgetCost - actualNetCost;
        return {
          ...row,
          lines,
        } as PoBudgetRow;
      });

      setData(finalRows);
    } catch (err: any) {
      console.error('Failed to load PO budget data', err);
      setError(err?.message || 'Unable to load PO budget data');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, load };
};

export const POBudgetSidebar: React.FC<POBudgetSidebarProps> = ({ open, onOpenChange }) => {
  const { data, loading, error, load } = usePoBudgetActuals();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter((row) =>
      row.poNumber.toLowerCase().includes(term) ||
      (row.supplier || '').toLowerCase().includes(term)
    );
  }, [data, search]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>PO Budget vs Actual</SheetTitle>
          <SheetDescription>
            Compare BOM budgets against actual goods issues and returns per purchase order.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by PO or supplier..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md p-2">
              {error}
            </div>
          )}

          <ScrollArea className="h-[80vh] pr-4">
            {loading && !data.length ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
                <Loader2 className="h-5 w-5 animate-spin mb-2" />
                Loading PO metrics...
              </div>
            ) : filteredData.length === 0 ? (
              <div className="text-sm text-gray-500 py-8 text-center">
                No purchase orders match your search.
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-3">
                {filteredData.map((row) => (
                  <AccordionItem key={row.poNumber} value={row.poNumber} className="border rounded-lg">
                    <AccordionTrigger className="px-4">
                      <div className="flex flex-col w-full text-left space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{row.poNumber}</div>
                            <div className="text-xs text-gray-500">{row.supplier || 'Unknown supplier'}</div>
                          </div>
                          <Badge variant={row.profitOrLoss >= 0 ? 'secondary' : 'destructive'}>
                            {row.profitOrLoss >= 0 ? 'Under Budget' : 'Over Budget'} {formatCurrency(Math.abs(row.profitOrLoss))}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 bg-slate-50 rounded-md">
                            <div className="text-slate-500">BOM Fabric</div>
                            <div className="font-semibold text-slate-900">{formatNumber(row.budgetFabricConsumption)}</div>
                            <div className="text-[11px] text-slate-400">Mixed units</div>
                            <div className="text-slate-500">{formatCurrency(row.budgetFabricCost)}</div>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-md">
                            <div className="text-slate-500">Actual Fabric Issued</div>
                            <div className="font-semibold text-slate-900">{formatNumber(row.actualFabricIssued)}</div>
                            <div className="text-[11px] text-slate-400">Mixed units</div>
                            <div className="text-slate-500">{formatCurrency(row.actualFabricIssueCost)}</div>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-md">
                            <div className="text-slate-500">BOM Others</div>
                            <div className="font-semibold text-slate-900">{formatNumber(row.budgetOtherConsumption)}</div>
                            <div className="text-[11px] text-slate-400">Mixed units</div>
                            <div className="text-slate-500">{formatCurrency(row.budgetOtherCost)}</div>
                          </div>
                          <div className="p-2 bg-slate-50 rounded-md">
                            <div className="text-slate-500">Actual Others Issued</div>
                            <div className="font-semibold text-slate-900">{formatNumber(row.actualOtherIssued)}</div>
                            <div className="text-[11px] text-slate-400">Mixed units</div>
                            <div className="text-slate-500">{formatCurrency(row.actualOtherIssueCost)}</div>
                          </div>
                          <div className="p-2 bg-green-50 rounded-md">
                            <div className="text-green-600 text-[11px]">Fabric Returned</div>
                            <div className="font-semibold text-green-700">{formatNumber(row.actualFabricReturned)} pcs</div>
                          </div>
                          <div className="p-2 bg-green-50 rounded-md">
                            <div className="text-green-600 text-[11px]">Trims Returned</div>
                            <div className="font-semibold text-green-700">{formatNumber(row.actualTrimReturned)} pcs</div>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Separator className="my-3" />
                      {row.lines.length === 0 ? (
                        <div className="text-xs text-gray-500 px-4 pb-4">No BOM lines found for this PO.</div>
                      ) : (
                        <div className="px-4 pb-4 space-y-3">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <TrendingUp className="h-3 w-3" />
                            Line level budget vs actual detail
                          </div>
                          <div className="border rounded-lg overflow-hidden">
                            <div className="grid grid-cols-8 gap-2 bg-gray-50 px-3 py-2 text-[11px] text-gray-500 font-semibold">
                              <div className="col-span-3">Material</div>
                              <div>Unit</div>
                              <div>Budget Qty</div>
                              <div>Budget Cost</div>
                              <div>Issued Qty</div>
                              <div>Issued Cost</div>
                              <div>Returned Qty</div>
                            </div>
                            {row.lines.map((line) => (
                              <div key={line.key} className="grid grid-cols-8 gap-2 px-3 py-2 text-xs border-t">
                                <div className="col-span-3 flex flex-col">
                                  <span className="font-medium text-gray-900">{line.materialName}</span>
                                  <span className="text-[11px] text-gray-500 capitalize">{line.category}</span>
                                </div>
                                <div className="text-gray-700">{line.unit || '-'}</div>
                                <div>{formatNumber(line.budgetQty)}</div>
                                <div>{formatCurrency(line.budgetCost)}</div>
                                <div>{formatNumber(line.actualIssuedQty)}</div>
                                <div>{formatCurrency(line.actualIssuedCost)}</div>
                                <div>{formatNumber(line.actualReturnedQty)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};

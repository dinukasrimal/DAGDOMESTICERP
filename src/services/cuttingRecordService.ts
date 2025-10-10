import { supabase } from '@/integrations/supabase/client';

export interface PurchaseOption {
  id: string;
  name: string | null;
  partnerName: string | null;
  poNumber: string;
  orderDate: string | null;
  orderLines: PurchaseOrderLine[];
}

export interface PurchaseOrderLine {
  id: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity?: number;
  unitOfMeasure?: string;
}

export interface CuttingRecordLineItem {
  orderLineId: string;
  productName: string;
  orderedQuantity?: number;
  cutQuantity?: number;
  unitOfMeasure?: string;
}

export interface CuttingRecord {
  id: string;
  cuttingCode: string;
  purchaseId: string | null;
  poNumber: string;
  weightKg: number;
  totalCutQuantity: number | null;
  lineItems: CuttingRecordLineItem[];
  createdAt: string;
}

export interface CreateCuttingRecordInput {
  purchaseId: string;
  poNumber: string;
  weightKg: number;
  lineItems: CuttingRecordLineItem[];
}

function parseOrderLines(orderLines: unknown): PurchaseOrderLine[] {
  if (!Array.isArray(orderLines)) return [];

  return orderLines
    .map((line) => {
      if (typeof line !== 'object' || line === null) return null;

      const lineObj = line as Record<string, unknown>;
      const generatedId = typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `line-${Math.random().toString(36).slice(2, 10)}`;
      const id = String(lineObj.id ?? lineObj.line_id ?? generatedId);
      const productName = String(lineObj.product_name ?? lineObj.name ?? 'Unknown item');

      const orderedQuantityRaw = lineObj.product_qty ?? lineObj.quantity ?? lineObj.qty_ordered ?? 0;
      const orderedQuantity = typeof orderedQuantityRaw === 'number'
        ? orderedQuantityRaw
        : Number(orderedQuantityRaw) || 0;

      const receivedQuantityRaw = lineObj.qty_received ?? lineObj.received_quantity ?? 0;
      const receivedQuantity = typeof receivedQuantityRaw === 'number'
        ? receivedQuantityRaw
        : Number(receivedQuantityRaw) || 0;

      const unit = lineObj.product_uom ?? lineObj.uom ?? lineObj.unit ?? undefined;

      return {
        id,
        productName,
        orderedQuantity,
        receivedQuantity,
        unitOfMeasure: typeof unit === 'string' ? unit : undefined,
      } satisfies PurchaseOrderLine;
    })
    .filter((line): line is PurchaseOrderLine => Boolean(line));
}

class CuttingRecordService {
  async getPurchaseOptions(): Promise<PurchaseOption[]> {
    const [{ data: holds, error: holdsError }, purchases] = await Promise.all([
      supabase
        .from('purchase_holds')
        .select('purchase_id'),
      fetchAllPurchases(),
    ]);

    if (holdsError) {
      throw new Error(`Failed to load held purchase orders: ${holdsError.message}`);
    }

    const heldIds = new Set((holds ?? []).map((hold) => hold.purchase_id).filter(Boolean) as string[]);

    return purchases
      .filter((purchase) => !heldIds.has(purchase.id))
      .map((purchase) => ({
        id: purchase.id,
        name: purchase.name,
        partnerName: purchase.partner_name,
        poNumber: purchase.name ?? purchase.id,
        orderDate: purchase.date_order,
        orderLines: [],
      }));
  }

  async getPurchaseOrderLines(purchaseId: string): Promise<PurchaseOrderLine[]> {
    const { data, error } = await supabase
      .from('purchases')
      .select('order_lines')
      .eq('id', purchaseId)
      .single();

    if (error) {
      throw new Error(`Failed to load purchase order lines: ${error.message}`);
    }

    return parseOrderLines((data?.order_lines ?? []) as unknown[]);
  }

  async listCuttingRecords(): Promise<CuttingRecord[]> {
    const { data, error } = await supabase
      .from('cutting_records')
      .select('id, cutting_code, purchase_id, po_number, weight_kg, total_cut_quantity, line_items, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(`Failed to load cutting records: ${error.message}`);
    }

    return ((data ?? []) as CuttingRecordRow[]).map((record) => ({
      id: record.id,
      cuttingCode: record.cutting_code,
      purchaseId: record.purchase_id,
      poNumber: record.po_number,
      weightKg: Number(record.weight_kg ?? 0),
      totalCutQuantity: record.total_cut_quantity !== null ? Number(record.total_cut_quantity) : null,
      lineItems: Array.isArray(record.line_items)
        ? (record.line_items as CuttingRecordLineItem[])
        : [],
      createdAt: record.created_at,
    }));
  }

  async createCuttingRecord(payload: CreateCuttingRecordInput): Promise<CuttingRecord> {
    const totalCutQuantity = payload.lineItems.reduce((sum, line) => {
      const qty = typeof line.cutQuantity === 'number' ? line.cutQuantity : 0;
      return sum + qty;
    }, 0);

    const { data, error } = await supabase
      .from('cutting_records')
      .insert({
        purchase_id: payload.purchaseId,
        po_number: payload.poNumber,
        weight_kg: payload.weightKg,
        total_cut_quantity: totalCutQuantity || null,
        line_items: payload.lineItems,
      })
      .select('id, cutting_code, purchase_id, po_number, weight_kg, total_cut_quantity, line_items, created_at')
      .single();

    if (error) {
      throw new Error(`Failed to save cutting record: ${error.message}`);
    }

    const record = data as CuttingRecordRow;

    return {
      id: record.id,
      cuttingCode: record.cutting_code,
      purchaseId: record.purchase_id,
      poNumber: record.po_number,
      weightKg: Number(record.weight_kg ?? 0),
      totalCutQuantity: record.total_cut_quantity !== null ? Number(record.total_cut_quantity) : null,
      lineItems: Array.isArray(record.line_items)
        ? (record.line_items as CuttingRecordLineItem[])
        : [],
      createdAt: record.created_at,
    };
  }

  async updateCuttingRecord(id: string, payload: CreateCuttingRecordInput): Promise<CuttingRecord> {
    const totalCutQuantity = payload.lineItems.reduce((sum, line) => {
      const qty = typeof line.cutQuantity === 'number' ? line.cutQuantity : 0;
      return sum + qty;
    }, 0);

    const { data, error } = await supabase
      .from('cutting_records')
      .update({
        purchase_id: payload.purchaseId,
        po_number: payload.poNumber,
        weight_kg: payload.weightKg,
        total_cut_quantity: totalCutQuantity || null,
        line_items: payload.lineItems,
      })
      .eq('id', id)
      .select('id, cutting_code, purchase_id, po_number, weight_kg, total_cut_quantity, line_items, created_at')
      .single();

    if (error) {
      throw new Error(`Failed to update cutting record: ${error.message}`);
    }

    const record = data as CuttingRecordRow;

    return {
      id: record.id,
      cuttingCode: record.cutting_code,
      purchaseId: record.purchase_id,
      poNumber: record.po_number,
      weightKg: Number(record.weight_kg ?? 0),
      totalCutQuantity: record.total_cut_quantity !== null ? Number(record.total_cut_quantity) : null,
      lineItems: Array.isArray(record.line_items)
        ? (record.line_items as CuttingRecordLineItem[])
        : [],
      createdAt: record.created_at,
    };
  }

  async deleteCuttingRecord(id: string): Promise<void> {
    const { error } = await supabase
      .from('cutting_records')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete cutting record: ${error.message}`);
    }
  }

  async getTotalCutQuantity(poNumber: string): Promise<number> {
    const { data, error } = await supabase
      .from('cutting_records')
      .select('total_cut_quantity')
      .eq('po_number', poNumber);

    if (error) {
      console.error('Failed to fetch total cut quantity', error);
      throw new Error(`Failed to load cut quantities: ${error.message}`);
    }

    return (data ?? []).reduce((sum, row) => {
      const value = row.total_cut_quantity;
      if (typeof value === 'number') {
        return sum + value;
      }
      if (value != null) {
        const parsed = Number(value);
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }
      return sum;
    }, 0);
  }

  async getCutQuantitiesByLine(poNumber: string): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('cutting_records')
      .select('line_items')
      .eq('po_number', poNumber);

    if (error) {
      console.error('Failed to fetch line cut quantities', error);
      throw new Error(`Failed to load cut quantities: ${error.message}`);
    }

    const totals: Record<string, number> = {};
    for (const row of data ?? []) {
      const items = Array.isArray(row.line_items)
        ? (row.line_items as Array<{ orderLineId?: string; cutQuantity?: number | string }>)
        : [];
      for (const item of items) {
        if (!item) continue;
        const id = item.orderLineId ? String(item.orderLineId) : '';
        if (!id) continue;
        const rawQty = typeof item.cutQuantity === 'number'
          ? item.cutQuantity
          : Number(item.cutQuantity);
        const qty = Number.isFinite(rawQty) ? Number(rawQty) : 0;
        totals[id] = (totals[id] ?? 0) + qty;
      }
    }

    return totals;
  }
}

export const cuttingRecordService = new CuttingRecordService();

type PurchaseRow = {
  id: string;
  name: string | null;
  partner_name: string | null;
  date_order: string | null;
};

type CuttingRecordRow = {
  id: string;
  cutting_code: string;
  purchase_id: string | null;
  po_number: string;
  weight_kg: number | null;
  total_cut_quantity: number | null;
  line_items: unknown;
  created_at: string;
};

async function fetchAllPurchases(): Promise<PurchaseRow[]> {
  const pageSize = 500;
  let from = 0;
  const results: PurchaseRow[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('purchases')
      .select('id, name, partner_name, date_order')
      .order('date_order', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load purchase orders: ${error.message}`);
    }

    const chunk = data ?? [];
    results.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return results;
}

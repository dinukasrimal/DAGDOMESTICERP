import { supabase } from '@/integrations/supabase/client';
import type {
  PurchaseOption as PurchaseOptionBase,
  PurchaseOrderLine,
  CuttingRecordLineItem,
} from '@/services/cuttingRecordService';

export interface CutIssueRecordLineItem {
  orderLineId: string;
  productName: string;
  orderedQuantity?: number;
  cutQuantity?: number;
  unitOfMeasure?: string;
}

export interface CutIssueRecordEntry {
  id: string;
  issueCode: string;
  purchaseId: string | null;
  poNumber: string;
  supplierName: string | null;
  weightKg: number;
  totalCutQuantity: number | null;
  lineItems: CutIssueRecordLineItem[];
  createdAt: string;
}

export interface CreateCutIssueRecordInput {
  purchaseId: string;
  poNumber: string;
  supplierName: string;
  weightKg: number;
  lineItems: CutIssueRecordLineItem[];
}

export type PurchaseOption = PurchaseOptionBase;

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

      const unit = lineObj.product_uom ?? lineObj.uom ?? lineObj.unit ?? undefined;

      return {
        id,
        productName,
        orderedQuantity,
        unitOfMeasure: typeof unit === 'string' ? unit : undefined,
      } satisfies PurchaseOrderLine;
    })
    .filter((line): line is PurchaseOrderLine => Boolean(line));
}

class CutIssueRecordService {
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

  async listCutIssueRecords(): Promise<CutIssueRecordEntry[]> {
    const { data, error } = await supabase
      .from('cut_issue_records')
      .select('id, issue_code, purchase_id, po_number, supplier_name, weight_kg, total_cut_quantity, line_items, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(`Failed to load cut issue records: ${error.message}`);
    }

    return ((data ?? []) as CutIssueRecordRow[]).map((record) => ({
      id: record.id,
      issueCode: record.issue_code,
      purchaseId: record.purchase_id,
      poNumber: record.po_number,
      supplierName: record.supplier_name,
      weightKg: Number(record.weight_kg ?? 0),
      totalCutQuantity: record.total_cut_quantity !== null ? Number(record.total_cut_quantity) : null,
      lineItems: Array.isArray(record.line_items)
        ? (record.line_items as CutIssueRecordLineItem[])
        : [],
      createdAt: record.created_at,
    }));
  }

  async createCutIssueRecord(payload: CreateCutIssueRecordInput): Promise<CutIssueRecordEntry> {
    const totalCutQuantity = payload.lineItems.reduce((sum, line) => {
      const qty = typeof line.cutQuantity === 'number' ? line.cutQuantity : 0;
      return sum + qty;
    }, 0);

    const { data, error } = await supabase
      .from('cut_issue_records')
      .insert({
        purchase_id: payload.purchaseId,
        po_number: payload.poNumber,
        supplier_name: payload.supplierName,
        weight_kg: payload.weightKg,
        total_cut_quantity: totalCutQuantity || null,
        line_items: payload.lineItems,
      })
      .select('id, issue_code, purchase_id, po_number, supplier_name, weight_kg, total_cut_quantity, line_items, created_at')
      .single();

    if (error) {
      throw new Error(`Failed to save cut issue record: ${error.message}`);
    }

    const record = data as CutIssueRecordRow;

    return {
      id: record.id,
      issueCode: record.issue_code,
      purchaseId: record.purchase_id,
      poNumber: record.po_number,
      supplierName: record.supplier_name,
      weightKg: Number(record.weight_kg ?? 0),
      totalCutQuantity: record.total_cut_quantity !== null ? Number(record.total_cut_quantity) : null,
      lineItems: Array.isArray(record.line_items)
        ? (record.line_items as CutIssueRecordLineItem[])
        : [],
      createdAt: record.created_at,
    };
  }

  async updateCutIssueRecord(id: string, payload: CreateCutIssueRecordInput): Promise<CutIssueRecordEntry> {
    const totalCutQuantity = payload.lineItems.reduce((sum, line) => {
      const qty = typeof line.cutQuantity === 'number' ? line.cutQuantity : 0;
      return sum + qty;
    }, 0);

    const { data, error } = await supabase
      .from('cut_issue_records')
      .update({
        purchase_id: payload.purchaseId,
        po_number: payload.poNumber,
        supplier_name: payload.supplierName,
        weight_kg: payload.weightKg,
        total_cut_quantity: totalCutQuantity || null,
        line_items: payload.lineItems,
      })
      .eq('id', id)
      .select('id, issue_code, purchase_id, po_number, supplier_name, weight_kg, total_cut_quantity, line_items, created_at')
      .single();

    if (error) {
      throw new Error(`Failed to update cut issue record: ${error.message}`);
    }

    const record = data as CutIssueRecordRow;

    return {
      id: record.id,
      issueCode: record.issue_code,
      purchaseId: record.purchase_id,
      poNumber: record.po_number,
      supplierName: record.supplier_name,
      weightKg: Number(record.weight_kg ?? 0),
      totalCutQuantity: record.total_cut_quantity !== null ? Number(record.total_cut_quantity) : null,
      lineItems: Array.isArray(record.line_items)
        ? (record.line_items as CutIssueRecordLineItem[])
        : [],
      createdAt: record.created_at,
    };
  }

  async deleteCutIssueRecord(id: string): Promise<void> {
    const { error } = await supabase
      .from('cut_issue_records')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete cut issue record: ${error.message}`);
    }
  }
}

export const cutIssueRecordService = new CutIssueRecordService();

type PurchaseRow = {
  id: string;
  name: string | null;
  partner_name: string | null;
  date_order: string | null;
};

type CutIssueRecordRow = {
  id: string;
  issue_code: string;
  purchase_id: string | null;
  po_number: string;
  supplier_name: string | null;
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

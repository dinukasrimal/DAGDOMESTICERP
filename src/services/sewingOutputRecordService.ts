import { supabase } from '@/integrations/supabase/client';
import type { PurchaseOrderLine } from '@/services/cuttingRecordService';

export interface SewingSupplierOption {
  id: string;
  name: string;
}

export interface SewingPurchaseOption {
  id: string;
  poNumber: string;
  partnerName: string | null;
  orderedQuantity: number;
  createdAt: string | null;
}

export interface SewingOutputLineItem {
  id: string;
  recordId: string;
  purchaseId: string | null;
  poNumber: string;
  outputQuantity: number;
  createdAt: string;
}

export interface SewingOutputRecordEntry {
  id: string;
  outputCode: string;
  supplierName: string;
  totalOutputQuantity: number;
  createdAt: string;
  lineItems: Array<{
    id: string;
    purchaseId: string | null;
    poNumber: string;
    outputQuantity: number;
    createdAt: string;
  }>;
}

export interface CreateSewingOutputRecordInput {
  supplierName: string;
  lineItems: Array<{
    purchaseId?: string;
    poNumber: string;
    outputQuantity: number;
  }>;
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

class SewingOutputRecordService {
  async listSuppliers(): Promise<SewingSupplierOption[]> {
    const { data, error } = await supabase
      .from('purchases')
      .select('partner_name')
      .not('partner_name', 'is', null)
      .limit(200);

    if (error) {
      throw new Error(`Failed to load suppliers: ${error.message}`);
    }

    const seen = new Set<string>();
    const options: SewingSupplierOption[] = [];
    for (const row of data ?? []) {
      const name = typeof row.partner_name === 'string' ? row.partner_name.trim() : '';
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      options.push({ id: name, name });
    }

    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  }

  async getPurchaseOptionsBySupplier(supplierName: string): Promise<SewingPurchaseOption[]> {
    const trimmed = supplierName.trim();
    if (!trimmed) return [];

    const { data, error } = await supabase
      .from('purchases')
      .select('id, name, partner_name, date_order, order_lines')
      .eq('partner_name', trimmed)
      .limit(200);

    if (error) {
      throw new Error(`Failed to load purchase orders: ${error.message}`);
    }

    const rows = (data ?? []) as PurchaseRow[];

    return rows.map((purchase) => {
      const lines = parseOrderLines(purchase.order_lines ?? []);
      const orderedQuantity = lines.reduce((sum, line) => sum + (line.orderedQuantity ?? 0), 0);
      return {
        id: purchase.id,
        poNumber: purchase.name ?? purchase.id,
        partnerName: purchase.partner_name,
        orderedQuantity,
        createdAt: purchase.date_order,
      } satisfies SewingPurchaseOption;
    });
  }

  async listRecords(): Promise<SewingOutputRecordEntry[]> {
    const { data, error } = await supabase
      .from('sewing_output_records')
      .select('id, output_code, supplier_name, created_at, sewing_output_record_lines(id, purchase_id, po_number, output_quantity, created_at)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(`Failed to load sewing output records: ${error.message}`);
    }

    return (data ?? []).map((record) => {
      const lines = Array.isArray(record.sewing_output_record_lines)
        ? record.sewing_output_record_lines
        : [];
      const mappedLines = lines.map((line) => ({
        id: line.id,
        purchaseId: line.purchase_id,
        poNumber: line.po_number,
        outputQuantity: Number(line.output_quantity ?? 0),
        createdAt: line.created_at,
      }));
      const totalOutputQuantity = mappedLines.reduce((sum, line) => sum + line.outputQuantity, 0);

      return {
        id: record.id,
        outputCode: record.output_code,
        supplierName: record.supplier_name,
        totalOutputQuantity,
        createdAt: record.created_at,
        lineItems: mappedLines,
      };
    });
  }

  async createRecord(payload: CreateSewingOutputRecordInput): Promise<SewingOutputRecordEntry> {
    if (!payload.supplierName.trim()) {
      throw new Error('Supplier name is required.');
    }
    if (!payload.lineItems.length) {
      throw new Error('Add at least one PO to record sewing output.');
    }

    const { data: recordData, error: recordError } = await supabase
      .from('sewing_output_records')
      .insert({ supplier_name: payload.supplierName.trim() })
      .select('id, output_code, supplier_name, created_at')
      .single();

    if (recordError || !recordData) {
      throw new Error(`Failed to create sewing output record: ${recordError?.message ?? 'Unknown error'}`);
    }

    const linesPayload = payload.lineItems.map((item) => ({
      record_id: recordData.id,
      purchase_id: item.purchaseId ?? null,
      po_number: item.poNumber,
      output_quantity: item.outputQuantity,
    }));

    const { data: linesData, error: linesError } = await supabase
      .from('sewing_output_record_lines')
      .insert(linesPayload)
      .select('id, purchase_id, po_number, output_quantity, created_at');

    if (linesError) {
      throw new Error(`Failed to save sewing output lines: ${linesError.message}`);
    }

    const lineItems = (linesData ?? []).map((line) => ({
      id: line.id,
      purchaseId: line.purchase_id,
      poNumber: line.po_number,
      outputQuantity: Number(line.output_quantity ?? 0),
      createdAt: line.created_at,
    }));

    return {
      id: recordData.id,
      outputCode: recordData.output_code,
      supplierName: recordData.supplier_name,
      createdAt: recordData.created_at,
      totalOutputQuantity: lineItems.reduce((sum, line) => sum + line.outputQuantity, 0),
      lineItems,
    };
  }

  async deleteRecord(id: string): Promise<void> {
    const { error } = await supabase
      .from('sewing_output_records')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete sewing output record: ${error.message}`);
    }
  }
}

export const sewingOutputRecordService = new SewingOutputRecordService();

type PurchaseRow = {
  id: string;
  name: string | null;
  partner_name: string | null;
  date_order: string | null;
  order_lines: unknown;
};

type SewingOutputRecordRow = {
  id: string;
  output_code: string;
  supplier_name: string;
  created_at: string;
  sewing_output_record_lines: Array<{
    id: string;
    purchase_id: string | null;
    po_number: string;
    output_quantity: number | null;
    created_at: string;
  }>; 
};

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

export interface SewingPurchaseVariant {
  orderLineId: string;
  productName: string;
  orderedQuantity: number;
  cutQuantity: number;
  issueQuantity: number;
}

export interface SewingOutputLineItem {
  id: string;
  purchaseId: string | null;
  poNumber: string;
  orderLineId?: string | null;
  productName?: string | null;
  orderedQuantity?: number;
  cutQuantity?: number;
  issueQuantity?: number;
  outputQuantity: number;
  createdAt: string;
}

export interface SewingOutputRecordEntry {
  id: string;
  outputCode: string;
  supplierName: string;
  totalOutputQuantity: number;
  createdAt: string;
  lineItems: SewingOutputLineItem[];
}

export interface SewingOrderSummaryEntry {
  purchaseId?: string | null;
  poNumber: string;
  supplierName?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  orderLineId?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  cutQuantity: number;
  issueQuantity: number;
  sewingQuantity: number;
}

export interface CreateSewingOutputRecordInput {
  supplierName: string;
  lineItems: Array<{
    purchaseId?: string;
    poNumber: string;
    orderLineId?: string;
    productName?: string;
    orderedQuantity?: number;
    cutQuantity?: number;
    issueQuantity?: number;
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

function aggregateJsonLines(records: Array<{ line_items?: unknown } | null | undefined>, key: 'cut' | 'issue') {
  const map = new Map<string, number>();
  records.forEach((record) => {
    if (!record || !Array.isArray(record.line_items)) return;
    (record.line_items as Array<Record<string, unknown>>).forEach((line) => {
      const orderLineId = String(line.orderLineId ?? line.order_line_id ?? '');
      if (!orderLineId) return;
      const valueRaw = key === 'cut'
        ? line.cutQuantity ?? line.quantity ?? line.outputQuantity ?? 0
        : line.issueQuantity ?? line.issuedQuantity ?? line.cutQuantity ?? line.quantity ?? 0;
      const value = typeof valueRaw === 'number' ? valueRaw : Number(valueRaw) || 0;
      map.set(orderLineId, (map.get(orderLineId) || 0) + value);
    });
  });
  return map;
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
      const orderLines = parseOrderLines(purchase.order_lines ?? []);
      const orderedQuantity = orderLines.reduce((sum, line) => sum + (line.orderedQuantity ?? 0), 0);
      return {
        id: purchase.id,
        poNumber: purchase.name ?? purchase.id,
        partnerName: purchase.partner_name,
        orderedQuantity,
        createdAt: purchase.date_order,
      } satisfies SewingPurchaseOption;
    });
  }

  async getPurchaseVariants(purchaseId: string): Promise<SewingPurchaseVariant[]> {
    if (!purchaseId) return [];

    const [{ data: purchaseData, error: purchaseError }, { data: cuttingData, error: cuttingError }, { data: issueData, error: issueError }] = await Promise.all([
      supabase
        .from('purchases')
        .select('order_lines')
        .eq('id', purchaseId)
        .single(),
      supabase
        .from('cutting_records')
        .select('line_items')
        .eq('purchase_id', purchaseId),
      supabase
        .from('cut_issue_records')
        .select('line_items')
        .eq('purchase_id', purchaseId),
    ]);

    if (purchaseError) {
      throw new Error(`Failed to load purchase lines: ${purchaseError.message}`);
    }
    if (cuttingError) {
      console.warn('Failed to load cutting records:', cuttingError.message);
    }
    if (issueError) {
      console.warn('Failed to load cut issue records:', issueError.message);
    }

    const orderLines = parseOrderLines((purchaseData?.order_lines ?? []) as unknown[]);
    const cutTotals = aggregateJsonLines(cuttingData ?? [], 'cut');
    const issueTotals = aggregateJsonLines(issueData ?? [], 'issue');

    return orderLines.map((line) => ({
      orderLineId: line.id,
      productName: line.productName,
      orderedQuantity: line.orderedQuantity ?? 0,
      cutQuantity: cutTotals.get(line.id) ?? 0,
      issueQuantity: issueTotals.get(line.id) ?? 0,
    }));
  }

  async listRecords(): Promise<SewingOutputRecordEntry[]> {
    const { data: records, error: recordsError } = await supabase
      .from('sewing_output_records')
      .select('id, output_code, supplier_name, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (recordsError) {
      throw new Error(`Failed to load sewing output records: ${recordsError.message}`);
    }

    const recordList = records ?? [];
    if (recordList.length === 0) {
      return [];
    }

    const recordIds = recordList.map((record) => record.id);
    const { data: lines, error: linesError } = await supabase
      .from('sewing_output_record_lines')
      .select('id, record_id, purchase_id, po_number, order_line_id, product_name, ordered_quantity, cut_quantity, issue_quantity, output_quantity, created_at')
      .in('record_id', recordIds);

    if (linesError) {
      throw new Error(`Failed to load sewing output lines: ${linesError.message}`);
    }

    const linesByRecord = new Map<string, SewingOutputLineItem[]>();
    (lines ?? []).forEach((line) => {
      const recordId = line.record_id;
      if (!recordId) return;
      const entry: SewingOutputLineItem = {
        id: line.id,
        purchaseId: line.purchase_id,
        poNumber: line.po_number,
        orderLineId: line.order_line_id,
        productName: line.product_name,
        orderedQuantity: line.ordered_quantity ?? undefined,
        cutQuantity: line.cut_quantity ?? undefined,
        issueQuantity: line.issue_quantity ?? undefined,
        outputQuantity: Number(line.output_quantity ?? 0),
        createdAt: line.created_at,
      };
      const bucket = linesByRecord.get(recordId);
      if (bucket) {
        bucket.push(entry);
      } else {
        linesByRecord.set(recordId, [entry]);
      }
    });

    return recordList.map((record) => {
      const mappedLines = linesByRecord.get(record.id) ?? [];
      const totalOutputQuantity = mappedLines.reduce((sum, line) => sum + line.outputQuantity, 0);
      return {
        id: record.id,
        outputCode: record.output_code,
        supplierName: record.supplier_name,
        totalOutputQuantity,
        createdAt: record.created_at,
        lineItems: mappedLines,
      } satisfies SewingOutputRecordEntry;
    });
  }

  async createRecord(payload: CreateSewingOutputRecordInput): Promise<SewingOutputRecordEntry> {
    if (!payload.supplierName.trim()) {
      throw new Error('Supplier name is required.');
    }
    if (!payload.lineItems.length) {
      throw new Error('Add at least one output entry.');
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
      order_line_id: item.orderLineId ?? null,
      product_name: item.productName ?? null,
      ordered_quantity: item.orderedQuantity ?? null,
      cut_quantity: item.cutQuantity ?? null,
      issue_quantity: item.issueQuantity ?? null,
      output_quantity: item.outputQuantity,
    }));

    const { data: linesData, error: linesError } = await supabase
      .from('sewing_output_record_lines')
      .insert(linesPayload)
      .select('id, purchase_id, po_number, order_line_id, product_name, ordered_quantity, cut_quantity, issue_quantity, output_quantity, created_at');

    if (linesError) {
      throw new Error(`Failed to save sewing output lines: ${linesError.message}`);
    }

    const lineItems: SewingOutputLineItem[] = (linesData ?? []).map((line) => ({
      id: line.id,
      purchaseId: line.purchase_id,
      poNumber: line.po_number,
      orderLineId: line.order_line_id ?? undefined,
      productName: line.product_name ?? undefined,
      orderedQuantity: line.ordered_quantity ?? undefined,
      cutQuantity: line.cut_quantity ?? undefined,
      issueQuantity: line.issue_quantity ?? undefined,
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
    } satisfies SewingOutputRecordEntry;
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

  async listOrderSummaries(): Promise<SewingOrderSummaryEntry[]> {
    const [
      { data: purchases, error: purchasesError },
      { data: cuttingRecords, error: cuttingError },
      { data: issueRecords, error: issueError },
      { data: sewingLines, error: sewingError },
      { data: heldPurchases, error: holdsError },
    ] = await Promise.all([
      supabase.from('purchases')
        .select('id, name, partner_name, order_lines, pending_qty, received_qty')
        .limit(500),
      supabase.from('cutting_records')
        .select('purchase_id, po_number, line_items'),
      supabase.from('cut_issue_records')
        .select('purchase_id, po_number, line_items'),
      supabase.from('sewing_output_record_lines')
        .select('purchase_id, po_number, order_line_id, product_name, output_quantity'),
      supabase.from('purchase_holds')
        .select('purchase_id'),
    ]);

    if (purchasesError) {
      throw new Error(`Failed to load purchase orders: ${purchasesError.message}`);
    }
    if (cuttingError) {
      console.warn('Failed to load cutting totals:', cuttingError.message);
    }
    if (issueError) {
      console.warn('Failed to load cut issue totals:', issueError.message);
    }
    if (sewingError) {
      console.warn('Failed to load sewing totals:', sewingError.message);
    }
    if (holdsError) {
      console.warn('Failed to load purchase holds:', holdsError.message);
    }

    const entryMap = new Map<string, SewingOrderSummaryEntry>();
    const heldIds = new Set((heldPurchases ?? []).map((hold) => hold.purchase_id).filter(Boolean) as string[]);
    const orderLineKeyMap = new Map<string, string>();
    const fullyReceivedPurchaseIds = new Set<string>();
    const fullyReceivedPoNumbers = new Set<string>();

    const makeKey = (poNumber: string, orderLineId?: string | null, productName?: string | null) => {
      if (orderLineId) return `${poNumber}::${orderLineId}`;
      return `${poNumber}::${(productName || '').toLowerCase()}`;
    };

    (purchases ?? []).forEach((purchase) => {
      if (heldIds.has(purchase.id)) return;
      const poNumber = purchase.name ?? purchase.id;
      const supplierName = purchase.partner_name;
      const lines = parseOrderLines((purchase.order_lines ?? []) as unknown[]);

      const pendingFromColumnRaw = purchase.pending_qty;
      const pendingFromColumn = typeof pendingFromColumnRaw === 'number'
        ? pendingFromColumnRaw
        : Number(pendingFromColumnRaw ?? NaN);
      const pendingFromLines = lines.reduce((sum, line) => {
        const received = typeof line.receivedQuantity === 'number' ? line.receivedQuantity : 0;
        return sum + Math.max((line.orderedQuantity ?? 0) - received, 0);
      }, 0);
      const pendingQuantity = Number.isFinite(pendingFromColumn)
        ? pendingFromColumn
        : pendingFromLines;
      const isFullyReceived = lines.length > 0 && pendingFromLines <= 0 && pendingQuantity <= 0;

      if (isFullyReceived) {
        fullyReceivedPurchaseIds.add(purchase.id);
        if (poNumber) {
          fullyReceivedPoNumbers.add(poNumber);
        }
        return;
      }

      lines.forEach((line) => {
        const key = makeKey(poNumber, line.id, line.productName);
        if (!entryMap.has(key)) {
          entryMap.set(key, {
            purchaseId: purchase.id,
            poNumber,
            supplierName,
            productName: line.productName,
            productCategory: (line as any).product_category ?? null,
            orderLineId: line.id,
            orderedQuantity: 0,
            receivedQuantity: 0,
            cutQuantity: 0,
            issueQuantity: 0,
            sewingQuantity: 0,
          });
        }
        const entry = entryMap.get(key)!;
        entry.orderedQuantity += line.orderedQuantity ?? 0;
        entry.receivedQuantity += line.receivedQuantity ?? 0;
        if (line.id) {
          orderLineKeyMap.set(line.id, key);
        }
      });
    });

    const applyAggregate = (map: Map<string, SewingOrderSummaryEntry>, totals: Map<string, number>, field: 'cutQuantity' | 'issueQuantity') => {
      totals.forEach((value, orderLineId) => {
        const key = orderLineKeyMap.get(orderLineId);
        if (!key) return;
        const entry = map.get(key);
        if (entry) {
          entry[field] = value;
        }
      });
    };

    const filteredCutting = (cuttingRecords ?? []).filter((record) => !record?.purchase_id || !heldIds.has(record.purchase_id));
    const filteredIssue = (issueRecords ?? []).filter((record) => !record?.purchase_id || !heldIds.has(record.purchase_id));
    const cutTotals = aggregateJsonLines(filteredCutting, 'cut');
    const issueTotals = aggregateJsonLines(filteredIssue, 'issue');
    applyAggregate(entryMap, cutTotals, 'cutQuantity');
    applyAggregate(entryMap, issueTotals, 'issueQuantity');

    (sewingLines ?? []).forEach((line) => {
      if (line?.purchase_id && heldIds.has(line.purchase_id)) return;
      if (line?.purchase_id && fullyReceivedPurchaseIds.has(line.purchase_id)) return;
      const poNumber = line.po_number || '';
      if (fullyReceivedPoNumbers.has(poNumber)) return;
      const key = line.order_line_id && orderLineKeyMap.has(line.order_line_id)
        ? orderLineKeyMap.get(line.order_line_id)!
        : makeKey(poNumber, line.order_line_id, line.product_name);

      if (!entryMap.has(key)) {
        entryMap.set(key, {
          purchaseId: line.purchase_id ?? undefined,
          poNumber,
          supplierName: undefined,
          productName: line.product_name ?? undefined,
          productCategory: null,
          orderLineId: line.order_line_id ?? undefined,
          orderedQuantity: 0,
          receivedQuantity: 0,
          cutQuantity: 0,
          issueQuantity: 0,
          sewingQuantity: 0,
        });
      }

      const entry = entryMap.get(key)!;
      entry.sewingQuantity += Number(line.output_quantity ?? 0);
      if (line.order_line_id && !orderLineKeyMap.has(line.order_line_id)) {
        orderLineKeyMap.set(line.order_line_id, key);
      }
    });

    const filteredEntries = Array.from(entryMap.values()).filter((entry) => {
      if (entry.purchaseId && heldIds.has(entry.purchaseId)) {
        return false;
      }
      if (entry.purchaseId && fullyReceivedPurchaseIds.has(entry.purchaseId)) {
        return false;
      }
      if (fullyReceivedPoNumbers.has(entry.poNumber)) {
        return false;
      }
      if (entry.orderedQuantity > 0) {
        const fullyIssued = entry.issueQuantity >= entry.orderedQuantity;
        const fullySewn = fullyIssued && entry.sewingQuantity >= entry.issueQuantity;
        if (fullySewn) {
          return false;
        }
      }
      return true;
    });

    return filteredEntries.sort((a, b) => {
      if (a.poNumber === b.poNumber && a.productName && b.productName) {
        return a.productName.localeCompare(b.productName);
      }
      return a.poNumber.localeCompare(b.poNumber);
    });
  }
}

export const sewingOutputRecordService = new SewingOutputRecordService();

interface PurchaseRow {
  id: string;
  name: string | null;
  partner_name: string | null;
  date_order: string | null;
  order_lines: unknown;
  pending_qty?: number | null;
  received_qty?: number | null;
}

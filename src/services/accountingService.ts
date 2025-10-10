import { supabase } from '@/integrations/supabase/client';
import { GoodsReceivedService, GoodsReceived } from '@/services/goodsReceivedService';

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  accountType: string;
  category?: string | null;
  isPayable: boolean;
  isReceivable: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAccountInput {
  code: string;
  name: string;
  accountType: string;
  category?: string;
  isPayable?: boolean;
  isReceivable?: boolean;
}

export interface BillLineInput {
  description?: string;
  accountId?: string;
  quantity: number;
  unitPrice: number;
}

export interface BillRecord {
  id: string;
  billNumber: string;
  supplierName?: string | null;
  billDate: string;
  dueDate?: string | null;
  status: string;
  accountId?: string | null;
  goodsReceivedId?: string | null;
  totalAmount: number;
  notes?: string | null;
  lines: BillLineRecord[];
  payable?: PayableRecord | null;
}

export interface BillLineRecord {
  id: string;
  description?: string | null;
  accountId?: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface PayableRecord {
  id: string;
  accountId: string;
  amountDue: number;
  amountPaid: number;
  dueDate?: string | null;
  status: string;
}

interface BillLineRow {
  id: string;
  description?: string | null;
  account_id?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
}

interface PayableRow {
  id: string;
  account_id: string;
  amount_due?: number | null;
  amount_paid?: number | null;
  due_date?: string | null;
  status: string;
}

interface BillRow {
  id: string;
  bill_number: string;
  supplier_name?: string | null;
  bill_date: string;
  due_date?: string | null;
  status: string;
  account_id?: string | null;
  goods_received_id?: string | null;
  total_amount?: number | null;
  notes?: string | null;
  bill_lines?: BillLineRow[];
  payables?: PayableRow[];
}

interface ManualJournalLineRow {
  id: string;
  account_id: string;
  description?: string | null;
  debit?: number | null;
  credit?: number | null;
}

interface ManualJournalRow {
  id: string;
  entry_number: string;
  entry_date: string;
  reference?: string | null;
  notes?: string | null;
  status: string;
  manual_journal_lines?: ManualJournalLineRow[];
}

export interface CreateBillInput {
  billNumber?: string;
  supplierName?: string;
  supplierId?: string;
  billDate: string;
  dueDate?: string;
  status?: string;
  accountId?: string;
  payableAccountId: string;
  goodsReceivedId?: string;
  notes?: string;
  createdBy?: string;
  lines: BillLineInput[];
}

export interface ManualJournalLineInput {
  accountId: string;
  description?: string;
  debit?: number;
  credit?: number;
}

export interface CreateManualJournalInput {
  entryNumber?: string;
  entryDate: string;
  reference?: string;
  notes?: string;
  status?: string;
  createdBy?: string;
  lines: ManualJournalLineInput[];
}

export interface ManualJournalLineRecord {
  id: string;
  accountId: string;
  description?: string | null;
  debit: number;
  credit: number;
}

export interface ManualJournalEntryRecord {
  id: string;
  entryNumber: string;
  entryDate: string;
  reference?: string | null;
  notes?: string | null;
  status: string;
  lines: ManualJournalLineRecord[];
}

const goodsService = new GoodsReceivedService();

class AccountingService {
  async listChartOfAccounts(): Promise<ChartOfAccount[]> {
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .order('code', { ascending: true });

    if (error) {
      throw new Error(`Failed to load chart of accounts: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      accountType: row.account_type,
      category: row.category,
      isPayable: Boolean(row.is_payable),
      isReceivable: Boolean(row.is_receivable),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    } satisfies ChartOfAccount));
  }

  async createAccount(payload: CreateAccountInput): Promise<ChartOfAccount> {
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .insert({
        code: payload.code.trim(),
        name: payload.name.trim(),
        account_type: payload.accountType.trim(),
        category: payload.category?.trim() ?? null,
        is_payable: Boolean(payload.isPayable),
        is_receivable: Boolean(payload.isReceivable),
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create account: ${error?.message ?? 'Unknown error'}`);
    }

    return {
      id: data.id,
      code: data.code,
      name: data.name,
      accountType: data.account_type,
      category: data.category,
      isPayable: Boolean(data.is_payable),
      isReceivable: Boolean(data.is_receivable),
      isActive: Boolean(data.is_active),
      createdAt: data.created_at ?? undefined,
      updatedAt: data.updated_at ?? undefined,
    };
  }

  async listBills(): Promise<BillRecord[]> {
    const { data, error } = await supabase
      .from('bills')
      .select(`
        id,
        bill_number,
        supplier_name,
        bill_date,
        due_date,
        status,
        account_id,
        goods_received_id,
        total_amount,
        notes,
        bill_lines(id, description, account_id, quantity, unit_price, amount),
        payables(id, account_id, amount_due, amount_paid, due_date, status)
      `)
      .order('bill_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to load bills: ${error.message}`);
    }

    return (data ?? []).map((row) => this.mapBillRow(row as BillRow));
  }

  private generateBillNumber(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const suffix = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
    return `BILL-${yyyy}${mm}${dd}-${suffix}`;
  }

  async createBill(payload: CreateBillInput): Promise<BillRecord> {
    if (!payload.lines.length) {
      throw new Error('Add at least one bill line.');
    }
    if (!payload.payableAccountId) {
      throw new Error('Select a payable account.');
    }

    const totalAmount = payload.lines.reduce((sum, line) => {
      const lineTotal = Number(line.quantity || 0) * Number(line.unitPrice || 0);
      return sum + lineTotal;
    }, 0);

    const billNumber = payload.billNumber?.trim() || this.generateBillNumber();

    const { data: billData, error: billError } = await supabase
      .from('bills')
      .insert({
        bill_number: billNumber,
        supplier_name: payload.supplierName ?? null,
        supplier_id: payload.supplierId ?? null,
        bill_date: payload.billDate,
        due_date: payload.dueDate ?? null,
        status: payload.status ?? 'draft',
        account_id: payload.accountId ?? null,
        goods_received_id: payload.goodsReceivedId ?? null,
        total_amount: totalAmount,
        created_by: payload.createdBy ?? null,
        notes: payload.notes ?? null,
      })
      .select('id')
      .single();

    if (billError || !billData) {
      throw new Error(`Failed to create bill: ${billError?.message ?? 'Unknown error'}`);
    }

    const billId = billData.id;
    const linesPayload = payload.lines.map((line) => ({
      bill_id: billId,
      description: line.description ?? null,
      account_id: line.accountId ?? payload.accountId ?? null,
      quantity: Number(line.quantity || 0),
      unit_price: Number(line.unitPrice || 0),
      amount: Number(line.quantity || 0) * Number(line.unitPrice || 0),
    }));

    const { error: linesError } = await supabase
      .from('bill_lines')
      .insert(linesPayload);

    if (linesError) {
      throw new Error(`Failed to save bill lines: ${linesError.message}`);
    }

    const payableStatus = (payload.status ?? 'draft') === 'paid' ? 'closed' : 'open';
    const { error: payableError } = await supabase
      .from('payables')
      .insert({
        bill_id: billId,
        account_id: payload.payableAccountId,
        amount_due: totalAmount,
        amount_paid: payableStatus === 'closed' ? totalAmount : 0,
        due_date: payload.dueDate ?? null,
        status: payableStatus,
      });

    if (payableError) {
      throw new Error(`Failed to create payable: ${payableError.message}`);
    }

    return this.getBill(billId);
  }

  async getBill(billId: string): Promise<BillRecord> {
    const { data, error } = await supabase
      .from('bills')
      .select(`
        id,
        bill_number,
        supplier_name,
        bill_date,
        due_date,
        status,
        account_id,
        goods_received_id,
        total_amount,
        notes,
        bill_lines(id, description, account_id, quantity, unit_price, amount),
        payables(id, account_id, amount_due, amount_paid, due_date, status)
      `)
      .eq('id', billId)
      .single();

    if (error || !data) {
      throw new Error(`Failed to load bill: ${error?.message ?? 'Unknown error'}`);
    }

    return this.mapBillRow(data as BillRow);
  }

  async listManualJournals(): Promise<ManualJournalEntryRecord[]> {
    const { data, error } = await supabase
      .from('manual_journal_entries')
      .select(`
        id,
        entry_number,
        entry_date,
        reference,
        notes,
        status,
        manual_journal_lines(id, account_id, description, debit, credit)
      `)
      .order('entry_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to load manual journals: ${error.message}`);
    }

    return (data ?? []).map((row) => this.mapJournalRow(row as ManualJournalRow));
  }

  async createManualJournal(payload: CreateManualJournalInput) {
    if (!payload.lines.length) {
      throw new Error('Add at least one journal line.');
    }
    const totalDebit = payload.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const totalCredit = payload.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    if (Number(totalDebit.toFixed(2)) !== Number(totalCredit.toFixed(2))) {
      throw new Error('Debits and credits must balance.');
    }

    const entryNumber = payload.entryNumber?.trim() || this.generateJournalNumber();

    const { data: entry, error: entryError } = await supabase
      .from('manual_journal_entries')
      .insert({
        entry_number: entryNumber,
        entry_date: payload.entryDate,
        reference: payload.reference ?? null,
        notes: payload.notes ?? null,
        status: payload.status ?? 'draft',
        created_by: payload.createdBy ?? null,
      })
      .select('id')
      .single();

    if (entryError || !entry) {
      throw new Error(`Failed to create journal entry: ${entryError?.message ?? 'Unknown error'}`);
    }

    const linesPayload = payload.lines.map((line) => ({
      entry_id: entry.id,
      account_id: line.accountId,
      description: line.description ?? null,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    }));

    const { error: lineError } = await supabase
      .from('manual_journal_lines')
      .insert(linesPayload);

    if (lineError) {
      throw new Error(`Failed to create journal lines: ${lineError.message}`);
    }

    return entry.id;
  }

  private generateJournalNumber(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `JRN-${yyyy}${mm}${dd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  async listGoodsReceivedForBilling(): Promise<GoodsReceived[]> {
    const goods = await goodsService.getAllGoodsReceived();
    return goods.filter((record) => record.status !== 'pending');
  }

  async convertGoodsReceivedToBill(params: {
    goodsReceivedId: string;
    defaultAccountId?: string;
    payableAccountId: string;
    dueDate?: string;
    billDate?: string;
    createdBy?: string;
    status?: string;
    perLineAccounts?: Record<string, string>;
  }): Promise<BillRecord> {
    const goods = await goodsService.getGoodsReceived(params.goodsReceivedId);
    if (!goods.lines?.length) {
      throw new Error('Selected goods received note has no lines to bill.');
    }

    const mappedLines: BillLineInput[] = goods.lines.map((line) => {
      const accountId = params.perLineAccounts?.[line.id] ?? params.defaultAccountId;
      const quantity = Number(line.quantity_received ?? 0);
      const unitPrice = Number(line.unit_price ?? 0);
      return {
        description: line.raw_material?.name || 'Goods received item',
        accountId,
        quantity,
        unitPrice,
      };
    });

    return this.createBill({
      billNumber: `BILL-${goods.grn_number}`,
      supplierName: goods.purchase_order?.supplier?.name,
      supplierId: goods.purchase_order_id,
      billDate: params.billDate ?? goods.received_date,
      dueDate: params.dueDate ?? goods.received_date,
      status: params.status ?? 'draft',
      accountId: params.defaultAccountId,
      payableAccountId: params.payableAccountId,
      goodsReceivedId: goods.id,
      notes: `Auto-created from GRN ${goods.grn_number}`,
      createdBy: params.createdBy,
      lines: mappedLines,
    });
  }

  private mapBillRow(row: BillRow): BillRecord {
    const lines = Array.isArray(row.bill_lines)
      ? row.bill_lines.map((line) => ({
          id: line.id,
          description: line.description,
          accountId: line.account_id ?? undefined,
          quantity: Number(line.quantity ?? 0),
          unitPrice: Number(line.unit_price ?? 0),
          amount: Number(line.amount ?? 0),
        }))
      : [];
    const payable = Array.isArray(row.payables) && row.payables.length > 0
      ? {
          id: row.payables[0].id,
          accountId: row.payables[0].account_id,
          amountDue: Number(row.payables[0].amount_due ?? 0),
          amountPaid: Number(row.payables[0].amount_paid ?? 0),
          dueDate: row.payables[0].due_date,
          status: row.payables[0].status,
        }
      : null;

    return {
      id: row.id,
      billNumber: row.bill_number,
      supplierName: row.supplier_name,
      billDate: row.bill_date,
      dueDate: row.due_date,
      status: row.status,
      accountId: row.account_id,
      goodsReceivedId: row.goods_received_id,
      totalAmount: Number(row.total_amount ?? 0),
      notes: row.notes,
      lines,
      payable,
    };
  }
  private mapJournalRow(row: ManualJournalRow): ManualJournalEntryRecord {
    const lines = Array.isArray(row.manual_journal_lines)
      ? row.manual_journal_lines.map((line) => ({
          id: line.id,
          accountId: line.account_id,
          description: line.description,
          debit: Number(line.debit ?? 0),
          credit: Number(line.credit ?? 0),
        }))
      : [];

    return {
      id: row.id,
      entryNumber: row.entry_number,
      entryDate: row.entry_date,
      reference: row.reference,
      notes: row.notes,
      status: row.status,
      lines,
    };
  }
}

export const accountingService = new AccountingService();

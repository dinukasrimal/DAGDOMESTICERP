import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Receipt, RefreshCcw, Plus, BookOpen, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  accountingService,
  type BillLineInput,
  type BillRecord,
  type ChartOfAccount,
  type CreateBillInput,
} from '@/services/accountingService';
import type { GoodsReceived } from '@/services/goodsReceivedService';

interface EditableBillLine extends BillLineInput {
  id: string;
  accountId?: string;
  description?: string;
}

const createEmptyLine = (): EditableBillLine => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `line-${Math.random().toString(36).slice(2, 8)}`,
  description: '',
  quantity: 1,
  unitPrice: 0,
});

const toOption = (account: ChartOfAccount): SearchableOption => ({
  value: account.id,
  label: `${account.code} · ${account.name}`,
  description: account.accountType,
});

const Bills: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: accounts = [], refetch: refetchAccounts } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => accountingService.listChartOfAccounts(),
  });

  const { data: bills = [], refetch: refetchBills, isLoading: billsLoading } = useQuery({
    queryKey: ['bills'],
    queryFn: () => accountingService.listBills(),
  });

  const { data: goodsReceipts = [], refetch: refetchGoods } = useQuery({
    queryKey: ['goods-for-billing'],
    queryFn: () => accountingService.listGoodsReceivedForBilling(),
  });

  const [billForm, setBillForm] = useState<Omit<CreateBillInput, 'lines'>>({
    billDate: new Date().toISOString().split('T')[0],
    dueDate: undefined,
    payableAccountId: '',
    status: 'draft',
  });
  const [billLines, setBillLines] = useState<EditableBillLine[]>([createEmptyLine()]);

  const [selectedGoodsId, setSelectedGoodsId] = useState<string>('');
  const [perLineAccounts, setPerLineAccounts] = useState<Record<string, string>>({});
  const [convertPayableAccountId, setConvertPayableAccountId] = useState('');
  const [convertDefaultAccountId, setConvertDefaultAccountId] = useState('');
  const [convertDueDate, setConvertDueDate] = useState('');

  useEffect(() => {
    if (!billForm.payableAccountId) {
      const payable = accounts.find((account) => account.isPayable);
      if (payable) {
        setBillForm((prev) => ({ ...prev, payableAccountId: payable.id }));
      }
    }
  }, [accounts, billForm.payableAccountId]);

  useEffect(() => {
    if (!convertPayableAccountId) {
      const payable = accounts.find((account) => account.isPayable);
      if (payable) {
        setConvertPayableAccountId(payable.id);
      }
    }
  }, [accounts, convertPayableAccountId]);

  const accountOptions = useMemo(() => accounts.map(toOption), [accounts]);

  const payableOptions = useMemo(() => accountOptions.filter((opt) => {
    const acc = accounts.find((account) => account.id === opt.value);
    return acc?.isPayable;
  }), [accountOptions, accounts]);

  const totalAmount = useMemo(() => billLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0), [billLines]);

  const mutation = useMutation({
    mutationFn: (payload: CreateBillInput) => accountingService.createBill(payload),
    onSuccess: () => {
      toast({
        title: 'Bill saved',
        description: 'The bill was created successfully.',
      });
      void refetchBills();
      setBillLines([createEmptyLine()]);
      setBillForm((prev) => ({ ...prev, billNumber: '', supplierName: '', payableAccountId: prev.payableAccountId }));
    },
    onError: (error: Error) => {
      toast({
        title: 'Unable to save bill',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const convertMutation = useMutation({
    mutationFn: (payload: { goodsReceivedId: string; defaultAccountId?: string; payableAccountId: string; dueDate?: string; perLineAccounts: Record<string, string>; }) =>
      accountingService.convertGoodsReceivedToBill({
        goodsReceivedId: payload.goodsReceivedId,
        defaultAccountId: payload.defaultAccountId,
        payableAccountId: payload.payableAccountId,
        dueDate: payload.dueDate,
        billDate: undefined,
        createdBy: user?.id,
        perLineAccounts: payload.perLineAccounts,
      }),
    onSuccess: (bill) => {
      toast({
        title: 'Bill created from goods received',
        description: `Bill ${bill.billNumber} ready with total ${bill.totalAmount.toFixed(2)}.`,
      });
      void Promise.all([refetchBills(), refetchGoods()]);
      setSelectedGoodsId('');
      setPerLineAccounts({});
    },
    onError: (error: Error) => {
      toast({
        title: 'Conversion failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleLineChange = (id: string, field: keyof EditableBillLine, value: string | number) => {
    setBillLines((prev) => prev.map((line) => line.id === id ? { ...line, [field]: field === 'description' ? value : Number(value) } : line));
  };

  const handleLineAccountChange = (id: string, accountId: string) => {
    setBillLines((prev) => prev.map((line) => line.id === id ? { ...line, accountId } : line));
  };

  const addNewLine = () => setBillLines((prev) => [...prev, createEmptyLine()]);

  const removeLine = (id: string) => {
    setBillLines((prev) => prev.length > 1 ? prev.filter((line) => line.id !== id) : prev);
  };

  const handleCreateBill = () => {
    if (!billForm.billDate) {
      toast({
        title: 'Missing bill date',
        description: 'Select a bill date before saving.',
        variant: 'destructive',
      });
      return;
    }
    if (!billForm.payableAccountId) {
      toast({
        title: 'Payable account required',
        description: 'Choose a payable account.',
        variant: 'destructive',
      });
      return;
    }
    const payload: CreateBillInput = {
      ...billForm,
      createdBy: user?.id,
      lines: billLines.map((line) => ({
        description: line.description,
        accountId: line.accountId || billForm.accountId,
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
      })),
    };
    mutation.mutate(payload);
  };

  const selectedGoods = goodsReceipts.find((record) => record.id === selectedGoodsId);

  const goodsLineAccounts = selectedGoods?.lines?.reduce<Record<string, string>>((acc, line) => {
    if (line) {
      acc[line.id] = perLineAccounts[line.id] ?? convertDefaultAccountId;
    }
    return acc;
  }, {}) ?? {};

  const handleConvert = () => {
    if (!selectedGoodsId) {
      toast({
        title: 'Select a goods received note',
        description: 'Choose the goods received entry to convert.',
        variant: 'destructive',
      });
      return;
    }
    if (!convertPayableAccountId) {
      toast({
        title: 'Payable account required',
        description: 'Choose a payable account for the bill.',
        variant: 'destructive',
      });
      return;
    }
    convertMutation.mutate({
      goodsReceivedId: selectedGoodsId,
      defaultAccountId: convertDefaultAccountId || undefined,
      payableAccountId: convertPayableAccountId,
      dueDate: convertDueDate || undefined,
      perLineAccounts: Object.fromEntries(Object.entries(goodsLineAccounts).filter(([ , accountId]) => Boolean(accountId))),
    });
  };

  const convertLineTotal = (quantity?: number, price?: number) => Number(quantity || 0) * Number(price || 0);

  const goodsOptions: SearchableOption[] = goodsReceipts.map((record) => ({
    value: record.id,
    label: `${record.grn_number} · ${record.purchase_order?.supplier?.name ?? 'Unknown supplier'}`,
    description: `Received ${new Date(record.received_date).toLocaleDateString()} · ${record.status}`,
  }));

  const allowCreateAccount = async (label: string) => {
    const code = label.toUpperCase();
    const newAccount = await accountingService.createAccount({
      code,
      name: label,
      accountType: 'Expense',
    });
    await refetchAccounts();
    return toOption(newAccount);
  };

  return (
    <ModernLayout
      title="Bills"
      description="Manage supplier bills, conversions, and payables."
      icon={FileText}
      gradient="bg-gradient-to-r from-rose-500 to-purple-500"
    >
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Create Bill
            </CardTitle>
            <CardDescription>
              Capture supplier bills manually and automatically provision payables.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Bill number"
                value={billForm.billNumber ?? ''}
                onChange={(event) => setBillForm((prev) => ({ ...prev, billNumber: event.target.value }))}
              />
              <Input
                placeholder="Supplier"
                value={billForm.supplierName ?? ''}
                onChange={(event) => setBillForm((prev) => ({ ...prev, supplierName: event.target.value }))}
              />
              <Input
                type="date"
                value={billForm.billDate}
                onChange={(event) => setBillForm((prev) => ({ ...prev, billDate: event.target.value }))}
              />
              <Input
                type="date"
                placeholder="Due date"
                value={billForm.dueDate ?? ''}
                onChange={(event) => setBillForm((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
              <SearchableSelect
                options={accountOptions}
                value={billForm.accountId ?? ''}
                onChange={(value) => setBillForm((prev) => ({ ...prev, accountId: value }))}
                placeholder="Expense account"
                allowCreate
                onCreateOption={async (label) => allowCreateAccount(label)}
              />
              <SearchableSelect
                options={payableOptions}
                value={billForm.payableAccountId}
                onChange={(value) => setBillForm((prev) => ({ ...prev, payableAccountId: value }))}
                placeholder="Payable account"
              />
            </div>

            <Textarea
              placeholder="Notes"
              value={billForm.notes ?? ''}
              onChange={(event) => setBillForm((prev) => ({ ...prev, notes: event.target.value }))}
            />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bill Lines</h3>
                <Button type="button" variant="ghost" className="gap-2" onClick={addNewLine}>
                  <Plus className="h-4 w-4" />
                  Add Line
                </Button>
              </div>
              <div className="space-y-3">
                {billLines.map((line) => (
                  <div key={line.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-xl border p-4">
                    <div className="md:col-span-3">
                      <Input
                        placeholder="Description"
                        value={line.description ?? ''}
                        onChange={(event) => handleLineChange(line.id, 'description', event.target.value)}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <SearchableSelect
                        options={accountOptions}
                        value={line.accountId ?? ''}
                        onChange={(value) => handleLineAccountChange(line.id, value)}
                        placeholder="Line account"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.quantity}
                        onChange={(event) => handleLineChange(line.id, 'quantity', Number(event.target.value))}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) => handleLineChange(line.id, 'unitPrice', Number(event.target.value))}
                      />
                    </div>
                    <div className="md:col-span-1 flex items-center">
                      <span className="text-sm font-semibold">{(Number(line.quantity || 0) * Number(line.unitPrice || 0)).toFixed(2)}</span>
                    </div>
                    <div className="md:col-span-1 flex items-center justify-end">
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.id)} disabled={billLines.length === 1}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-lg font-bold">{totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setBillLines([createEmptyLine()]);
              }}>
                Reset
              </Button>
              <Button type="button" onClick={handleCreateBill} disabled={mutation.isLoading}>
                {mutation.isLoading ? 'Saving…' : 'Save Bill'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Convert Goods Received to Bill
            </CardTitle>
            <CardDescription>Select an approved goods received note and convert it instantly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchableSelect
                options={goodsOptions}
                value={selectedGoodsId}
                onChange={setSelectedGoodsId}
                placeholder="Select goods received"
                emptyLabel="No goods received available"
              />
              <Input
                type="date"
                value={convertDueDate}
                onChange={(event) => setConvertDueDate(event.target.value)}
                placeholder="Due date"
              />
              <SearchableSelect
                options={accountOptions}
                value={convertDefaultAccountId}
                onChange={setConvertDefaultAccountId}
                placeholder="Default expense account"
              />
              <SearchableSelect
                options={payableOptions}
                value={convertPayableAccountId}
                onChange={setConvertPayableAccountId}
                placeholder="Payable account"
              />
            </div>

            {selectedGoods && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">
                    GRN {selectedGoods.grn_number} · {selectedGoods.lines?.length ?? 0} lines
                  </span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => refetchGoods()}>
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {selectedGoods.lines?.map((line) => (
                    <div key={line.id} className="grid grid-cols-12 gap-3 rounded-lg border p-3">
                      <div className="col-span-4">
                        <div className="font-medium">{line.raw_material?.name ?? 'Material'}</div>
                        <div className="text-xs text-muted-foreground">Qty {Number(line.quantity_received ?? 0).toFixed(2)}</div>
                      </div>
                      <div className="col-span-2 flex items-center text-sm">
                        {(convertLineTotal(line.quantity_received, line.unit_price)).toFixed(2)}
                      </div>
                      <div className="col-span-6">
                        <SearchableSelect
                          options={accountOptions}
                          value={goodsLineAccounts[line.id] ?? ''}
                          onChange={(value) => setPerLineAccounts((prev) => ({ ...prev, [line.id]: value }))}
                          placeholder="Assign account"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end">
                  <Button type="button" onClick={handleConvert} disabled={convertMutation.isLoading}>
                    {convertMutation.isLoading ? 'Converting…' : 'Convert to Bill'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Bills
            </CardTitle>
            <CardDescription>Track payable totals for financial reporting.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-medium">{bill.billNumber}</TableCell>
                    <TableCell>{bill.supplierName ?? '—'}</TableCell>
                    <TableCell>{new Date(bill.billDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${bill.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : bill.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                        {bill.status.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{bill.totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {bills.length === 0 && !billsLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      No bills recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  );
};

export default Bills;

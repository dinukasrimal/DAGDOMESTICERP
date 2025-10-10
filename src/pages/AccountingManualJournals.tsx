import React, { useMemo, useState } from 'react';
import { NotebookPen, Plus, RefreshCcw, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  accountingService,
  type ChartOfAccount,
  type ManualJournalLineInput,
  type ManualJournalEntryRecord,
} from '@/services/accountingService';

interface EditableJournalLine extends ManualJournalLineInput {
  id: string;
}

const createJournalLine = (): EditableJournalLine => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `line-${Math.random().toString(36).slice(2, 8)}`,
  accountId: '',
  debit: 0,
  credit: 0,
  description: '',
});

const AccountingManualJournals: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => accountingService.listChartOfAccounts(),
  });

  const { data: journals = [], refetch } = useQuery<ManualJournalEntryRecord[]>({
    queryKey: ['manual-journals'],
    queryFn: () => accountingService.listManualJournals(),
  });

  const [entryNumber, setEntryNumber] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<EditableJournalLine[]>([createJournalLine()]);

  const accountOptions: SearchableOption[] = useMemo(() => accounts.map((account) => ({
    value: account.id,
    label: `${account.code} · ${account.name}`,
    description: account.accountType,
  })), [accounts]);

  const addLine = () => setLines((prev) => [...prev, createJournalLine()]);
  const removeLine = (id: string) => setLines((prev) => prev.length > 1 ? prev.filter((line) => line.id !== id) : prev);

  const updateLine = (id: string, field: keyof EditableJournalLine, value: string | number) => {
    setLines((prev) => prev.map((line) => line.id === id ? { ...line, [field]: field === 'description' || field === 'accountId' ? value : Number(value) } : line));
  };

  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

  const mutation = useMutation({
    mutationFn: () => accountingService.createManualJournal({
      entryNumber: entryNumber || undefined,
      entryDate,
      reference: reference || undefined,
      notes: notes || undefined,
      createdBy: user?.id,
      lines: lines.map((line) => ({
        accountId: line.accountId,
        description: line.description,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      })),
    }),
    onSuccess: () => {
      toast({ title: 'Journal saved' });
      setEntryNumber('');
      setReference('');
      setNotes('');
      setLines([createJournalLine()]);
      void refetch();
    },
    onError: (error: Error) => {
      toast({
        title: 'Unable to save journal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (Number(totalDebit.toFixed(2)) !== Number(totalCredit.toFixed(2))) {
      toast({
        title: 'Unbalanced entry',
        description: 'Debits and credits must match.',
        variant: 'destructive',
      });
      return;
    }
    if (lines.some((line) => !line.accountId)) {
      toast({
        title: 'Missing account',
        description: 'Each line requires an account.',
        variant: 'destructive',
      });
      return;
    }
    mutation.mutate();
  };

  return (
    <ModernLayout
      title="Manual Journals"
      description="Record ad-hoc journals to keep ledgers in balance."
      icon={NotebookPen}
      gradient="bg-gradient-to-r from-indigo-500 to-purple-500"
    >
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>New journal entry</CardTitle>
            <CardDescription>Balance debits and credits before posting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input placeholder="Entry number" value={entryNumber} onChange={(event) => setEntryNumber(event.target.value)} />
              <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
              <Input placeholder="Reference" value={reference} onChange={(event) => setReference(event.target.value)} />
            </div>
            <Textarea placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Lines</h3>
                <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={addLine}>
                  <Plus className="h-4 w-4" />
                  Add line
                </Button>
              </div>
              <div className="space-y-3">
                {lines.map((line) => (
                  <div key={line.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 border rounded-xl p-4">
                    <div className="md:col-span-4">
                      <SearchableSelect
                        options={accountOptions}
                        value={line.accountId}
                        onChange={(value) => updateLine(line.id, 'accountId', value)}
                        placeholder="Account"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <Input
                        placeholder="Description"
                        value={line.description ?? ''}
                        onChange={(event) => updateLine(line.id, 'description', event.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.debit ?? 0}
                        onChange={(event) => updateLine(line.id, 'debit', Number(event.target.value))}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.credit ?? 0}
                        onChange={(event) => updateLine(line.id, 'credit', Number(event.target.value))}
                      />
                    </div>
                    <div className="md:col-span-1 flex items-center justify-end">
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.id)} disabled={lines.length === 1}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-end gap-6 text-sm font-semibold">
                <div>Debit: {totalDebit.toFixed(2)}</div>
                <div>Credit: {totalCredit.toFixed(2)}</div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setLines([createJournalLine()]);
                setEntryNumber('');
                setReference('');
                setNotes('');
              }}>Reset</Button>
              <Button type="button" onClick={handleSubmit} disabled={mutation.isLoading}>
                {mutation.isLoading ? 'Saving…' : 'Post journal'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent journals</CardTitle>
              <CardDescription>Review manual journals to ensure balances stay accurate.</CardDescription>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {journals.map((journal) => (
              <div key={journal.id} className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{journal.entryNumber}</div>
                    <div className="text-xs text-muted-foreground">{new Date(journal.entryDate).toLocaleDateString()}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${journal.status === 'posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                    {journal.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">{journal.reference ?? '—'}</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journal.lines.map((line) => {
                      const account = accounts.find((acc) => acc.id === line.accountId);
                      return (
                        <TableRow key={line.id}>
                          <TableCell>{account ? `${account.code} · ${account.name}` : '—'}</TableCell>
                          <TableCell>{line.description ?? '—'}</TableCell>
                          <TableCell className="text-right">{Number(line.debit ?? 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{Number(line.credit ?? 0).toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))}
            {journals.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">
                No manual journals yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  );
};

export default AccountingManualJournals;

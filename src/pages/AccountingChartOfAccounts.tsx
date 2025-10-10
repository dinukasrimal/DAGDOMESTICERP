import React, { useMemo, useState } from 'react';
import { BookOpen, RefreshCcw } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  accountingService,
  type ChartOfAccount,
  type CreateAccountInput,
} from '@/services/accountingService';

const initialForm: CreateAccountInput = {
  code: '',
  name: '',
  accountType: '',
  category: '',
  isPayable: false,
  isReceivable: false,
};

const AccountingChartOfAccounts: React.FC = () => {
  const { toast } = useToast();
  const { data: accounts = [], refetch, isLoading } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: () => accountingService.listChartOfAccounts(),
  });

  const [form, setForm] = useState<CreateAccountInput>(initialForm);

  const mutation = useMutation({
    mutationFn: (payload: CreateAccountInput) => accountingService.createAccount(payload),
    onSuccess: () => {
      toast({ title: 'Account added' });
      setForm(initialForm);
      void refetch();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to add account',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!form.code.trim() || !form.name.trim() || !form.accountType.trim()) {
      toast({
        title: 'Missing information',
        description: 'Code, name, and account type are required.',
        variant: 'destructive',
      });
      return;
    }
    mutation.mutate({
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
      accountType: form.accountType.trim(),
      category: form.category?.trim(),
    });
  };

  const categorized = useMemo(() => {
    return [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts]);

  return (
    <ModernLayout
      title="Chart of Accounts"
      description="Configure the accounts used for billing, journals, and reporting."
      icon={BookOpen}
      gradient="bg-gradient-to-r from-emerald-500 to-cyan-500"
    >
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Add account</CardTitle>
            <CardDescription>Maintain the ledger structure and control account availability.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                placeholder="Code"
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              />
              <Input
                placeholder="Name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Input
                placeholder="Account type (e.g. Expense)"
                value={form.accountType}
                onChange={(event) => setForm((prev) => ({ ...prev, accountType: event.target.value }))}
              />
              <Input
                placeholder="Category"
                value={form.category ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center space-x-2 text-sm">
                <Checkbox
                  checked={form.isPayable}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isPayable: Boolean(checked) }))}
                />
                <span>Payable</span>
              </label>
              <label className="flex items-center space-x-2 text-sm">
                <Checkbox
                  checked={form.isReceivable}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isReceivable: Boolean(checked) }))}
                />
                <span>Receivable</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(initialForm)}>Reset</Button>
              <Button type="button" onClick={handleSubmit} disabled={mutation.isLoading}>
                {mutation.isLoading ? 'Saving…' : 'Save account'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>Reference accounts for bills, journals, and reports.</CardDescription>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Payable</TableHead>
                  <TableHead>Receivable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorized.map((account: ChartOfAccount) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-semibold">{account.code}</TableCell>
                    <TableCell>{account.name}</TableCell>
                    <TableCell>{account.accountType}</TableCell>
                    <TableCell>{account.category ?? '—'}</TableCell>
                    <TableCell>{account.isPayable ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{account.isReceivable ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))}
                {categorized.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      No accounts configured yet.
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

export default AccountingChartOfAccounts;

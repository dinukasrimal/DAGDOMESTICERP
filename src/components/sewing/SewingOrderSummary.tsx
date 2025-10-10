import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { sewingOutputRecordService, type SewingOrderSummaryEntry } from '@/services/sewingOutputRecordService';
import { toast } from '@/components/ui/use-toast';

const normalize = (value: string) => value.toLowerCase();

export const SewingOrderSummary: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [summaries, setSummaries] = useState<SewingOrderSummaryEntry[]>([]);

  const loadSummaries = async () => {
    setIsLoading(true);
    try {
      const data = await sewingOutputRecordService.listOrderSummaries();
      setSummaries(data);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Unable to load order summary',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummaries();
  }, []);

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return summaries;
    return summaries.filter((entry) => {
      const poMatch = entry.poNumber && normalize(entry.poNumber).includes(term);
      const categoryMatch = entry.productCategory && normalize(entry.productCategory).includes(term);
      const productMatch = entry.productName && normalize(entry.productName).includes(term);
      return poMatch || categoryMatch || productMatch;
    });
  }, [summaries, search]);

  const grouped = useMemo(() => {
    return filtered.reduce((acc, entry) => {
      const key = entry.poNumber;
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key)!.push(entry);
      return acc;
    }, new Map<string, SewingOrderSummaryEntry[]>());
  }, [filtered]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Order Summary
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={loadSummaries}
            disabled={isLoading}
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <Input
          placeholder="Search by PO or category…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9"
        />
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[360px]">
          <div className="divide-y">
            {grouped.size === 0 && !isLoading && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No matching purchase orders found.
              </div>
            )}
            {Array.from(grouped.entries()).map(([poNumber, entries]) => {
              const supplierName = entries[0]?.supplierName;
              const totalSewing = entries.reduce((sum, entry) => sum + (entry.sewingQuantity || 0), 0);
              return (
                <div key={poNumber} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{poNumber}</div>
                      {supplierName && (
                        <div className="text-xs text-muted-foreground">{supplierName}</div>
                      )}
                    </div>
                    <Badge variant="secondary">Sewing: {totalSewing.toLocaleString()}</Badge>
                  </div>
                  <div className="rounded border bg-muted/40">
                    <div className="grid grid-cols-12 bg-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className="col-span-4">Product / Category</span>
                      <span className="col-span-2 text-right">Ordered</span>
                      <span className="col-span-2 text-right">Cut</span>
                      <span className="col-span-2 text-right">Issued</span>
                      <span className="col-span-2 text-right">Sewing</span>
                    </div>
                    <div className="divide-y">
                      {entries.map((entry) => (
                        <div key={`${entry.poNumber}-${entry.orderLineId ?? entry.productName}`} className="grid grid-cols-12 items-center px-3 py-1.5 text-[11px]">
                          <div className="col-span-4 pr-2">
                            <div className="font-medium text-foreground">
                              {entry.productName || 'Unnamed Variant'}
                            </div>
                            {entry.productCategory && (
                              <div className="text-muted-foreground">{entry.productCategory}</div>
                            )}
                          </div>
                          <div className="col-span-2 text-right">{entry.orderedQuantity.toLocaleString()}</div>
                          <div className="col-span-2 text-right">{entry.cutQuantity.toLocaleString()}</div>
                          <div className="col-span-2 text-right">{entry.issueQuantity.toLocaleString()}</div>
                          <div className="col-span-2 text-right text-foreground font-semibold">
                            {entry.sewingQuantity.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

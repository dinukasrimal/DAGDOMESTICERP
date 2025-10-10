import React from 'react';
import { format } from 'date-fns';
import { ClipboardCheck, Printer, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SewingOutputRecordEntry } from '@/services/sewingOutputRecordService';

interface SewingOutputListProps {
  records: SewingOutputRecordEntry[];
  isLoading?: boolean;
  onDelete?: (record: SewingOutputRecordEntry) => void;
  onPrint?: (record: SewingOutputRecordEntry) => void;
}

export const SewingOutputList: React.FC<SewingOutputListProps> = ({
  records,
  isLoading = false,
  onDelete,
  onPrint,
}) => {
  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <ClipboardCheck className="h-5 w-5" />
            Loading sewing output records…
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Fetching the latest recorded sewing outputs.</p>
        </CardContent>
      </Card>
    );
  }

  if (records.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <ClipboardCheck className="h-5 w-5" />
            No sewing outputs yet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Saved records will appear here once you start recording sewing output.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider disableHoverableContent>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Recent Sewing Output Records
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[520px]">
            <div className="divide-y">
              {records.map((record) => {
                const createdDate = record.createdAt ? new Date(record.createdAt) : null;
                const formattedDate = createdDate ? format(createdDate, 'MMM d, yyyy HH:mm') : '—';
                const totalOutput = record.totalOutputQuantity.toLocaleString();

                return (
                  <div key={record.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          {record.supplierName}
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {record.outputCode}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">Recorded on {formattedDate}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">Total Output: {totalOutput}</Badge>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Print sewing output record"
                                onClick={() => onPrint?.(record)}
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Print</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Delete sewing output record"
                                className="text-destructive hover:text-destructive"
                                onClick={() => onDelete?.(record)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const grouped = record.lineItems.reduce((acc, line) => {
                        const key = line.poNumber || 'Unknown PO';
                        if (!acc.has(key)) acc.set(key, []);
                        acc.get(key)!.push(line);
                        return acc;
                      }, new Map<string, SewingOutputRecordEntry['lineItems']>());

                      return Array.from(grouped.entries()).map(([poNumber, lines]) => {
                        const poOutput = lines.reduce((sum, line) => sum + line.outputQuantity, 0);
                        return (
                          <div key={poNumber} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground">{poNumber}</span>
                              <span className="text-muted-foreground">Output: {poOutput.toLocaleString()}</span>
                            </div>
                            <div className="rounded border bg-muted/40">
                              <div className="grid grid-cols-12 bg-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                <span className="col-span-4">Variant</span>
                                <span className="col-span-2 text-right">Ordered</span>
                                <span className="col-span-2 text-right">Cut</span>
                                <span className="col-span-2 text-right">Issued</span>
                                <span className="col-span-2 text-right">Output</span>
                              </div>
                              <div className="divide-y">
                                {lines.map((line) => (
                                  <div key={line.id} className="grid grid-cols-12 items-center px-3 py-1.5 text-[11px]">
                                    <div className="col-span-4 pr-2">
                                      <div className="font-medium text-foreground">{line.productName || '—'}</div>
                                      {line.orderLineId && (
                                        <div className="text-muted-foreground">#{line.orderLineId}</div>
                                      )}
                                    </div>
                                    <div className="col-span-2 text-right">
                                      {line.orderedQuantity !== undefined ? line.orderedQuantity.toLocaleString() : '—'}
                                    </div>
                                    <div className="col-span-2 text-right">
                                      {line.cutQuantity !== undefined ? line.cutQuantity.toLocaleString() : '—'}
                                    </div>
                                    <div className="col-span-2 text-right">
                                      {line.issueQuantity !== undefined ? line.issueQuantity.toLocaleString() : '—'}
                                    </div>
                                    <div className="col-span-2 text-right text-foreground font-semibold">
                                      {line.outputQuantity.toLocaleString()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

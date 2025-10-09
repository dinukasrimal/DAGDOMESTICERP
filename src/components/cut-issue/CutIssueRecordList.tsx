import React from 'react';
import { format } from 'date-fns';
import { ClipboardCheck, Printer, Scale, Trash2, Pencil, Factory } from 'lucide-react';
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
import type { CutIssueRecordEntry } from '@/services/cutIssueRecordService';

interface CutIssueRecordListProps {
  records: CutIssueRecordEntry[];
  isLoading?: boolean;
  onEdit?: (record: CutIssueRecordEntry) => void;
  onDelete?: (record: CutIssueRecordEntry) => void;
  onPrint?: (record: CutIssueRecordEntry) => void;
}

export const CutIssueRecordList: React.FC<CutIssueRecordListProps> = ({
  records,
  isLoading = false,
  onEdit,
  onDelete,
  onPrint,
}) => {
  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <ClipboardCheck className="h-5 w-5" />
            Loading cut issue records…
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Fetching the latest saved issue records.</p>
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
            No cut issue records yet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Saved records will appear here once you start recording cut issues.
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
            Recent Cut Issue Records
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[520px]">
            <div className="divide-y">
              {records.map((record) => {
                const createdDate = record.createdAt ? new Date(record.createdAt) : null;
                const formattedDate = createdDate ? format(createdDate, 'MMM d, yyyy HH:mm') : '—';
                const totalIssuedQty = record.totalCutQuantity ?? record.lineItems.reduce((sum, line) => {
                  const qty = typeof line.cutQuantity === 'number' ? line.cutQuantity : 0;
                  return sum + qty;
                }, 0);

                return (
                  <div key={record.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          {record.poNumber}
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {record.issueCode}
                          </Badge>
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Recorded on {formattedDate}</span>
                          {record.supplierName && (
                            <span className="flex items-center gap-1">
                              <Factory className="h-3 w-3" />
                              {record.supplierName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Scale className="h-3 w-3" />
                          {record.weightKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg
                        </Badge>
                        {totalIssuedQty > 0 && (
                          <Badge variant="outline">{totalIssuedQty.toLocaleString()} pcs</Badge>
                        )}
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit cut issue record"
                                onClick={() => onEdit?.(record)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Print cut issue record"
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
                                aria-label="Delete cut issue record"
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

                    <div className="space-y-2">
                      {record.lineItems.map((line) => (
                        <div key={line.orderLineId} className="text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">{line.productName}</p>
                          <p>
                            Issued {line.cutQuantity?.toLocaleString() ?? 0}
                            {line.unitOfMeasure ? ` ${line.unitOfMeasure}` : ''}
                            {typeof line.orderedQuantity === 'number' ? ` of ${line.orderedQuantity.toLocaleString()}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
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

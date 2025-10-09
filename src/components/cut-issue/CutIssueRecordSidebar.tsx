import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PackageMinus } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import {
  cutIssueRecordService,
  type CutIssueRecordEntry,
  type CutIssueRecordLineItem,
  type CreateCutIssueRecordInput,
  type PurchaseOption,
} from '@/services/cutIssueRecordService';
import type { PurchaseOrderLine } from '@/services/cuttingRecordService';
import { cuttingRecordService } from '@/services/cuttingRecordService';
import { toast } from '@/components/ui/use-toast';

interface CutIssueRecordSidebarProps {
  open: boolean;
  mode: 'create' | 'edit';
  record?: CutIssueRecordEntry | null;
  onOpenChange: (open: boolean) => void;
  onSave: (record: CutIssueRecordEntry) => void;
}

export const CutIssueRecordSidebar: React.FC<CutIssueRecordSidebarProps> = ({
  open,
  mode,
  record,
  onOpenChange,
  onSave,
}) => {
  const [purchaseOptions, setPurchaseOptions] = useState<PurchaseOption[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>('');
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseOption | null>(null);
  const [orderLines, setOrderLines] = useState<PurchaseOrderLine[]>([]);
  const [isLoadingLines, setIsLoadingLines] = useState(false);
  const [lineQuantities, setLineQuantities] = useState<Record<string, number>>({});
  const [weightKg, setWeightKg] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [orderedTotal, setOrderedTotal] = useState<number>(0);
  const [existingCutTotal, setExistingCutTotal] = useState<number>(0);
  const [lineCutTotals, setLineCutTotals] = useState<Record<string, number>>({});

  const isEditMode = mode === 'edit' && Boolean(record);

  const resetForm = useCallback(() => {
    setSelectedPurchaseId('');
    setSelectedPurchase(null);
    setOrderLines([]);
    setLineQuantities({});
    setWeightKg('');
    setOrderedTotal(0);
    setExistingCutTotal(0);
    setLineCutTotals({});
  }, []);

  const purchaseSelectOptions = useMemo<SearchableOption[]>(() => {
    const baseOptions = purchaseOptions.map((purchase) => {
      const descriptionParts: string[] = [];
      if (purchase.partnerName) descriptionParts.push(purchase.partnerName);
      if (purchase.orderDate) descriptionParts.push(purchase.orderDate);

      return {
        value: purchase.id,
        label: purchase.poNumber,
        description: descriptionParts.length ? descriptionParts.join(' • ') : undefined,
      } satisfies SearchableOption;
    });

    if (isEditMode && record?.purchaseId && !baseOptions.some((option) => option.value === record.purchaseId)) {
      baseOptions.push({
        value: record.purchaseId,
        label: record.poNumber,
        description: undefined,
      });
    }

    return baseOptions;
  }, [purchaseOptions, isEditMode, record]);

  const isSaveDisabled = useMemo(() => {
    const parsedWeight = Number(weightKg);
    return (
      !selectedPurchaseId ||
      !Number.isFinite(parsedWeight) ||
      parsedWeight <= 0 ||
      isSaving
    );
  }, [isSaving, selectedPurchaseId, weightKg]);

  useEffect(() => {
    if (!open) return;

    setIsLoadingPurchases(true);
    cutIssueRecordService
      .getPurchaseOptions()
      .then(setPurchaseOptions)
      .catch((error) => {
        console.error(error);
        toast({
          title: 'Unable to load purchase orders',
          description: error instanceof Error ? error.message : 'Please try again later.',
          variant: 'destructive',
        });
      })
      .finally(() => setIsLoadingPurchases(false));

  }, [open]);

  useEffect(() => {
    if (!open || !isEditMode || !record?.purchaseId) return;

    setPurchaseOptions((prev) => {
      if (prev.some((option) => option.id === record.purchaseId)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: record.purchaseId,
          name: null,
          partnerName: record.supplierName ?? null,
          poNumber: record.poNumber,
          orderDate: null,
          orderLines: [],
        },
      ];
    });
  }, [open, isEditMode, record]);

  useEffect(() => {
    if (!selectedPurchaseId) {
      setSelectedPurchase(null);
      setOrderLines([]);
      setLineQuantities({});
      return;
    }

    const purchase = purchaseOptions.find((option) => option.id === selectedPurchaseId) ?? null;
    setSelectedPurchase(purchase);

    if (!purchase) {
      setOrderLines([]);
      setLineQuantities({});
      return;
    }

    setIsLoadingLines(true);
    cutIssueRecordService
      .getPurchaseOrderLines(purchase.id)
      .then((lines) => {
        setOrderLines(lines);
        const existingQuantities: Record<string, number> = {};
        if (isEditMode && record) {
          record.lineItems.forEach((item) => {
            if (item.orderLineId) {
              existingQuantities[item.orderLineId] = typeof item.cutQuantity === 'number' ? item.cutQuantity : 0;
            }
          });
        }

        const initialQuantities: Record<string, number> = {};
        let totalOrdered = 0;
        lines.forEach((line) => {
          initialQuantities[line.id] = existingQuantities[line.id] ?? 0;
          totalOrdered += line.orderedQuantity ?? 0;
        });
        setLineQuantities(initialQuantities);
        setOrderedTotal(totalOrdered);
        if (purchase?.poNumber) {
          void Promise.all([
            cuttingRecordService.getTotalCutQuantity(purchase.poNumber),
            cuttingRecordService.getCutQuantitiesByLine(purchase.poNumber),
          ])
            .then(([totalQty, lineTotals]) => {
              setExistingCutTotal(totalQty);
              setLineCutTotals(lineTotals);
            })
            .catch((error) => {
              console.error(error);
              toast({
                title: 'Unable to load cut quantity totals',
                description: error instanceof Error ? error.message : 'Please try again later.',
                variant: 'destructive',
              });
              setExistingCutTotal(0);
              setLineCutTotals({});
            });
        } else {
          setExistingCutTotal(0);
          setLineCutTotals({});
        }
      })
      .catch((error) => {
        console.error(error);
        toast({
          title: 'Unable to load order lines',
          description: error instanceof Error ? error.message : 'Please try again later.',
          variant: 'destructive',
        });
        setOrderLines([]);
        setLineQuantities({});
      })
      .finally(() => setIsLoadingLines(false));
  }, [selectedPurchaseId, purchaseOptions, isEditMode, record]);

  useEffect(() => {
    if (!open) return;

    if (isEditMode && record) {
      setSelectedPurchaseId(record.purchaseId ?? '');
      setWeightKg(String(record.weightKg ?? ''));

      const existingQuantities: Record<string, number> = {};
      let totalOrdered = 0;
      let totalCut = 0;
      const lineTotals: Record<string, number> = {};
      record.lineItems.forEach((item) => {
        if (item.orderLineId) {
          existingQuantities[item.orderLineId] = typeof item.cutQuantity === 'number' ? item.cutQuantity : 0;
          lineTotals[item.orderLineId] = item.cutQuantity ?? 0;
        }
        totalOrdered += item.orderedQuantity ?? 0;
        totalCut += item.cutQuantity ?? 0;
      });
      setLineQuantities(existingQuantities);
      setOrderedTotal(totalOrdered);
      setExistingCutTotal(totalCut);
      setLineCutTotals(lineTotals);
    } else {
      resetForm();
    }
  }, [open, isEditMode, record, resetForm]);

  const handleReset = () => {
    resetForm();
  };

  const handleLineQuantityChange = useCallback((lineId: string, allowed: number, nextValue: number) => {
    if (allowed <= 0 && nextValue > 0) {
      toast({
        title: 'No cut quantity recorded',
        description: 'You cannot issue trims for this variant because no cut quantity exists.',
        variant: 'destructive',
      });
      setLineQuantities((prev) => ({ ...prev, [lineId]: 0 }));
      return;
    }

    if (nextValue > allowed) {
      toast({
        title: 'Issued quantity too high',
        description: `You can issue at most ${allowed.toLocaleString()} for this variant based on recorded cuts.`,
        variant: 'destructive',
      });
      setLineQuantities((prev) => ({ ...prev, [lineId]: allowed }));
      return;
    }

    setLineQuantities((prev) => ({ ...prev, [lineId]: nextValue }));
  }, [lineCutTotals]);

  const handleSave = async () => {
    const parsedWeight = Number(weightKg);

    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      toast({
        title: 'Weight is required',
        description: 'Enter the weight of the cut in kilograms.',
        variant: 'destructive',
      });
      return;
    }

    const totalIssuedInput = Object.values(lineQuantities).reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0
    );

    if (totalIssuedInput > existingCutTotal) {
      toast({
        title: 'Issued quantity exceeds available cut',
        description: 'You cannot issue more than the total cut quantity recorded for this PO.',
        variant: 'destructive',
      });
      return;
    }

    const preparedLineItems: CutIssueRecordLineItem[] = orderLines
      .map((line) => ({
        orderLineId: line.id,
        productName: line.productName,
        orderedQuantity: line.orderedQuantity,
        unitOfMeasure: line.unitOfMeasure,
        cutQuantity: lineQuantities[line.id] ?? 0,
      }))
      .filter((item) => item.cutQuantity && item.cutQuantity > 0);

    if (preparedLineItems.length === 0) {
      toast({
        title: 'Add cutting quantities',
        description: 'Record at least one cut quantity before saving.',
        variant: 'destructive',
      });
      return;
    }

    const purchaseForSave = selectedPurchase ?? (isEditMode && record?.purchaseId
      ? {
          id: record.purchaseId,
          poNumber: record.poNumber,
          partnerName: record.supplierName ?? '',
        }
      : null);

    if (!purchaseForSave || !purchaseForSave.id) {
      toast({
        title: 'Select a PO first',
        description: 'Please choose a purchase order before saving.',
        variant: 'destructive',
      });
      return;
    }

    const supplierName = purchaseForSave.partnerName ?? record?.supplierName ?? '';

    const payload: CreateCutIssueRecordInput = {
      purchaseId: purchaseForSave.id,
      poNumber: purchaseForSave.poNumber,
      supplierName,
      weightKg: parsedWeight,
      lineItems: preparedLineItems,
    };

    try {
      setIsSaving(true);

      const savedRecord = isEditMode && record
        ? await cutIssueRecordService.updateCutIssueRecord(record.id, payload)
        : await cutIssueRecordService.createCutIssueRecord(payload);

      toast({
        title: isEditMode ? 'Cut issue updated' : 'Cut issue recorded',
        description: `Issue ID ${savedRecord.issueCode} ${isEditMode ? 'updated' : 'created'} for ${purchaseForSave.poNumber}.`,
      });
      onSave(savedRecord);
      handleReset();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({
        title: isEditMode ? 'Failed to update cut issue' : 'Failed to save cut issue',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          handleReset();
        }
        onOpenChange(value);
      }}
    >
      <SheetContent className="w-[520px] sm:max-w-[560px] flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PackageMinus className="h-5 w-5 text-primary" />
            {isEditMode ? 'Edit Cut Issue' : 'Record Cut Issue'}
          </SheetTitle>
          <SheetDescription>
            Select a purchase order, review the supplier, add issued quantities for its lines, and capture the required weight before saving.
          </SheetDescription>
          {isEditMode && record && (
            <div className="text-xs text-muted-foreground">
              Issue ID: <span className="font-semibold text-foreground">{record.issueCode}</span>
            </div>
          )}
        </SheetHeader>

        <div className="space-y-5 flex-1 overflow-hidden">
          <div className="space-y-2">
            <Label htmlFor="cut-issue-po">Purchase Order</Label>
            <SearchableSelect
              options={purchaseSelectOptions}
              value={selectedPurchaseId}
              onChange={setSelectedPurchaseId}
              placeholder={isLoadingPurchases ? 'Loading purchase orders…' : 'Select purchase order'}
              searchPlaceholder="Search purchase orders..."
              disabled={isLoadingPurchases || isEditMode}
              className="w-full"
            />
            <div className="text-xs text-muted-foreground">
              Ordered Qty: <span className="font-semibold text-foreground">{orderedTotal.toLocaleString()}</span>
              <span className="mx-2">•</span>
              Cut Qty: <span className="font-semibold text-foreground">{existingCutTotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Supplier</Label>
            <div className="border rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {(selectedPurchase?.partnerName ?? record?.supplierName) || 'Supplier will appear once a PO is selected.'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Weight of Cut (kg)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Enter weight in kilograms"
              value={weightKg}
              onChange={(event) => setWeightKg(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">This value is required before saving.</p>
          </div>

          <div className="space-y-2 flex-1 overflow-hidden">
            <div className="flex items-center justify-between">
              <Label>Order Lines</Label>
              {isLoadingLines && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading
                </span>
              )}
            </div>
            <div className="border rounded-lg h-80 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="divide-y pb-20">
                  {orderLines.length === 0 && !isLoadingLines ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      {selectedPurchase ? 'No order lines found for this PO.' : 'Select a purchase order to view its lines.'}
                    </div>
                  ) : (
                    orderLines.map((line) => {
                      const orderedQty = Number(line.orderedQuantity ?? 0);
                      const allowedCut = lineCutTotals[line.id] ?? 0;
                      return (
                        <div key={line.id} className="p-4 space-y-3">
                          <div>
                            <p className="font-medium text-sm text-foreground">{line.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              Ordered: {orderedQty.toLocaleString()} {line.unitOfMeasure ?? ''}
                              <span className="mx-2">•</span>
                              Cut: {allowedCut.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <Label htmlFor={`cut-issue-line-${line.id}`} className="text-xs text-muted-foreground">
                              Issued quantity
                            </Label>
                            <Input
                              id={`cut-issue-line-${line.id}`}
                              type="number"
                              min={0}
                              step="0.01"
                              value={lineQuantities[line.id] ?? 0}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                if (!Number.isFinite(value) || value < 0) {
                                  handleLineQuantityChange(line.id, allowedCut, 0);
                                } else {
                                  handleLineQuantityChange(line.id, allowedCut, value);
                                }
                              }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex justify-between gap-3">
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            Clear
          </Button>
          <Button onClick={handleSave} disabled={isSaveDisabled}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isEditMode ? 'Updating' : 'Saving'}
              </>
            ) : isEditMode ? 'Update Cut Issue' : 'Save Cut Issue'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

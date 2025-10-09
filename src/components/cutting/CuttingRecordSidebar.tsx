import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Scissors } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import {
  cuttingRecordService,
  type CuttingRecord,
  type CuttingRecordLineItem,
  type PurchaseOption,
  type PurchaseOrderLine,
} from '@/services/cuttingRecordService';
import { toast } from '@/components/ui/use-toast';

interface CuttingRecordSidebarProps {
  open: boolean;
  mode: 'create' | 'edit';
  record?: CuttingRecord | null;
  onOpenChange: (open: boolean) => void;
  onSave: (record: CuttingRecord) => void;
}

export const CuttingRecordSidebar: React.FC<CuttingRecordSidebarProps> = ({
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
    return !selectedPurchaseId || !Number.isFinite(parsedWeight) || parsedWeight <= 0 || isSaving;
  }, [isSaving, selectedPurchaseId, weightKg]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsLoadingPurchases(true);
    cuttingRecordService
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
          partnerName: null,
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
    cuttingRecordService
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
      if (record.purchaseId) {
        setSelectedPurchaseId(record.purchaseId);
      } else {
        setSelectedPurchaseId('');
      }
      setWeightKg(String(record.weightKg ?? ''));

      const existingQuantities: Record<string, number> = {};
      let totalOrdered = 0;
      let totalCut = 0;
      const lineTotals: Record<string, number> = {};
      record.lineItems.forEach((item) => {
        if (item.orderLineId) {
          const qty = typeof item.cutQuantity === 'number' ? item.cutQuantity : Number(item.cutQuantity) || 0;
          existingQuantities[item.orderLineId] = qty;
          lineTotals[item.orderLineId] = qty;
          totalCut += qty;
        }
        totalOrdered += item.orderedQuantity ?? 0;
      });
      setLineQuantities(existingQuantities);
      setLineCutTotals(lineTotals);
      setOrderedTotal(totalOrdered);
      setExistingCutTotal(totalCut);
    } else {
      resetForm();
      setOrderedTotal(0);
      setExistingCutTotal(0);
      setLineCutTotals({});
    }
  }, [open, isEditMode, record, resetForm]);

  const handleReset = () => {
    resetForm();
  };

  const handleLineQuantityChange = useCallback((lineId: string, ordered: number, nextValue: number) => {
    const allowed = Number.isFinite(ordered) && ordered > 0 ? ordered : 0;

    if (allowed <= 0 && nextValue > 0) {
      toast({
        title: 'Cannot exceed ordered quantity',
        description: 'This variant has no ordered quantity recorded.',
        variant: 'destructive',
      });
      setLineQuantities((prev) => ({ ...prev, [lineId]: 0 }));
      return;
    }

    if (nextValue > allowed) {
      toast({
        title: 'Cut quantity too high',
        description: `You can cut at most ${allowed.toLocaleString()} for this variant based on ordered quantity.`,
        variant: 'destructive',
      });
      setLineQuantities((prev) => ({ ...prev, [lineId]: allowed }));
      return;
    }

    setLineQuantities((prev) => ({ ...prev, [lineId]: nextValue }));
  }, [setLineQuantities]);

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

    const preparedLineItems: CuttingRecordLineItem[] = orderLines
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
          name: null,
          partnerName: null,
          poNumber: record.poNumber,
          orderDate: null,
          orderLines: [],
        }
      : null);

    if (!purchaseForSave) {
      toast({
        title: 'Select a PO first',
        description: 'Please choose a purchase order before saving.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSaving(true);

      const savedRecord = isEditMode && record
        ? await cuttingRecordService.updateCuttingRecord(record.id, {
            purchaseId: purchaseForSave.id,
            poNumber: purchaseForSave.poNumber,
            weightKg: parsedWeight,
            lineItems: preparedLineItems,
          })
        : await cuttingRecordService.createCuttingRecord({
            purchaseId: purchaseForSave.id,
            poNumber: purchaseForSave.poNumber,
            weightKg: parsedWeight,
            lineItems: preparedLineItems,
          });

      toast({
        title: isEditMode ? 'Cutting record updated' : 'Cutting record saved',
        description: `Cutting ID ${savedRecord.cuttingCode} ${isEditMode ? 'updated' : 'created'} for ${purchaseForSave.poNumber}.`,
      });
      onSave(savedRecord);
      handleReset();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({
        title: isEditMode ? 'Failed to update cutting record' : 'Failed to save cutting record',
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
      <SheetContent className="w-[480px] sm:max-w-[520px] flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-primary" />
            {isEditMode ? 'Edit Cutting Record' : 'Record Cutting'}
          </SheetTitle>
          <SheetDescription>
            Select a purchase order, add cut quantities for its lines, and capture the required weight before saving.
          </SheetDescription>
          {isEditMode && record && (
            <div className="text-xs text-muted-foreground">
              Cutting ID: <span className="font-semibold text-foreground">{record.cuttingCode}</span>
            </div>
          )}
        </SheetHeader>

        <div className="space-y-5 flex-1 overflow-hidden">
          <div className="space-y-2">
            <Label htmlFor="cutting-po">Purchase Order</Label>
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
                      return (
                        <div key={line.id} className="p-4 space-y-3">
                          <div>
                            <p className="font-medium text-sm text-foreground">{line.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              Ordered: {orderedQty.toLocaleString()} {line.unitOfMeasure ?? ''}
                              <span className="mx-2">•</span>
                              Cut: {(lineCutTotals[line.id] ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <Label htmlFor={`line-${line.id}`} className="text-xs text-muted-foreground">
                              Cut quantity
                            </Label>
                            <Input
                              id={`line-${line.id}`}
                              type="number"
                              min={0}
                              step="0.01"
                              value={lineQuantities[line.id] ?? 0}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                if (!Number.isFinite(value) || value < 0) {
                                  handleLineQuantityChange(line.id, orderedQty, 0);
                                } else {
                                  handleLineQuantityChange(line.id, orderedQty, value);
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
            ) : isEditMode ? 'Update Cutting Record' : 'Save Cutting Record'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Shirt, TriangleAlert } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { toast } from '@/components/ui/use-toast';
import {
  sewingOutputRecordService,
  type SewingOutputRecordEntry,
  type CreateSewingOutputRecordInput,
  type SewingPurchaseOption,
  type SewingSupplierOption,
} from '@/services/sewingOutputRecordService';

interface SewingOutputSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (record: SewingOutputRecordEntry) => void;
}

type VariantRow = {
  orderLineId: string;
  productName: string;
  orderedQuantity: number;
  cutQuantity: number;
  issueQuantity: number;
  outputQuantity: number;
};

type LineRow = {
  id: string;
  purchaseId?: string;
  poNumber?: string;
  variants: VariantRow[];
  isLoadingVariants?: boolean;
};

function createLineRow(): LineRow {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10),
    variants: [],
  };
}

export const SewingOutputSidebar: React.FC<SewingOutputSidebarProps> = ({
  open,
  onOpenChange,
  onSave,
}) => {
  const [supplierOptions, setSupplierOptions] = useState<SewingSupplierOption[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');

  const [purchaseOptions, setPurchaseOptions] = useState<SewingPurchaseOption[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(false);

  const [lineRows, setLineRows] = useState<LineRow[]>([createLineRow()]);
  const [isSaving, setIsSaving] = useState(false);

  const totalOutputQuantity = useMemo(() => (
    lineRows.reduce((sum, row) => sum + row.variants.reduce((lineSum, variant) => lineSum + (variant.outputQuantity || 0), 0), 0)
  ), [lineRows]);

  const supplierSelectOptions = useMemo<SearchableOption[]>(() => (
    supplierOptions.map((supplier) => ({
      value: supplier.id,
      label: supplier.name,
    }))
  ), [supplierOptions]);

  const poSelectOptions = useMemo<SearchableOption[]>(() => (
    purchaseOptions.map((purchase) => ({
      value: purchase.id,
      label: purchase.poNumber,
      description: `Ordered ${purchase.orderedQuantity.toLocaleString()}`,
    }))
  ), [purchaseOptions]);

  const resetForm = useCallback(() => {
    setSelectedSupplier('');
    setPurchaseOptions([]);
    setLineRows([createLineRow()]);
  }, []);

  useEffect(() => {
    if (!open) return;

    setIsLoadingSuppliers(true);
    sewingOutputRecordService
      .listSuppliers()
      .then(setSupplierOptions)
      .catch((error) => {
        console.error(error);
        toast({
          title: 'Unable to load suppliers',
          description: error instanceof Error ? error.message : 'Please try again later.',
          variant: 'destructive',
        });
      })
      .finally(() => setIsLoadingSuppliers(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  const handleSupplierChange = async (value: string) => {
    setSelectedSupplier(value);
    setLineRows([createLineRow()]);
    if (!value) {
      setPurchaseOptions([]);
      return;
    }

    setIsLoadingPurchases(true);
    try {
      const purchases = await sewingOutputRecordService.getPurchaseOptionsBySupplier(value);
      setPurchaseOptions(purchases);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Unable to load purchase orders',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPurchases(false);
    }
  };

  const loadVariantsForRow = async (rowId: string, purchaseId: string | undefined, poNumber: string | undefined) => {
    if (!purchaseId) {
      setLineRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, purchaseId: undefined, poNumber: undefined, variants: [] } : row)));
      return;
    }

    setLineRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, purchaseId, poNumber, variants: [], isLoadingVariants: true } : row)));
    try {
      const variants = await sewingOutputRecordService.getPurchaseVariants(purchaseId);
      const mappedVariants: VariantRow[] = variants.map((variant) => ({
        orderLineId: variant.orderLineId,
        productName: variant.productName,
        orderedQuantity: variant.orderedQuantity,
        cutQuantity: variant.cutQuantity,
        issueQuantity: variant.issueQuantity,
        outputQuantity: 0,
      }));
      setLineRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, purchaseId, poNumber, variants: mappedVariants, isLoadingVariants: false } : row)));
    } catch (error) {
      console.error(error);
      toast({
        title: 'Unable to load variant breakdown',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
      setLineRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, isLoadingVariants: false } : row)));
    }
  };

  const handleRowPurchaseChange = (rowId: string, purchaseId: string) => {
    const purchase = purchaseOptions.find((option) => option.id === purchaseId);
    loadVariantsForRow(rowId, purchase?.id, purchase?.poNumber);
  };

  const handleVariantOutputChange = (rowId: string, orderLineId: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) value = 0;
    setLineRows((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;

      const variants = row.variants.map((variant) => {
        if (variant.orderLineId !== orderLineId) return variant;
        const maxAllowed = variant.issueQuantity ?? variant.cutQuantity ?? variant.orderedQuantity ?? 0;
        const clampedValue = Math.min(value, maxAllowed);
        if (value > maxAllowed) {
          toast({
            title: 'Output exceeds issued quantity',
            description: `Variant ${variant.productName} can record at most ${maxAllowed.toLocaleString()} units.`,
            variant: 'destructive',
          });
        }
        return { ...variant, outputQuantity: clampedValue };
      });

      return { ...row, variants };
    }));
  };

  const handleAddRow = () => {
    setLineRows((prev) => [...prev, createLineRow()]);
  };

  const handleRemoveRow = (rowId: string) => {
    setLineRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== rowId)));
  };

  const preparedLines = useMemo(() => (
    lineRows.flatMap((row) =>
      row.variants
        .filter((variant) => variant.outputQuantity > 0)
        .map((variant) => ({
          purchaseId: row.purchaseId,
          poNumber: row.poNumber ?? '',
          orderLineId: variant.orderLineId,
          productName: variant.productName,
          orderedQuantity: variant.orderedQuantity,
          cutQuantity: variant.cutQuantity,
          issueQuantity: variant.issueQuantity,
          outputQuantity: variant.outputQuantity,
        }))
    )
  ), [lineRows]);

  const handleSave = async () => {
    if (!selectedSupplier) {
      toast({
        title: 'Supplier required',
        description: 'Select the supplier before recording sewing output.',
        variant: 'destructive',
      });
      return;
    }

    if (!preparedLines.length) {
      toast({
        title: 'Add sewing output quantities',
        description: 'Record at least one variant with an output quantity before saving.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSaving(true);
      const payload: CreateSewingOutputRecordInput = {
        supplierName: selectedSupplier,
        lineItems: preparedLines,
      };
      const record = await sewingOutputRecordService.createRecord(payload);
      toast({
        title: 'Sewing output recorded',
        description: `Output ID ${record.outputCode} created successfully.`,
      });
      onSave(record);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Failed to save sewing output',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderVariantTable = (row: LineRow) => {
    if (row.isLoadingVariants) {
      return (
        <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading variants…
        </div>
      );
    }

    if (!row.purchaseId) {
      return (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Select a purchase order to load variants.
        </div>
      );
    }

    if (row.variants.length === 0) {
      return (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No variants found for this purchase order.
        </div>
      );
    }

    return (
      <div className="mt-3 overflow-hidden rounded border">
        <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide">
          <div className="col-span-4">Variant</div>
          <div className="col-span-2 text-right">Ordered</div>
          <div className="col-span-2 text-right">Cut</div>
          <div className="col-span-2 text-right">Issued</div>
          <div className="col-span-2 text-right">Output</div>
        </div>
        <div className="max-h-52 overflow-y-auto divide-y">
          {row.variants.map((variant) => (
            <div key={variant.orderLineId} className="grid grid-cols-12 items-center px-3 py-2 text-xs">
              <div className="col-span-4 pr-2">
                <div className="font-medium text-foreground">{variant.productName}</div>
                <div className="text-muted-foreground">{variant.orderLineId}</div>
              </div>
              <div className="col-span-2 text-right">{variant.orderedQuantity.toLocaleString()}</div>
              <div className="col-span-2 text-right">{variant.cutQuantity.toLocaleString()}</div>
              <div className="col-span-2 text-right">{variant.issueQuantity.toLocaleString()}</div>
              <div className="col-span-2 text-right">
                <Input
                  type="number"
                  min={0}
                  max={variant.issueQuantity ?? variant.cutQuantity ?? variant.orderedQuantity ?? undefined}
                  step={1}
                  value={variant.outputQuantity || ''}
                  onChange={(event) => handleVariantOutputChange(row.id, variant.orderLineId, Number(event.target.value))}
                  className="h-8 text-right"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          resetForm();
        }
        onOpenChange(value);
      }}
    >
      <SheetContent className="w-[620px] sm:max-w-[660px] flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shirt className="h-5 w-5 text-primary" />
            Record Sewing Output
          </SheetTitle>
          <SheetDescription>
            Select the supplier, choose purchase orders, and enter sewing output variant by variant.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 flex-1 overflow-hidden">
          <div className="space-y-2">
            <Label htmlFor="sewing-supplier">Supplier</Label>
            <SearchableSelect
              options={supplierSelectOptions}
              value={selectedSupplier}
              onChange={handleSupplierChange}
              placeholder={isLoadingSuppliers ? 'Loading suppliers…' : 'Select supplier'}
              searchPlaceholder="Search suppliers..."
              disabled={isLoadingSuppliers}
              className="w-full"
            />
          </div>

          <div className="space-y-4 flex-1 overflow-hidden">
            <div className="flex items-center justify-between">
              <Label>Purchase Orders</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddRow} disabled={!selectedSupplier}>
                Add PO
              </Button>
            </div>
            <div className="border rounded-lg h-80 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="divide-y pb-20">
                  {lineRows.map((row, index) => {
                    const poValue = row.purchaseId || '';
                    return (
                      <div key={row.id} className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs uppercase text-muted-foreground">
                              Purchase Order {index + 1}
                            </Label>
                            <SearchableSelect
                              options={poSelectOptions}
                              value={poValue}
                              onChange={(value) => handleRowPurchaseChange(row.id, value)}
                              placeholder={isLoadingPurchases ? 'Loading POs…' : 'Select PO'}
                              searchPlaceholder="Search purchase orders..."
                              disabled={!selectedSupplier || isLoadingPurchases}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveRow(row.id)}
                            disabled={lineRows.length <= 1}
                            aria-label="Remove row"
                          >
                            ×
                          </Button>
                        </div>
                        {renderVariantTable(row)}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground flex items-center gap-2">
            <TriangleAlert className="h-4 w-4" />
            Total sewing output prepared: <span className="font-semibold text-foreground">{totalOutputQuantity.toLocaleString()}</span>
          </div>
        </div>

        <div className="space-y-3">
          <Separator />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving || !selectedSupplier}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
                </>
              ) : (
                'Save Sewing Output'
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

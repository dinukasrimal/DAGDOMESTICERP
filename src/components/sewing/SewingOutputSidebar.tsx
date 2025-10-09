import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Shirt } from 'lucide-react';
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

type LineRow = {
  id: string;
  purchaseId?: string;
  poNumber?: string;
  orderedQuantity: number;
  outputQuantity: number;
};

function createLineRow(): LineRow {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10),
    orderedQuantity: 0,
    outputQuantity: 0,
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

  const totalOutputQuantity = useMemo(() => lineRows.reduce((sum, row) => sum + (row.outputQuantity || 0), 0), [lineRows]);

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
      return;
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

  const handleRowPurchaseChange = (rowId: string, purchaseId: string) => {
    const purchase = purchaseOptions.find((option) => option.id === purchaseId);
    setLineRows((prev) => prev.map((row) => (
      row.id === rowId
        ? {
            ...row,
            purchaseId: purchase?.id,
            poNumber: purchase?.poNumber,
            orderedQuantity: purchase?.orderedQuantity ?? 0,
            outputQuantity: 0,
          }
        : row
    )));
  };

  const handleRowQuantityChange = (rowId: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) value = 0;
    setLineRows((prev) => prev.map((row) => (
      row.id === rowId
        ? { ...row, outputQuantity: value }
        : row
    )));
  };

  const handleAddRow = () => {
    setLineRows((prev) => [...prev, createLineRow()]);
  };

  const handleRemoveRow = (rowId: string) => {
    setLineRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== rowId)));
  };

  const handleSave = async () => {
    if (!selectedSupplier) {
      toast({
        title: 'Supplier required',
        description: 'Select the supplier before recording sewing output.',
        variant: 'destructive',
      });
      return;
    }

    const preparedLines = lineRows
      .filter((row) => row.poNumber && row.outputQuantity > 0)
      .map((row) => ({
        purchaseId: row.purchaseId,
        poNumber: row.poNumber!,
        outputQuantity: row.outputQuantity,
      }));

    if (!preparedLines.length) {
      toast({
        title: 'Add sewing output quantities',
        description: 'Record at least one PO with an output quantity before saving.',
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
      <SheetContent className="w-[560px] sm:max-w-[600px] flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shirt className="h-5 w-5 text-primary" />
            Record Sewing Output
          </SheetTitle>
          <SheetDescription>
            Select the supplier, add purchase orders, and record sewing output quantities.
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
                    const poOptions = poSelectOptions;
                    const orderedQtyLabel = row.orderedQuantity.toLocaleString();
                    return (
                      <div key={row.id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">PO #{index + 1}</Label>
                          {lineRows.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveRow(row.id)}
                              className="text-destructive"
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                        <div className="space-y-2">
                          <SearchableSelect
                            options={poOptions}
                            value={row.purchaseId ?? ''}
                            onChange={(value) => handleRowPurchaseChange(row.id, value)}
                            placeholder={selectedSupplier ? (isLoadingPurchases ? 'Loading purchase orders…' : 'Select purchase order') : 'Select a supplier first'}
                            searchPlaceholder="Search POs..."
                            disabled={!selectedSupplier || isLoadingPurchases}
                            className="w-full"
                          />
                          {row.poNumber && (
                            <p className="text-xs text-muted-foreground">
                              Ordered: {orderedQtyLabel}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`sewing-line-${row.id}`} className="text-xs text-muted-foreground">
                            Sewing output quantity
                          </Label>
                          <Input
                            id={`sewing-line-${row.id}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.outputQuantity ?? 0}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              handleRowQuantityChange(row.id, value);
                            }}
                            disabled={!row.poNumber}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            Total sewing output: <span className="font-semibold text-foreground">{totalOutputQuantity.toLocaleString()}</span>
          </div>
        </div>

        <Separator />

        <div className="flex justify-between gap-3">
          <Button variant="outline" onClick={resetForm} disabled={isSaving}>
            Clear
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !selectedSupplier}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
              </>
            ) : (
              'Save Sewing Output'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { markerRequestService, MarkerRequest } from '@/services/markerRequestService';
import { MarkerPurchaseOrder, MarkerPurchaseOrderLine } from '@/types/marker';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, ChevronsUpDown, Loader2, Plus, RefreshCw, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AggregatedLine {
  key: string;
  material: string;
  reference?: string | null;
  totalPending: number;
  unit: string;
  poBreakdown: Array<{ poNumber: string; pending: number }>;
}

const markerTypes: { value: 'body' | 'gusset'; label: string }[] = [
  { value: 'body', label: 'Body Marker' },
  { value: 'gusset', label: 'Gusset Marker' },
];

interface MarkerRequestFormProps {
  purchaseOrders: MarkerPurchaseOrder[];
  onRefreshPurchaseOrders: () => Promise<void> | void;
  onCreated: (markerRequest: MarkerRequest) => void;
  onClose: () => void;
}

export const MarkerRequestForm: React.FC<MarkerRequestFormProps> = ({
  purchaseOrders,
  onRefreshPurchaseOrders,
  onCreated,
  onClose,
}) => {
  const { toast } = useToast();
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingPOs, setIsRefreshingPOs] = useState(false);
  const [markerNumber, setMarkerNumber] = useState('');
  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([]);
  const [poSelectorOpen, setPoSelectorOpen] = useState(false);

  const [width, setWidth] = useState<string>('');
  const [layers, setLayers] = useState<string>('');
  const [efficiency, setEfficiency] = useState<string>('');
  const [markerType, setMarkerType] = useState<'body' | 'gusset'>('body');
  const [markerLengthYards, setMarkerLengthYards] = useState<string>('');
  const [markerLengthInches, setMarkerLengthInches] = useState<string>('');
  const [measurementType, setMeasurementType] = useState<'yard' | 'kg'>('yard');
  const [markerGsm, setMarkerGsm] = useState<string>('');

  const generateMarkerNumber = async () => {
    try {
      setIsGeneratingNumber(true);
      const generatedNumber = await markerRequestService.generateMarkerNumber();
      setMarkerNumber(generatedNumber);
    } catch (error: any) {
      toast({
        title: 'Failed to generate marker number',
        description: error?.message || 'Unable to generate a marker request number.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingNumber(false);
    }
  };

  useEffect(() => {
    generateMarkerNumber();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPurchaseOrders = useMemo(
    () => purchaseOrders.filter(po => selectedPoIds.includes(po.id)),
    [purchaseOrders, selectedPoIds]
  );

  const aggregatedLines: AggregatedLine[] = useMemo(() => {
    const map = new Map<string, AggregatedLine>();

    selectedPurchaseOrders.forEach(po => {
      const poNumber = po.po_number || 'PO';
      (po.order_lines || []).forEach((line: MarkerPurchaseOrderLine) => {
        const pending = (() => {
          if (typeof line.pending_qty === 'number' && !isNaN(line.pending_qty)) {
            return Math.max(0, line.pending_qty);
          }
          const qty = Number(line.product_qty || 0);
          const received = Number(line.qty_received || line.qty_delivered || line.qty_done || 0);
          return Math.max(0, qty - received);
        })();
        if (!pending) return;

        const materialName = line.product_name || `Product #${line.product_id || line.id}`;
        const reference = line.reference || null;
        const key = `${materialName}__${reference || ''}`;

        if (!map.has(key)) {
          map.set(key, {
            key,
            material: materialName,
            reference,
            totalPending: 0,
            unit: 'pcs',
            poBreakdown: [],
          });
        }

        const bucket = map.get(key)!;
        bucket.totalPending += pending;
        bucket.poBreakdown.push({ poNumber, pending });
      });
    });

    return Array.from(map.values()).sort((a, b) => a.material.localeCompare(b.material));
  }, [selectedPurchaseOrders]);

  const totalPendingPieces = useMemo(
    () => aggregatedLines.reduce((sum, line) => sum + line.totalPending, 0),
    [aggregatedLines]
  );

  const layersNumber = Number(layers) || 0;
  const widthMeters = Number(width) > 0 ? Number(width) * 0.0254 : 0;
  const markerLengthMeters = (() => {
    const yardsVal = Number(markerLengthYards) || 0;
    const inchesVal = Number(markerLengthInches) || 0;
    return yardsVal * 0.9144 + inchesVal * 0.0254;
  })();
  const markerLengthYardsTotal = (() => {
    const yardsVal = Number(markerLengthYards) || 0;
    const inchesVal = Number(markerLengthInches) || 0;
    return yardsVal + inchesVal / 36;
  })();
  const markerGsmValue = Number(markerGsm) || 0;

  const computedPiecesPerMarker = useMemo(() => {
    if (!layersNumber || layersNumber <= 0) return 0;
    if (!totalPendingPieces) return 0;
    return Number((totalPendingPieces / layersNumber).toFixed(2));
  }, [layersNumber, totalPendingPieces]);

  const totalFabricKg = useMemo(() => {
    if (measurementType !== 'kg') return 0;
    if (!widthMeters || !markerLengthMeters || !layersNumber || !markerGsmValue) return 0;
    const areaSqM = widthMeters * markerLengthMeters * layersNumber;
    const grams = areaSqM * markerGsmValue;
    return Number((grams / 1000).toFixed(3));
  }, [measurementType, widthMeters, markerLengthMeters, layersNumber, markerGsmValue]);

  const totalFabricYards = useMemo(() => {
    if (measurementType !== 'yard') return 0;
    if (!markerLengthYardsTotal || !layersNumber) return 0;
    return Number((markerLengthYardsTotal * layersNumber).toFixed(3));
  }, [measurementType, markerLengthYardsTotal, layersNumber]);

  const handleTogglePo = (id: string) => {
    setSelectedPoIds(prev =>
      prev.includes(id) ? prev.filter(poId => poId !== id) : [...prev, id]
    );
  };

  const resetForm = async () => {
    setSelectedPoIds([]);
    setWidth('');
    setLayers('');
    setEfficiency('');
    setMarkerType('body');
    setMarkerLengthYards('');
    setMarkerLengthInches('');
    setMarkerGsm('');
    setMeasurementType('yard');
    await generateMarkerNumber();
  };

  const handleSubmit = async () => {
    if (!markerNumber) {
      toast({ title: 'Missing marker number', variant: 'destructive' });
      return;
    }
    if (!selectedPoIds.length) {
      toast({ title: 'Select purchase orders', description: 'Choose at least one purchase order for this marker.', variant: 'destructive' });
      return;
    }
    if (!layersNumber || layersNumber <= 0) {
      toast({ title: 'Invalid layer count', description: 'Number of layers must be greater than zero.', variant: 'destructive' });
      return;
    }
    if (!totalPendingPieces) {
      toast({ title: 'No pending pieces', description: 'Selected purchase orders do not have pending quantities to cut.', variant: 'destructive' });
      return;
    }

    if (measurementType === 'kg') {
      if (markerGsmValue <= 0) {
        toast({ title: 'GSM required', description: 'Enter a GSM value for KG marker requests.', variant: 'destructive' });
        return;
      }
      if (!widthMeters || !markerLengthMeters || totalFabricKg <= 0) {
        toast({ title: 'Invalid dimensions', description: 'Provide width and marker length to calculate KG requirement.', variant: 'destructive' });
        return;
      }
    }
    if (measurementType === 'yard' && (markerLengthYardsTotal <= 0 || totalFabricYards <= 0)) {
      toast({ title: 'Marker length required', description: 'Provide the marker length for yard-based requests.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        marker_number: markerNumber,
        marker_type: markerType,
        width: Number(width) || 0,
        layers: layersNumber,
        efficiency: Number(efficiency) || 0,
        pieces_per_marker: computedPiecesPerMarker,
        marker_length_yards: Number(markerLengthYards) || 0,
        marker_length_inches: Number(markerLengthInches) || 0,
        measurement_type: measurementType,
        marker_gsm: measurementType === 'kg' ? markerGsmValue : null,
        total_fabric_yards: measurementType === 'yard' ? totalFabricYards : null,
        total_fabric_kg: measurementType === 'kg' ? totalFabricKg : null,
        po_ids: selectedPoIds,
        details: {
          total_pending_pieces: totalPendingPieces,
          aggregated_lines: aggregatedLines,
          efficiency: Number(efficiency) || 0,
          marker_length_yards: Number(markerLengthYards) || 0,
          marker_length_inches: Number(markerLengthInches) || 0,
          measurement_type: measurementType,
          marker_gsm: measurementType === 'kg' ? markerGsmValue : undefined,
          total_fabric_yards: measurementType === 'yard' ? totalFabricYards : undefined,
          total_fabric_kg: measurementType === 'kg' ? totalFabricKg : undefined,
        },
      };

      const result = await markerRequestService.createMarkerRequest(payload);
      await onRefreshPurchaseOrders();
      toast({
        title: 'Marker Request Created',
        description: `Marker ${result.marker_number} saved successfully.`,
      });
      onCreated(result);
      await resetForm();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Failed to create marker request',
        description: error?.message || 'Please check the details and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSummary = selectedPoIds
    .map(id => purchaseOrders.find(po => po.id === id)?.po_number)
    .filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Scissors className="h-5 w-5 text-red-500" />
              <span>Create Marker Request</span>
            </CardTitle>
            <CardDescription>
              Generate a marker request by selecting relevant purchase orders and marker parameters.
            </CardDescription>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Label htmlFor="marker-number" className="text-sm font-medium">Marker No.</Label>
              <Input
                id="marker-number"
                value={markerNumber}
                onChange={e => setMarkerNumber(e.target.value.toUpperCase())}
                className="w-48"
              />
            </div>
            <Button variant="outline" onClick={generateMarkerNumber} disabled={isGeneratingNumber || isSubmitting}>
              <RefreshCw className={cn('h-4 w-4 mr-2', isGeneratingNumber && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Purchase Orders</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      setIsRefreshingPOs(true);
                      await onRefreshPurchaseOrders();
                      toast({ title: 'Purchase orders refreshed' });
                    } catch (error: any) {
                      toast({
                        title: 'Failed to refresh purchase orders',
                        description: error?.message || 'Unable to refresh purchase orders.',
                        variant: 'destructive',
                      });
                    } finally {
                      setIsRefreshingPOs(false);
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <RefreshCw className={cn('h-4 w-4 mr-1', isRefreshingPOs && 'animate-spin')} />
                  Refresh
                </Button>
              </div>
              <Popover open={poSelectorOpen} onOpenChange={setPoSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn('w-full justify-between', selectedPoIds.length && 'bg-slate-50')}
                    disabled={isSubmitting}
                  >
                    <span className="truncate">
                      {selectedPoIds.length
                        ? `${selectedPoIds.length} PO${selectedPoIds.length > 1 ? 's' : ''} selected`
                        : 'Select purchase orders'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search purchase orders..." />
                    <CommandList>
                      <CommandEmpty>No purchase orders found.</CommandEmpty>
                      <CommandGroup>
                        {purchaseOrders.map(po => {
                          const selected = selectedPoIds.includes(po.id);
                          const pendingCount = (po.order_lines || []).reduce((sum, line) => {
                            const qty = Number(line.product_qty || 0);
                            const received = Number(line.qty_received || line.qty_delivered || line.qty_done || 0);
                            const linePending = typeof line.pending_qty === 'number' ? line.pending_qty : qty - received;
                            return sum + Math.max(0, linePending || 0);
                          }, 0);
                          return (
                            <CommandItem
                              key={po.id}
                              value={po.po_number}
                              onSelect={() => handleTogglePo(po.id)}
                              className="flex items-start"
                            >
                              <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
                              <div className="flex flex-col">
                                <span className="font-medium">{po.po_number || 'PO'}</span>
                                <span className="text-xs text-muted-foreground">
                                  {po.partner_name || 'Unknown supplier'} • Pending qty: {pendingCount}
                                </span>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedSummary.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedSummary.map(poNumber => (
                    <Badge key={poNumber} variant="secondary">{poNumber}</Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>Measurement Mode</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { value: 'yard' as const, label: 'Yard Request' },
                      { value: 'kg' as const, label: 'KG Request' },
                    ].map(option => (
                      <Button
                        key={option.value}
                        type="button"
                        variant={measurementType === option.value ? 'default' : 'outline'}
                        onClick={() => {
                          setMeasurementType(option.value);
                          if (option.value === 'yard') {
                            setMarkerGsm('');
                          }
                        }}
                        className="w-full"
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marker-type">Marker Type</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {markerTypes.map(type => (
                      <Button
                        key={type.value}
                        type="button"
                        variant={markerType === type.value ? 'default' : 'outline'}
                        onClick={() => setMarkerType(type.value)}
                        className="w-full"
                      >
                        {type.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="width">End-to-end Width (inches)</Label>
                  <Input
                    id="width"
                    type="number"
                    min="0"
                    step="0.1"
                    value={width}
                    onChange={e => setWidth(e.target.value)}
                    placeholder="e.g. 60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Marker Length</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={markerLengthYards}
                      onChange={e => setMarkerLengthYards(e.target.value)}
                      placeholder="Yards"
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={markerLengthInches}
                      onChange={e => setMarkerLengthInches(e.target.value)}
                      placeholder="Inches"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="layers">Number of Layers</Label>
                  <Input
                    id="layers"
                    type="number"
                    min="1"
                    step="1"
                    value={layers}
                    onChange={e => setLayers(e.target.value)}
                    placeholder="e.g. 90"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="efficiency">Marker Efficiency (%)</Label>
                  <Input
                    id="efficiency"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={efficiency}
                    onChange={e => setEfficiency(e.target.value)}
                    placeholder="e.g. 78"
                  />
                </div>
                {measurementType === 'kg' && (
                  <div className="space-y-2">
                    <Label htmlFor="marker-gsm">Marker GSM</Label>
                    <Input
                      id="marker-gsm"
                      type="number"
                      min="0"
                      step="1"
                      value={markerGsm}
                      onChange={e => setMarkerGsm(e.target.value)}
                      placeholder="e.g. 180"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Pending Pieces</p>
              <p className="text-2xl font-semibold">{totalPendingPieces.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Layers</p>
              <p className="text-2xl font-semibold">{layersNumber || '—'}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Marker Length</p>
              <p className="text-2xl font-semibold">
                {(Number(markerLengthYards) || 0).toLocaleString()} yd {Number(markerLengthInches) || 0} in
              </p>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Pieces per Marker</p>
              <p className="text-2xl font-semibold">{computedPiecesPerMarker || '—'}</p>
            </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Material Breakdown</CardTitle>
          <CardDescription>Pending quantities grouped by material and size reference across selected purchase orders.</CardDescription>
        </CardHeader>
        <CardContent>
          {aggregatedLines.length === 0 ? (
            <div className="text-sm text-muted-foreground">Select purchase orders to view pending quantities for the marker.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Pending Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>PO Breakdown</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedLines.map(line => (
                    <TableRow key={line.key}>
                      <TableCell className="font-medium">{line.material}</TableCell>
                      <TableCell>{line.reference || '—'}</TableCell>
                      <TableCell className="text-right">{line.totalPending.toLocaleString()}</TableCell>
                      <TableCell>{line.unit}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {line.poBreakdown.map(entry => (
                            <Badge key={`${line.key}-${entry.poNumber}`} variant="outline" className="text-xs">
                              {entry.poNumber}: {entry.pending}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end space-x-3">
        <Button
          variant="outline"
          onClick={async () => {
            await resetForm();
            onClose();
          }}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting || isGeneratingNumber}>
          {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Create Marker Request
        </Button>
      </div>
    </div>
  );
};

export default MarkerRequestForm;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { markerRequestService, MarkerRequest } from '@/services/markerRequestService';
import {
  FabricUsageOption,
  MarkerFabricAssignment,
  MarkerPurchaseOrder,
  MarkerPurchaseOrderLine,
} from '@/types/marker';
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
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  RefreshCw,
  Scissors,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

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

type MarkerFabricUsage = Extract<FabricUsageOption, 'body' | 'gusset_1'>;

const FABRIC_USAGE_LABELS: Record<MarkerFabricUsage, string> = {
  body: 'Body',
  gusset_1: 'Gusset 1',
};

interface FabricUsageOptionItem {
  key: string;
  usage: MarkerFabricUsage;
  bomId: string;
  bomName: string;
  rawMaterialId?: number | null;
  rawMaterialName?: string | null;
  productId?: number | null;
  productName?: string | null;
  poId: string;
  poNumber: string;
}

interface MarkerRequestFormProps {
  purchaseOrders: MarkerPurchaseOrder[];
  usedFabricAssignments: MarkerFabricAssignment[];
  onRefreshPurchaseOrders: () => Promise<void> | void;
  onCreated: (markerRequest: MarkerRequest) => void;
  onClose: () => void;
}

export const MarkerRequestForm: React.FC<MarkerRequestFormProps> = ({
  purchaseOrders,
  usedFabricAssignments,
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
  const [fabricOptionsLoading, setFabricOptionsLoading] = useState(false);
  const [fabricOptions, setFabricOptions] = useState<FabricUsageOptionItem[]>([]);
  const [selectedFabricOption, setSelectedFabricOption] = useState<FabricUsageOptionItem | null>(null);
  const [fabricAssignmentError, setFabricAssignmentError] = useState<string | null>(null);
  const selectedFabricOptionRef = useRef<FabricUsageOptionItem | null>(null);

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

  const usedFabricSet = useMemo(() => {
    const set = new Set<string>();
    usedFabricAssignments.forEach(assignment => {
      set.add(`${assignment.bom_id}__${assignment.fabric_usage}`);
    });
    return set;
  }, [usedFabricAssignments]);

  useEffect(() => {
    selectedFabricOptionRef.current = selectedFabricOption;
  }, [selectedFabricOption]);

  const isSupportedUsage = (usage: FabricUsageOption | null): usage is MarkerFabricUsage =>
    usage === 'body' || usage === 'gusset_1';

  useEffect(() => {
    if (selectedFabricOption) {
      setMarkerType(selectedFabricOption.usage === 'body' ? 'body' : 'gusset');
    }
  }, [selectedFabricOption]);

  const loadFabricUsageOptions = useCallback(async () => {
    if (!selectedPurchaseOrders.length) {
      setFabricOptionsLoading(false);
      setFabricOptions([]);
      setSelectedFabricOption(null);
      setFabricAssignmentError(null);
      return;
    }

    type MaterialContext = {
      poId: string;
      poNumber: string;
      productId: number | null;
      productName: string;
      productNameUpper: string;
      productCode?: string | null;
      productCodeUpper?: string | null;
      fullProductName: string;
      fullProductNameUpper: string;
    };

    const contexts: MaterialContext[] = [];
    const contextsByProductId = new Map<number, MaterialContext[]>();
    const contextsByName = new Map<string, MaterialContext[]>();

    const normalizeName = (value: string | null | undefined) => value?.trim().toUpperCase() || '';

    const rebuildProductContextMap = () => {
      contextsByProductId.clear();
      contexts.forEach(ctx => {
        if (ctx.productId != null) {
          const list = contextsByProductId.get(ctx.productId) ?? [];
          list.push(ctx);
          contextsByProductId.set(ctx.productId, list);
        }
      });
    };

    const parseProductName = (name?: string | null) => {
      if (!name) return { displayName: null as string | null, bracketCode: null as string | null };
      const trimmed = name.trim();
      if (!trimmed) return { displayName: null, bracketCode: null };
      const bracketMatch = trimmed.match(/^\[(.+?)\]\s*(.*)$/);
      if (bracketMatch) {
        const [, code, rest] = bracketMatch;
        return {
          displayName: rest?.trim() || null,
          bracketCode: code?.trim() || null,
        };
      }
      return { displayName: trimmed, bracketCode: null };
    };

    const registerContext = (context: MaterialContext) => {
      contexts.push(context);
      if (context.productId != null) {
        const list = contextsByProductId.get(context.productId) ?? [];
        list.push(context);
        contextsByProductId.set(context.productId, list);
      }
      if (context.productNameUpper) {
        const list = contextsByName.get(context.productNameUpper) ?? [];
        list.push(context);
        contextsByName.set(context.productNameUpper, list);
      }
      if (context.fullProductNameUpper && context.fullProductNameUpper !== context.productNameUpper) {
        const list = contextsByName.get(context.fullProductNameUpper) ?? [];
        list.push(context);
        contextsByName.set(context.fullProductNameUpper, list);
      }
    };

    selectedPurchaseOrders.forEach(po => {
      const poId = String(po.id);
      const poNumber = po.po_number || poId;

      (po.order_lines || []).forEach(line => {
        const productIdRaw = Number(line.product_id);
        const productId = Number.isFinite(productIdRaw) ? productIdRaw : null;
        const rawName = line.product_name || (productId ? `Product ${productId}` : 'Product');
        const { displayName, bracketCode } = parseProductName(rawName);
        const primaryName = displayName || rawName;
        const productNameUpper = normalizeName(primaryName);
        const productCodeUpper = bracketCode ? normalizeName(bracketCode) : '';
        const fullProductNameUpper = normalizeName(rawName);

        const context: MaterialContext = {
          poId,
          poNumber,
          productId,
          productName: primaryName,
          productNameUpper,
          productCode: bracketCode,
          productCodeUpper: productCodeUpper || null,
          fullProductName: rawName,
          fullProductNameUpper,
        };

        registerContext(context);

        if (context.productCodeUpper && context.productCodeUpper !== productNameUpper) {
          const list = contextsByName.get(context.productCodeUpper) ?? [];
          if (!list.some(item => item.poId === context.poId && item.productNameUpper === context.productNameUpper)) {
            list.push(context);
          }
          contextsByName.set(context.productCodeUpper, list);
        }
      });
    });

    if (!contexts.length) {
      setFabricOptionsLoading(false);
      setFabricOptions([]);
      setSelectedFabricOption(null);
      setFabricAssignmentError('No products were found in the selected purchase orders.');
      return;
    }

    setFabricOptionsLoading(true);
    setFabricAssignmentError(null);

    try {
      const missingContexts = contexts.filter(ctx => ctx.productId == null);

      if (missingContexts.length) {
        const codeValues = Array.from(
          new Set(missingContexts.map(ctx => ctx.productCode).filter((value): value is string => Boolean(value)))
        );
        const nameValues = Array.from(
          new Set(missingContexts.map(ctx => ctx.productName).filter((value): value is string => Boolean(value)))
        );

        const codeIdMap = new Map<string, number>();
        const nameIdMap = new Map<string, number>();

        if (codeValues.length) {
          const { data: productsByCode, error: codeError } = await supabase
            .from('products')
            .select('id, default_code')
            .in('default_code', codeValues);

          if (codeError) {
            console.error('Failed to load products by default code for marker request context', codeError);
          } else {
            (productsByCode || []).forEach(product => {
              if (product?.default_code != null && product?.id != null) {
                codeIdMap.set(normalizeName(product.default_code), Number(product.id));
              }
            });
          }
        }

        if (nameValues.length) {
          const { data: productsByName, error: nameError } = await supabase
            .from('products')
            .select('id, name')
            .in('name', nameValues);

          if (nameError) {
            console.error('Failed to load products by name for marker request context', nameError);
          } else {
            (productsByName || []).forEach(product => {
              if (product?.name != null && product?.id != null) {
                nameIdMap.set(normalizeName(product.name), Number(product.id));
              }
            });
          }
        }

        if (codeIdMap.size || nameIdMap.size) {
          missingContexts.forEach(ctx => {
            if (ctx.productId != null) return;
            if (ctx.productCodeUpper && codeIdMap.has(ctx.productCodeUpper)) {
              ctx.productId = codeIdMap.get(ctx.productCodeUpper) ?? null;
            }
            if (ctx.productId == null && ctx.productNameUpper && nameIdMap.has(ctx.productNameUpper)) {
              ctx.productId = nameIdMap.get(ctx.productNameUpper) ?? null;
            }
          });

          rebuildProductContextMap();
        }
      }

      const uniqueProductIds = Array.from(contextsByProductId.keys());
      const baseProductNames = Array.from(
        new Set(
          contexts
            .flatMap(ctx => [ctx.productName, ctx.fullProductName])
            .filter((value): value is string => Boolean(value))
            .map(name => name.trim())
        )
      );

      const stripSizeSuffix = (value: string) => value.replace(/\s*([-/]?\d+[A-Z]*)$/i, '').trim();
      const baseNameRoots = Array.from(
        new Set(
          baseProductNames
            .map(name => stripSizeSuffix(name))
            .filter(Boolean)
        )
      );

      const productCodeRoots = Array.from(
        new Set(
          contexts
            .map(ctx => ctx.productCode || ctx.productCodeUpper || '')
            .filter((value): value is string => Boolean(value))
        )
      );

      const allNameRoots = Array.from(new Set([...baseNameRoots, ...productCodeRoots]));

      const bomSelect = `
        id,
        name,
        product_id,
        bom_lines(
          id,
          fabric_usage,
          notes
        )
      `;

      const fetchByProductIds = async () => {
        if (!uniqueProductIds.length) return { data: [] as any[], error: null as any };
        return supabase
          .from('bom_headers')
          .select(bomSelect)
          .eq('active', true)
          .in('product_id', uniqueProductIds);
      };

      const fetchByNames = async () => {
        if (!baseProductNames.length) return { data: [] as any[], error: null as any };
        return supabase
          .from('bom_headers')
          .select(bomSelect)
          .eq('active', true)
          .in('name', baseProductNames);
      };

      const escapeIlikeValue = (value: string) =>
        value.replace(/%/g, '\\%').replace(/,/g, '\\,').replace(/'/g, "''");

      const fetchByRootNames = async () => {
        if (!allNameRoots.length) return { data: [] as any[], error: null as any };
        const orFilters = allNameRoots
          .map(root => root && `name.ilike.%${escapeIlikeValue(root)}%`)
          .filter(Boolean)
          .join(',');
        if (!orFilters) return { data: [] as any[], error: null as any };
        return supabase
          .from('bom_headers')
          .select(bomSelect)
          .eq('active', true)
          .or(orFilters)
          .limit(200);
      };

      let bomData: any[] = [];
      let bomError: any = null;

      const { data: byIdData, error: byIdError } = await fetchByProductIds();
      if (byIdError) {
        bomError = byIdError;
      } else if (Array.isArray(byIdData) && byIdData.length) {
        bomData = byIdData;
      }

      if (!bomData.length && !bomError) {
        const { data: byNameData, error: byNameError } = await fetchByNames();
        if (byNameError) {
          bomError = byNameError;
        } else if (Array.isArray(byNameData) && byNameData.length) {
          bomData = byNameData;
        }
      }

      if (!bomData.length && !bomError) {
        const { data: byRootData, error: byRootError } = await fetchByRootNames();
        if (byRootError) {
          bomError = byRootError;
        } else if (Array.isArray(byRootData) && byRootData.length) {
          bomData = byRootData;
        }
      }

      if (!bomData.length && !bomError) {
        const noteKeys = Array.from(contextsByName.keys())
          .map(key => key.trim())
          .filter(Boolean);
        const noteFilters = Array.from(new Set(noteKeys))
          .map(key => `notes.ilike.%${escapeIlikeValue(key)}%`)
          .filter(Boolean)
          .join(',');

        if (noteFilters) {
          const { data: bomLinesByNotes, error: notesError } = await supabase
            .from('bom_lines')
            .select(
              `
                id,
                fabric_usage,
                notes,
                bom_header:bom_headers!inner (
                  id,
                  name,
                  product_id,
                  active
                )
              `
            )
            .in('fabric_usage', ['body', 'gusset_1'])
            .or(noteFilters)
            .limit(200);

          if (notesError) {
            bomError = notesError;
          } else if (Array.isArray(bomLinesByNotes) && bomLinesByNotes.length) {
            const grouped = new Map<string, any>();
            bomLinesByNotes.forEach(line => {
              const header = line.bom_header;
              if (!header?.id || header.active === false) return;
              const existing = grouped.get(header.id) || {
                id: header.id,
                name: header.name,
                product_id: header.product_id,
                bom_lines: [],
              };
              existing.bom_lines.push({
                id: line.id,
                fabric_usage: line.fabric_usage,
                notes: line.notes,
              });
              grouped.set(header.id, existing);
            });

            bomData = Array.from(grouped.values());
          }
        }
      }

      if (bomError) throw bomError;

      const optionMap = new Map<string, FabricUsageOptionItem>();

      const extractNamesFromNotes = (notes?: string | null) => {
        if (!notes) return [] as string[];
        const marker = 'Variant consumptions:';
        const idx = notes.indexOf(marker);
        if (idx === -1) return [];
        const section = notes.slice(idx + marker.length).trim();
        if (!section) return [];
        return section
          .split(';')
          .map(part => part.trim())
          .map(entry => entry.split(':')[0].trim())
          .filter(Boolean)
          .map(name => normalizeName(name));
      };

      (bomData || []).forEach((bom: any) => {
        if (!bom?.id) return;

        const bomContexts = contextsByProductId.get(Number(bom.product_id)) || [];

        (bom.bom_lines || []).forEach((line: any) => {
          const usage = line?.fabric_usage as FabricUsageOption | null;
          if (!isSupportedUsage(usage)) return;
          if (usedFabricSet.has(`${bom.id}__${usage}`)) return;

          let contextsForLine = bomContexts;
          if (!contextsForLine.length) {
            const namesInNotes = extractNamesFromNotes(line?.notes);
            if (namesInNotes.length) {
              const matchedContexts = namesInNotes.flatMap(nameKey => contextsByName.get(nameKey) || []);
              contextsForLine = matchedContexts;
            }
          }

          if (!contextsForLine.length) return;

          contextsForLine.forEach(ctx => {
            const key = `${bom.id}__${usage}__${ctx.poId}`;
            if (optionMap.has(key)) return;
            optionMap.set(key, {
              key,
              usage,
              bomId: bom.id as string,
              bomName: bom.name || 'Unnamed BOM',
              rawMaterialId: undefined,
              rawMaterialName: undefined,
              productId: ctx.productId,
              productName: ctx.productName,
              poId: ctx.poId,
              poNumber: ctx.poNumber,
            });
          });
        });
      });

      const optionList = Array.from(optionMap.values()).sort((a, b) => {
        const nameCompare = a.bomName.localeCompare(b.bomName);
        if (nameCompare !== 0) return nameCompare;
        return FABRIC_USAGE_LABELS[a.usage].localeCompare(FABRIC_USAGE_LABELS[b.usage]);
      });

      setFabricOptions(optionList);
      if (!optionList.length) {
        setSelectedFabricOption(null);
        setFabricAssignmentError(
          'No matching BOM fabric usage options were found for the selected purchase orders.'
        );
      } else {
        const previousSelection = selectedFabricOptionRef.current;
        if (previousSelection) {
          const stillValid = optionList.find(option => option.key === previousSelection.key);
          setSelectedFabricOption(stillValid || optionList[0] || null);
        } else {
          setSelectedFabricOption(optionList[0]);
        }
      }
    } catch (error: any) {
      console.error('Failed to load fabric usage options', error);
      setFabricOptions([]);
      setSelectedFabricOption(null);
      setFabricAssignmentError(error?.message || 'Failed to load fabric usage options.');
    } finally {
      setFabricOptionsLoading(false);
    }
  }, [selectedPurchaseOrders, usedFabricSet]);

  useEffect(() => {
    loadFabricUsageOptions();
  }, [loadFabricUsageOptions]);

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
    setFabricOptions([]);
    setSelectedFabricOption(null);
    setFabricAssignmentError(null);
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

    if (!fabricAssignmentError && fabricOptions.length > 0 && !selectedFabricOption) {
      toast({
        title: 'Select fabric usage',
        description: 'Choose which BOM fabric usage this marker request will cover.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const fabricAssignment = selectedFabricOption
        ? {
            bom_id: selectedFabricOption.bomId,
            bom_name: selectedFabricOption.bomName,
            fabric_usage: selectedFabricOption.usage,
            raw_material_id: selectedFabricOption.rawMaterialId,
            raw_material_name: selectedFabricOption.rawMaterialName ?? null,
            product_id: selectedFabricOption.productId,
            product_name: selectedFabricOption.productName,
            po_id: selectedFabricOption.poId,
            po_number: selectedFabricOption.poNumber,
          }
        : null;

      const payload = {
        marker_number: markerNumber,
        marker_type: fabricAssignment
          ? (fabricAssignment.fabric_usage === 'body' ? 'body' : 'gusset')
          : markerType,
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
        fabric_assignment: fabricAssignment,
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
          fabric_assignment: fabricAssignment || undefined,
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

  const lockedMarkerType = selectedFabricOption
    ? selectedFabricOption.usage === 'body'
      ? 'body'
      : 'gusset'
    : null;

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

              {(fabricOptionsLoading || fabricOptions.length > 0 || fabricAssignmentError) && (
                <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50/40 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-semibold text-orange-900">Fabric Usage Assignment</Label>
                      <p className="text-xs text-orange-700">
                        Select which BOM fabric this marker request will consume.
                      </p>
                    </div>
                    {fabricOptionsLoading && <Loader2 className="h-4 w-4 animate-spin text-orange-600" />}
                  </div>

                  {fabricAssignmentError ? (
                    <Alert className="bg-white">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm text-orange-900">
                        {fabricAssignmentError}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Select
                      value={selectedFabricOption?.key}
                      onValueChange={value => {
                        const option = fabricOptions.find(opt => opt.key === value) || null;
                        setSelectedFabricOption(option);
                      }}
                      disabled={fabricOptionsLoading || !fabricOptions.length}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select fabric usage" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {fabricOptions.map(option => (
                          <SelectItem key={option.key} value={option.key}>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">
                                {FABRIC_USAGE_LABELS[option.usage]} • {option.bomName}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {option.productName || 'Product'} • PO {option.poNumber}
                              </span>
                              {option.rawMaterialName && (
                                <span className="text-xs text-muted-foreground">
                                  Fabric: {option.rawMaterialName}
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {selectedFabricOption && !fabricAssignmentError && (
                    <div className="flex flex-wrap gap-2 text-xs text-orange-900">
                      <Badge variant="outline" className="border-orange-300 text-orange-900">
                        {FABRIC_USAGE_LABELS[selectedFabricOption.usage]}
                      </Badge>
                      <Badge variant="outline" className="border-orange-300 text-orange-900">
                        {selectedFabricOption.bomName}
                      </Badge>
                      {selectedFabricOption.productName && (
                        <Badge variant="outline" className="border-orange-300 text-orange-900">
                          {selectedFabricOption.productName}
                        </Badge>
                      )}
                      {selectedFabricOption.rawMaterialName && (
                        <Badge variant="outline" className="border-orange-300 text-orange-900">
                          {selectedFabricOption.rawMaterialName}
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-orange-300 text-orange-900">
                        PO {selectedFabricOption.poNumber}
                      </Badge>
                    </div>
                  )}
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
                    {markerTypes.map(type => {
                      const disabled =
                        isSubmitting ||
                        (lockedMarkerType !== null && lockedMarkerType !== type.value);
                      return (
                        <Button
                          key={type.value}
                          type="button"
                          variant={markerType === type.value ? 'default' : 'outline'}
                          onClick={() => {
                            if (lockedMarkerType !== null) return;
                            setMarkerType(type.value);
                          }}
                          disabled={disabled}
                          className="w-full"
                        >
                          {type.label}
                        </Button>
                      );
                    })}
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

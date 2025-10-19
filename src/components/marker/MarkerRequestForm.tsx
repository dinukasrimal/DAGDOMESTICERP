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
import { parseVariantConsumptionsFromNotes } from '@/utils/variantConsumptions';

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

type MarkerFabricUsage = 'body' | 'gusset_1';

const FABRIC_USAGE_LABELS: Record<MarkerFabricUsage, string> = {
  body: 'Body',
  gusset_1: 'Gusset',
};

type FabricRequirementSource = 'variant_notes' | 'bom_default';

const REQUIREMENT_SOURCE_LABELS: Record<FabricRequirementSource, string> = {
  variant_notes: 'Variant-specific consumption',
  bom_default: 'Default BOM consumption',
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
  pendingPieces?: number | null;
  matchedVariantKey?: string | null;
  consumptionPerPiece?: number | null;
  consumptionUnit?: string | null;
  wastePercentage?: number | null;
  totalRequirement?: number | null;
  baseRequirement?: number | null;
  requirementSource?: FabricRequirementSource | null;
  bomLineQuantity?: number | null;
  bomLineUnit?: string | null;
  bomLineWaste?: number | null;
  bomLineNotes?: string | null;
}

interface MarkerRequestFormProps {
  purchaseOrders: MarkerPurchaseOrder[];
  usedFabricAssignments: MarkerFabricAssignment[];
  onRefreshPurchaseOrders: () => Promise<void> | void;
  onCreated: (markerRequest: MarkerRequest) => void;
  onClose: () => void;
  mode?: 'create' | 'edit';
  initialRequest?: MarkerRequest | null;
  onUpdated?: (markerRequest: MarkerRequest) => void;
}

export const MarkerRequestForm: React.FC<MarkerRequestFormProps> = ({
  purchaseOrders,
  usedFabricAssignments,
  onRefreshPurchaseOrders,
  onCreated,
  onClose,
  mode = 'create',
  initialRequest = null,
  onUpdated,
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
  const [fabricOptionsByPo, setFabricOptionsByPo] = useState<Record<string, FabricUsageOptionItem[]>>({});
  const [selectedFabricAssignments, setSelectedFabricAssignments] = useState<Record<string, FabricUsageOptionItem | null>>({});
  const [fabricAssignmentError, setFabricAssignmentError] = useState<string | null>(null);
  const previousFabricAssignmentsRef = useRef<Record<string, FabricUsageOptionItem | null>>({});
  const [fabricUnitLock, setFabricUnitLock] = useState<'yard' | 'kg' | null>(null);

  const formatQuantity = useCallback((value: number | null | undefined, decimals = 3) => {
    if (value == null || Number.isNaN(value)) return '-';
    return value.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0,
    });
  }, []);

  const formatPercentage = useCallback((value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return '-';
    return `${value.toFixed(1)}%`;
  }, []);

  const handleFabricAssignmentChange = useCallback(
    (poId: string, optionKey: string | null) => {
      setSelectedFabricAssignments(prev => {
        const options = fabricOptionsByPo[poId] ?? [];
        const updatedAssignment = optionKey ? options.find(option => option.key === optionKey) || null : null;
        const next = { ...prev, [poId]: updatedAssignment };
        previousFabricAssignmentsRef.current = next;
        return next;
      });
    },
    [fabricOptionsByPo]
  );

  const computeFabricDetail = useCallback(
    (option: FabricUsageOptionItem) => {
      const pendingPieces = option.pendingPieces ?? null;
      let consumptionPerPiece = option.consumptionPerPiece ?? null;
      const consumptionUnit =
        option.consumptionUnit || option.bomLineUnit || (measurementType === 'kg' ? 'kg' : 'yard');
      const wastePercentage = option.wastePercentage ?? option.bomLineWaste ?? null;
      const baseRequirement = (() => {
        if (option.baseRequirement != null) return option.baseRequirement;
        if (pendingPieces != null) {
          const sourceConsumption = consumptionPerPiece ?? option.bomLineQuantity ?? null;
          if (sourceConsumption != null) {
            return sourceConsumption * pendingPieces;
          }
        }
        return null;
      })();

      if (baseRequirement != null && pendingPieces != null && pendingPieces > 0) {
        consumptionPerPiece = baseRequirement / pendingPieces;
      } else if (consumptionPerPiece == null) {
        consumptionPerPiece = option.bomLineQuantity ?? null;
      }

      const totalRequirement =
        option.totalRequirement ??
        (baseRequirement != null
          ? baseRequirement * (wastePercentage != null ? 1 + wastePercentage / 100 : 1)
          : null);

      const requirementSource =
        option.requirementSource ??
        (option.matchedVariantKey
          ? 'variant_notes'
          : option.bomLineQuantity != null
          ? 'bom_default'
          : null);

      return {
        pendingPieces,
        consumptionPerPiece,
        consumptionUnit,
        wastePercentage,
        baseRequirement,
        totalRequirement,
        requirementSource,
        variantLabel: option.matchedVariantKey,
        bomNotes: option.bomLineNotes,
      } as const;
    },
    [measurementType]
  );

  const fabricRequirementSummary = useMemo(() => {
    const entries = selectedPoIds
      .map(poId => {
        const option = selectedFabricAssignments[String(poId)];
        if (!option) return null;
        const detail = computeFabricDetail(option);
        return {
          poId: String(poId),
          poNumber: option.poNumber,
          bomName: option.bomName,
          usage: option.usage,
          option,
          detail,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (!entries.length) {
      return {
        entries,
        entryMap: new Map<string, typeof entries[number]>(),
        aggregate: null as {
          pendingPieces: number;
          baseRequirement: number | null;
          totalRequirement: number | null;
        } | null,
        usageSet: new Set<MarkerFabricUsage>(),
        missingAssignments: selectedPoIds.map(String),
        unitLock: null as 'yard' | 'kg' | null,
      };
    }

    const usageSet = new Set<MarkerFabricUsage>();
    let pendingSum = 0;
    let baseSum: number | null = 0;
    let totalSum: number | null = 0;

    const unitSet = new Set<string>();

    entries.forEach(entry => {
      usageSet.add(entry.usage);
      if (entry.detail.pendingPieces != null && !Number.isNaN(entry.detail.pendingPieces)) {
        pendingSum += entry.detail.pendingPieces;
      }
      if (entry.detail.baseRequirement != null && !Number.isNaN(entry.detail.baseRequirement)) {
        baseSum = (baseSum ?? 0) + entry.detail.baseRequirement;
      }
      if (entry.detail.totalRequirement != null && !Number.isNaN(entry.detail.totalRequirement)) {
        totalSum = (totalSum ?? 0) + entry.detail.totalRequirement;
      }
      const detailUnit = entry.detail.consumptionUnit?.toLowerCase?.();
      const optionUnit = entry.option.consumptionUnit?.toLowerCase?.();
      const bomUnit = entry.option.bomLineUnit?.toLowerCase?.();
      const pickedUnit = detailUnit || optionUnit || bomUnit || null;
      if (pickedUnit) {
        unitSet.add(pickedUnit);
      }
    });

    if (baseSum === 0) baseSum = entries.some(entry => entry.detail.baseRequirement != null) ? 0 : null;
    if (totalSum === 0)
      totalSum = entries.some(entry => entry.detail.totalRequirement != null) ? 0 : null;

    const entryMap = new Map<string, (typeof entries)[number]>();
    entries.forEach(entry => entryMap.set(entry.poId, entry));

    const missingAssignments = selectedPoIds
      .map(String)
      .filter(poId => !selectedFabricAssignments[poId]);

    let unitLock: 'yard' | 'kg' | null = null;
    if (unitSet.size === 1) {
      const unitValue = Array.from(unitSet)[0];
      if (unitValue.includes('kg')) {
        unitLock = 'kg';
      } else if (unitValue.includes('yard') || unitValue.includes('yd')) {
        unitLock = 'yard';
      }
    }

    return {
      entries,
      entryMap,
      aggregate: {
        pendingPieces: pendingSum,
        baseRequirement: baseSum,
        totalRequirement: totalSum,
      },
      usageSet,
      missingAssignments,
      unitLock,
    };
  }, [selectedPoIds, selectedFabricAssignments, computeFabricDetail]);

  const assignmentValidationMessage = useMemo(() => {
    if (!selectedPoIds.length) return null;
    if (fabricAssignmentError) return null;
    if (fabricRequirementSummary.missingAssignments.length) {
      return 'Select a fabric usage assignment for each purchase order.';
    }
    if (fabricRequirementSummary.usageSet.size > 1) {
      return 'All selected fabric usages must match; choose all Body or all Gusset fabrics for this marker.';
    }
    return null;
  }, [fabricAssignmentError, fabricRequirementSummary.missingAssignments.length, fabricRequirementSummary.usageSet.size, selectedPoIds.length]);

  const aggregateDetail = fabricRequirementSummary.aggregate;
  const aggregateConsumptionPerPiece =
    aggregateDetail && aggregateDetail.pendingPieces > 0 && aggregateDetail.baseRequirement != null
      ? aggregateDetail.baseRequirement / aggregateDetail.pendingPieces
      : null;
  const aggregateConsumptionUnit =
    fabricRequirementSummary.entries[0]?.detail.consumptionUnit ||
    (fabricRequirementSummary.unitLock ?? (measurementType === 'kg' ? 'kg' : 'yard'));
  const aggregateRequirementSource = (() => {
    if (!fabricRequirementSummary.entries.length) return null;
    const [first] = fabricRequirementSummary.entries;
    const allMatch = fabricRequirementSummary.entries.every(
      entry => entry.detail.requirementSource === first.detail.requirementSource
    );
    if (!allMatch) return null;
    return first.detail.requirementSource ?? 'bom_default';
  })();

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
    if (mode === 'edit' && initialRequest) {
      setMarkerNumber(initialRequest.marker_number);
      setSelectedPoIds(initialRequest.po_ids || []);
      setWidth(String(initialRequest.width || ''));
      setLayers(String(initialRequest.layers || ''));
      setEfficiency(String(initialRequest.efficiency || ''));
      setMarkerType(initialRequest.marker_type);
      setMarkerLengthYards(String(initialRequest.marker_length_yards || ''));
      setMarkerLengthInches(String(initialRequest.marker_length_inches || ''));
      setMeasurementType(initialRequest.measurement_type || 'yard');
      setMarkerGsm(String(initialRequest.marker_gsm ?? ''));
    } else {
      generateMarkerNumber();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialRequest?.id]);

  const selectedPurchaseOrders = useMemo(
    () => purchaseOrders.filter(po => selectedPoIds.includes(po.id)),
    [purchaseOrders, selectedPoIds]
  );

  const normalizeUsage = (usage: FabricUsageOption | null | undefined): MarkerFabricUsage => {
    if (usage === 'gusset_1' || usage === 'gusset_2') return 'gusset_1';
    return 'body';
  };

  const usedFabricSet = useMemo(() => {
    const set = new Set<string>();
    usedFabricAssignments.forEach(assignment => {
      if (!assignment?.bom_id) return;
      const normalized = normalizeUsage(assignment.fabric_usage as FabricUsageOption | null | undefined);
      const rawMaterialKey = assignment.raw_material_id != null ? String(assignment.raw_material_id) : 'none';
      set.add(`${assignment.bom_id}__${normalized}__${rawMaterialKey}`);
    });
    return set;
  }, [usedFabricAssignments]);

  useEffect(() => {
    previousFabricAssignmentsRef.current = selectedFabricAssignments;
  }, [selectedFabricAssignments]);

  useEffect(() => {
    const lock = fabricRequirementSummary.unitLock;
    if (lock) {
      if (fabricUnitLock !== lock) {
        setFabricUnitLock(lock);
      }
      if (measurementType !== lock) {
        setMeasurementType(lock);
        if (lock === 'yard') {
          setMarkerGsm('');
        }
      }
    } else if (fabricUnitLock !== null) {
      setFabricUnitLock(null);
    }
  }, [fabricRequirementSummary.unitLock, measurementType, fabricUnitLock]);

  const isSupportedUsage = (usage: FabricUsageOption | null): boolean =>
    usage === null || usage === undefined || usage === 'body' || usage === 'gusset_1' || usage === 'gusset_2';

  useEffect(() => {
    if (fabricRequirementSummary.usageSet.size === 1) {
      const usage = Array.from(fabricRequirementSummary.usageSet)[0];
      setMarkerType(usage === 'body' ? 'body' : 'gusset');
    }
  }, [fabricRequirementSummary.usageSet]);

  const loadFabricUsageOptions = useCallback(async () => {
    if (!selectedPurchaseOrders.length) {
      setFabricOptionsLoading(false);
      setFabricOptionsByPo({});
      setSelectedFabricAssignments({});
      previousFabricAssignmentsRef.current = {};
      setFabricAssignmentError(null);
      return;
    }

    const logDebug = (..._args: any[]) => {
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.log('[MarkerRequest]', ..._args);
      }
    };

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
      pendingQuantity: number;
    };

    const contexts: MaterialContext[] = [];
    const contextsByProductId = new Map<number, MaterialContext[]>();
    const contextsByName = new Map<string, MaterialContext[]>();
    const linkedProductsByBom = new Map<string, Set<number>>();
    let bomProductsUnavailable = false;

    const normalizeName = (value: string | null | undefined) =>
      value
        ? value
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase()
        : '';

    const registerLinkedProduct = (bomId: unknown, productId: unknown) => {
      const bomKey = bomId != null ? String(bomId) : null;
      const numericProductId = Number(productId);
      if (!bomKey || !Number.isFinite(numericProductId)) return;
      const set = linkedProductsByBom.get(bomKey) ?? new Set<number>();
      set.add(numericProductId);
      linkedProductsByBom.set(bomKey, set);
    };

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
      logDebug('Context registered', context);
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
        const pendingQuantity = (() => {
          if (typeof line.pending_qty === 'number' && !Number.isNaN(line.pending_qty)) {
            return Math.max(0, Number(line.pending_qty));
          }
          const qty = Number(line.product_qty || 0);
          const received = Number(line.qty_received || line.qty_delivered || line.qty_done || 0);
          return Math.max(0, qty - received);
        })();

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
          pendingQuantity,
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
      setFabricOptionsByPo({});
      setSelectedFabricAssignments({});
      previousFabricAssignmentsRef.current = {};
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
          raw_material_id,
          raw_material:raw_materials(id, name, base_unit, category_id, category:material_categories(id, name)),
          notes,
          quantity,
          unit,
          waste_percentage
        )
      `;

      const bomMap = new Map<string, any>();
      const appendBoms = (rows?: any[]) => {
        (rows || []).forEach(row => {
          if (!row || !row.id) return;
          const key = String(row.id);
          if (!bomMap.has(key)) {
            bomMap.set(key, row);
            logDebug('BOM header added', row);
          }
        });
      };

      const loadLinkedProductsForHeaders = async (headerIds: string[]) => {
        if (bomProductsUnavailable) return { error: null as any };
        const missing = headerIds
          .map(id => String(id))
          .filter(id => !linkedProductsByBom.has(id));
        if (!missing.length) return { error: null as any };
        const { data, error } = await supabase
          .from('bom_products')
          .select('bom_header_id, product_id')
          .in('bom_header_id', missing);
        if (error) {
          if (isMissingBomProductsTable(error)) {
            bomProductsUnavailable = true;
            return { error: null as any };
          }
          return { error };
        }
        (data || []).forEach(record => registerLinkedProduct(record?.bom_header_id, record?.product_id));
        return { error: null as any };
      };

      const fetchByProductIds = async () => {
        if (!uniqueProductIds.length) return { error: null as any };

        const [directRes, linkRes] = await Promise.all([
          supabase
            .from('bom_headers')
            .select(bomSelect)
            .eq('active', true)
            .in('product_id', uniqueProductIds),
          supabase
            .from('bom_products')
            .select('bom_header_id, product_id')
            .in('product_id', uniqueProductIds)
        ]);

        if (directRes.error) {
          logDebug('fetchByProductIds headers error', directRes.error);
          return { error: directRes.error };
        }
        appendBoms(directRes.data);

        if (linkRes.error) {
          logDebug('fetchByProductIds bom_products error', linkRes.error);
          if (isMissingBomProductsTable(linkRes.error)) {
            bomProductsUnavailable = true;
            return { error: null as any };
          }
          return { error: linkRes.error };
        }

        const linkedIds = Array.from(
          new Set(
            (linkRes.data || [])
              .map(record => {
                registerLinkedProduct(record?.bom_header_id, record?.product_id);
                return record?.bom_header_id;
              })
              .filter((value): value is string => Boolean(value))
          )
        ).filter(id => !bomMap.has(String(id)));

        if (!bomProductsUnavailable && linkedIds.length) {
          const linkedHeaders = await supabase
            .from('bom_headers')
            .select(bomSelect)
            .eq('active', true)
            .in('id', linkedIds);

          if (linkedHeaders.error) {
            logDebug('fetch linked headers error', linkedHeaders.error);
            return { error: linkedHeaders.error };
          }
          appendBoms(linkedHeaders.data);
        }

        if (!bomProductsUnavailable && linkedIds.length) {
          const extra = await loadLinkedProductsForHeaders(linkedIds);
          if (extra.error) {
            logDebug('loadLinkedProductsForHeaders error', extra.error);
            return { error: extra.error };
          }
        }

        return { error: null as any };
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

      let bomError: any = null;
      const productFetchResult = await fetchByProductIds();
      if (productFetchResult.error) {
        bomError = productFetchResult.error;
      }

      if (!bomMap.size) {
        const { data: byNameData, error: byNameError } = await fetchByNames();
        if (byNameError) {
          logDebug('fetchByNames error', byNameError);
          bomError = byNameError;
        } else {
          appendBoms(byNameData);
        }
      }

      if (!bomMap.size) {
        const { data: byRootData, error: byRootError } = await fetchByRootNames();
        if (byRootError) {
          logDebug('fetchByRootNames error', byRootError);
          bomError = byRootError;
        } else {
          appendBoms(byRootData);
        }
      }

      if (!bomMap.size) {
        const collectNoteKeys = (): string[] => {
          const set = new Set<string>();
          const register = (value?: string | null) => {
            if (!value) return;
            const trimmed = value.trim();
            if (!trimmed) return;
            set.add(trimmed);
            set.add(trimmed.replace(/\s+/g, ' '));
            const bracketless = trimmed.replace(/^\[[^\]]+\]\s*/, '');
            if (bracketless && bracketless !== trimmed) {
              set.add(bracketless);
              set.add(bracketless.replace(/\s+/g, ' '));
            }
          };

          contexts.forEach(ctx => {
            register(ctx.fullProductName);
            register(ctx.productName);
          });

          contextsByName.forEach((_, key) => {
            register(key);
          });

          return Array.from(set)
            .map(key => key.trim())
            .filter(Boolean);
        };

        const noteKeys = collectNoteKeys();
        const noteFilters = Array.from(new Set(noteKeys))
          .map(key => `notes.ilike.%${escapeIlikeValue(key)}%`)
          .filter(Boolean)
          .join(',');

        if (noteFilters) {
          logDebug('Searching bom_lines with filters', noteFilters);
          const { data: bomLinesByNotes, error: notesError } = await supabase
            .from('bom_lines')
            .select(
              `
                id,
                fabric_usage,
                notes,
                quantity,
                unit,
                waste_percentage,
                raw_material_id,
                raw_material:raw_materials(id, name, base_unit, category_id, category:material_categories(id, name)),
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
            logDebug('bom_lines by notes error', notesError);
            bomError = notesError;
          } else if (Array.isArray(bomLinesByNotes) && bomLinesByNotes.length) {
            logDebug('bom_lines by notes results', bomLinesByNotes.length);
            const headerIds = Array.from(
              new Set(
                bomLinesByNotes
                  .map(line => line?.bom_header?.id)
                  .filter((value): value is string => Boolean(value))
              )
            );

            if (headerIds.length) {
              logDebug('Fetching headers from note results', headerIds);
              const headersFromNotes = await supabase
                .from('bom_headers')
                .select(bomSelect)
                .eq('active', true)
                .in('id', headerIds);

              if (headersFromNotes.error) {
                logDebug('headersFromNotes error', headersFromNotes.error);
                bomError = headersFromNotes.error;
              } else {
                appendBoms(headersFromNotes.data);
                if (!bomProductsUnavailable) {
                  const extra = await loadLinkedProductsForHeaders(headerIds.map(id => String(id)));
                  if (extra.error && !bomError) {
                    logDebug('linked products for note headers error', extra.error);
                    bomError = extra.error;
                  }
                }
              }
            }
          }
        }
      }

      if (!bomMap.size && bomError) throw bomError;

      const bomData = Array.from(bomMap.values());
      logDebug('Final BOM headers', bomData);
      if (!bomProductsUnavailable) {
        const ensureLinked = await loadLinkedProductsForHeaders(
          bomData.map((bom: any) => bom?.id).filter((value: any) => value != null)
        );
        if (ensureLinked.error && !bomError) {
          bomError = ensureLinked.error;
        }
      }

      const optionMap = new Map<string, FabricUsageOptionItem>();

      const parseNumber = (value?: string | null): number => {
        if (!value) return NaN;
        const cleaned = value.replace(/,/g, '').trim();
        if (!cleaned) return NaN;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : NaN;
      };

      const normalizeNumeric = (value: unknown): number | null => {
        if (value === null || value === undefined || value === '') return null;
        const numeric = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      };

      const parseVariantConsumptions = (
        notes?: string | null
      ): Array<{
        key: string;
        looseKey: string;
        label: string;
        amount: number;
        unit: string | null;
        waste: number | null;
        productId: number | null;
      }> => {
        return parseVariantConsumptionsFromNotes(notes).map(entry => {
          const key = normalizeName(entry.label);
          const looseKey = key.replace(/[^A-Z0-9]/g, '');
          return {
            key,
            looseKey,
            label: entry.label,
            amount: entry.quantity != null ? entry.quantity : Number.NaN,
            unit: entry.unit ? entry.unit.toLowerCase() : null,
            waste: entry.waste,
            productId: entry.productId ?? null,
          };
        });
      };

      const extractNamesFromNotes = (notes?: string | null) =>
        parseVariantConsumptions(notes).map(item => item.key);

      (bomData || []).forEach((bom: any) => {
        if (!bom?.id) return;

        const productIdsForBom = new Set<number>();
        const addProductId = (value: unknown) => {
          const num = Number(value);
          if (!Number.isFinite(num)) return;
          productIdsForBom.add(num);
        };

        addProductId(bom.product_id);


        const linkedSet = linkedProductsByBom.get(String(bom.id));
        if (linkedSet) {
          linkedSet.forEach(value => addProductId(value));
        }

        const bomContexts = Array.from(productIdsForBom).flatMap(productId =>
          contextsByProductId.get(productId) ?? []
        );

        logDebug('Processing BOM', {
          bomId: bom.id,
          bomName: bom.name,
          lineCount: (bom.bom_lines || []).length,
        });

        (bom.bom_lines || []).forEach((line: any) => {
          const usage = line?.fabric_usage as FabricUsageOption | null;
          if (!isSupportedUsage(usage)) return;
          const normalizedUsage = normalizeUsage(usage);
          const rawMaterial = line?.raw_material ?? null;
          const rawMaterialId = Number.isFinite(Number(line?.raw_material_id)) ? Number(line.raw_material_id) : null;
          if (rawMaterialId == null) {
            return;
          }
          const rawMaterialName = typeof rawMaterial?.name === 'string' ? rawMaterial.name : null;
          const rawMaterialCategoryName = (rawMaterial?.category?.name ?? '').toString().toLowerCase();
          if (!rawMaterialCategoryName.includes('fabric')) {
            return;
          }
          const rawMaterialKey = String(rawMaterialId);
          if (usedFabricSet.has(`${bom.id}__${normalizedUsage}__${rawMaterialKey}`)) return;

          const variantConsumptions = parseVariantConsumptions(line?.notes);
          const variantMap = new Map(
            variantConsumptions.map(item => [item.key, item])
          );
          const variantLooseMap = new Map<string, typeof variantConsumptions[number][]>();
          variantConsumptions.forEach(item => {
            if (!item.looseKey) return;
            const list = variantLooseMap.get(item.looseKey) ?? [];
            list.push(item);
            variantLooseMap.set(item.looseKey, list);
          });
          const variantByProductId = new Map<number, ReturnType<typeof parseVariantConsumptions>[number]>();
          variantConsumptions.forEach(item => {
            if (item.productId != null && Number.isFinite(item.productId)) {
              variantByProductId.set(Number(item.productId), item);
            }
          });

          let contextsForLine = bomContexts;
          if (!contextsForLine.length) {
            const namesInNotes = extractNamesFromNotes(line?.notes);
            if (namesInNotes.length) {
              const matchedContexts = namesInNotes.flatMap(nameKey => contextsByName.get(nameKey) || []);
              contextsForLine = matchedContexts;
            }
          }

          if (!contextsForLine.length) {
            contextsForLine = contexts;
          }

          logDebug('Contexts for line', {
            bomId: bom.id,
            usage: normalizedUsage,
            contextCount: contextsForLine.length,
          });

          if (!contextsForLine.length) return;

          const findVariantForCandidate = (candidate: string | null | undefined) => {
            if (!candidate) return null;
            const normalized = candidate;
            const direct = variantMap.get(normalized);
            if (direct) return direct;
            const loose = normalized.replace(/[^A-Z0-9]/g, '');
            if (loose) {
              const looseMatches = variantLooseMap.get(loose);
              if (looseMatches && looseMatches.length) {
                return looseMatches[0];
              }
            }
            for (const item of variantConsumptions) {
              if (!item) continue;
              if (loose && item.looseKey && (item.looseKey.startsWith(loose) || loose.startsWith(item.looseKey))) {
                return item;
              }
              if (!loose && item.key.includes(normalized)) {
                return item;
              }
            }
            return null;
          };

          const aggregatedByVariant = new Map<
            string,
            {
              contexts: MaterialContext[];
              variant: ReturnType<typeof parseVariantConsumptions>[number] | null;
              pendingTotal: number;
            }
          >();

          contextsForLine.forEach(ctx => {
            const candidateKeys = [
              ctx.productNameUpper,
              ctx.fullProductNameUpper,
              ctx.productCodeUpper,
            ].filter(Boolean) as string[];

            let variantKey: string | null = null;
            let matchedVariant: ReturnType<typeof parseVariantConsumptions>[number] | null = null;

            if (ctx.productId != null) {
              const variantById = variantByProductId.get(Number(ctx.productId));
              if (variantById) {
                matchedVariant = variantById;
                variantKey = variantById.key;
              }
            }

            if (!matchedVariant) {
              for (const candidate of candidateKeys) {
                if (!candidate) continue;
                const variant = findVariantForCandidate(candidate);
                if (variant) {
                  matchedVariant = variant;
                  variantKey = variant.key;
                  // Variant matched by candidate
                  break;
                }
              }
            }

            const groupingKey = (variantKey || candidateKeys[0] || ctx.productNameUpper || 'default') + `__${ctx.poId}`;
            const bucket = aggregatedByVariant.get(groupingKey) ?? {
              contexts: [],
              variant: matchedVariant,
              pendingTotal: 0,
            };
            bucket.contexts.push(ctx);
            if (Number.isFinite(ctx.pendingQuantity)) {
              bucket.pendingTotal += Number(ctx.pendingQuantity);
            }
            if (!bucket.variant && matchedVariant) {
              bucket.variant = matchedVariant;
            }
            aggregatedByVariant.set(groupingKey, bucket);
          });

          aggregatedByVariant.forEach((bucket, groupingKey) => {
            const [, poId] = groupingKey.split('__');
            const ctxSample = bucket.contexts[0];
            if (!ctxSample) return;

            const key = `${bom.id}__${normalizedUsage}__${poId}__${rawMaterialKey}`;
            const matchedVariant = bucket.variant;
            const bomLineQuantity = normalizeNumeric(line?.quantity);
            const bomLineWaste = normalizeNumeric(line?.waste_percentage);
            const bomLineUnit = typeof line?.unit === 'string' ? line.unit : null;
            const baseConsumption = matchedVariant
              ? matchedVariant.amount
              : bomLineQuantity != null
                ? bomLineQuantity
                : NaN;
            const pendingPieces = Number.isFinite(bucket.pendingTotal) ? bucket.pendingTotal : null;
            const wastePercentage = matchedVariant?.waste ?? (bomLineWaste != null ? bomLineWaste : null);
            const baseRequirementContribution =
              pendingPieces != null && Number.isFinite(baseConsumption)
                ? baseConsumption * pendingPieces
                : null;
            const totalRequirementContribution =
              baseRequirementContribution != null
                ? baseRequirementContribution * (wastePercentage != null ? 1 + wastePercentage / 100 : 1)
                : null;

            if (optionMap.has(key)) {
              const existing = optionMap.get(key)!;
              const existingBaseValue = existing.baseRequirement ?? null;
              const existingTotalValue = existing.totalRequirement ?? null;
              const combinedPending = (existing.pendingPieces ?? 0) + (pendingPieces ?? 0);
              const combinedBaseValue =
                (existingBaseValue ?? 0) + (baseRequirementContribution ?? 0);
              const combinedTotalValue =
                (existingTotalValue ?? 0) + (totalRequirementContribution ?? 0);
              const hasBaseValue =
                (existingBaseValue != null && !Number.isNaN(existingBaseValue)) ||
                (baseRequirementContribution != null && !Number.isNaN(baseRequirementContribution));
              const hasTotalValue =
                (existingTotalValue != null && !Number.isNaN(existingTotalValue)) ||
                (totalRequirementContribution != null && !Number.isNaN(totalRequirementContribution));

              const combinedWaste =
                existing.wastePercentage != null && wastePercentage != null && existing.wastePercentage !== wastePercentage
                  ? null
                  : existing.wastePercentage ?? wastePercentage ?? null;

              const combinedVariantLabel = (() => {
                if (!existing.matchedVariantKey) return matchedVariant?.label || null;
                if (!matchedVariant?.label || existing.matchedVariantKey === matchedVariant.label) {
                  return existing.matchedVariantKey;
                }
                if (existing.matchedVariantKey === 'Multiple variants') return 'Multiple variants';
                return 'Multiple variants';
              })();

              optionMap.set(key, {
                ...existing,
                pendingPieces: combinedPending,
                matchedVariantKey: combinedVariantLabel,
                consumptionPerPiece:
                  combinedPending > 0 && hasBaseValue
                    ? combinedBaseValue / combinedPending
                    : existing.consumptionPerPiece,
                wastePercentage: combinedWaste,
                baseRequirement: hasBaseValue ? combinedBaseValue : null,
                totalRequirement: hasTotalValue ? combinedTotalValue : null,
                requirementSource:
                  matchedVariant || existing.requirementSource === 'variant_notes'
                    ? 'variant_notes'
                    : existing.requirementSource ?? (bomLineQuantity != null ? 'bom_default' : null),
                consumptionUnit:
                  existing.consumptionUnit || matchedVariant?.unit || bomLineUnit,
                bomLineNotes:
                  existing.bomLineNotes || (typeof line?.notes === 'string' ? line.notes : null),
              });
              return;
            }

            optionMap.set(key, {
              key,
              usage: normalizedUsage,
              bomId: bom.id as string,
              bomName: bom.name || 'Unnamed BOM',
              rawMaterialId: rawMaterialId,
              rawMaterialName: rawMaterialName,
              productId: ctxSample.productId,
              productName: ctxSample.productName,
              poId: ctxSample.poId,
            poNumber: ctxSample.poNumber,
            pendingPieces,
            matchedVariantKey: matchedVariant?.label || null,
            consumptionPerPiece:
              pendingPieces != null && Number.isFinite(baseConsumption)
                ? baseConsumption
                : null,
            consumptionUnit: matchedVariant?.unit || bomLineUnit,
            wastePercentage: wastePercentage != null ? wastePercentage : null,
            totalRequirement:
              totalRequirementContribution != null ? Number(totalRequirementContribution) : null,
            baseRequirement:
              baseRequirementContribution != null ? Number(baseRequirementContribution) : null,
            requirementSource: matchedVariant ? 'variant_notes' : bomLineQuantity != null ? 'bom_default' : null,
            bomLineQuantity: bomLineQuantity != null ? bomLineQuantity : null,
            bomLineUnit,
            bomLineWaste: bomLineWaste != null ? bomLineWaste : null,
            bomLineNotes: typeof line?.notes === 'string' ? line.notes : null,
          });
        });
      });
      });

      const optionsByPo: Record<string, FabricUsageOptionItem[]> = {};
      optionMap.forEach(option => {
        const list = optionsByPo[option.poId] ?? [];
        list.push(option);
        optionsByPo[option.poId] = list;
      });

      selectedPurchaseOrders.forEach(po => {
        const poId = String(po.id);
        if (!optionsByPo[poId]) {
          optionsByPo[poId] = [];
        }
      });

      Object.values(optionsByPo).forEach(list =>
        list.sort((a, b) => {
          const nameCompare = a.bomName.localeCompare(b.bomName);
          if (nameCompare !== 0) return nameCompare;
          return FABRIC_USAGE_LABELS[a.usage].localeCompare(FABRIC_USAGE_LABELS[b.usage]);
        })
      );

      const newAssignments: Record<string, FabricUsageOptionItem | null> = {};
      const prevAssignments = previousFabricAssignmentsRef.current;

      selectedPurchaseOrders.forEach(po => {
        const options = optionsByPo[String(po.id)] ?? [];
        logDebug('Options for PO', po.po_number || po.id, options);
        const previous = prevAssignments[String(po.id)];
        const stillValid = previous && options.some(option => option.key === previous.key);
        newAssignments[String(po.id)] = stillValid ? previous : options[0] ?? null;
      });

      setFabricOptionsByPo(optionsByPo);
      setSelectedFabricAssignments(newAssignments);
      previousFabricAssignmentsRef.current = newAssignments;

      const hasAnyOptions = Object.values(optionsByPo).some(list => list.length > 0);
      if (!hasAnyOptions) {
        setFabricAssignmentError(
          'No matching BOM fabric usage options were found for the selected purchase orders.'
        );
        logDebug('No fabric options matched');
      } else {
        setFabricAssignmentError(null);
      }
    } catch (error: any) {
      console.error('Failed to load fabric usage options', error);
      setFabricOptionsByPo({});
      setSelectedFabricAssignments({});
      previousFabricAssignmentsRef.current = {};
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

  const markerRequestedQuantity = useMemo(() => {
    if (!layersNumber || layersNumber <= 0) return null;

    if (measurementType === 'yard') {
      if (!markerLengthYardsTotal) return null;
      return markerLengthYardsTotal * layersNumber;
    }

    if (measurementType === 'kg') {
      if (!markerGsmValue || !widthMeters || !markerLengthMeters) return null;
      const areaSqMeters = widthMeters * markerLengthMeters * layersNumber;
      return (areaSqMeters * markerGsmValue) / 1000;
    }

    return null;
  }, [layersNumber, measurementType, markerLengthYardsTotal, markerGsmValue, widthMeters, markerLengthMeters]);

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
    setFabricOptionsByPo({});
    setSelectedFabricAssignments({});
    previousFabricAssignmentsRef.current = {};
    setFabricAssignmentError(null);
    if (mode === 'create') {
      await generateMarkerNumber();
    }
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

    if (fabricAssignmentError) {
      toast({
        title: 'Fabric usage unavailable',
        description: fabricAssignmentError,
        variant: 'destructive',
      });
      return;
    }

    if (assignmentValidationMessage) {
      toast({
        title: 'Fabric assignment required',
        description: assignmentValidationMessage,
        variant: 'destructive',
      });
      return;
    }

    if (!fabricRequirementSummary.entries.length) {
      toast({
        title: 'Fabric usage unavailable',
        description: 'No matching BOM fabric usage options were found for the selected purchase orders.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const fabricAssignmentsPayload: MarkerFabricAssignment[] = fabricRequirementSummary.entries.map(entry => ({
        bom_id: entry.option.bomId,
        bom_name: entry.option.bomName,
        fabric_usage: entry.option.usage,
        raw_material_id: entry.option.rawMaterialId,
        raw_material_name: entry.option.rawMaterialName ?? null,
        product_id: entry.option.productId,
        product_name: entry.option.productName,
        po_id: entry.option.poId,
        po_number: entry.option.poNumber,
      }));

      const fabricAssignment = fabricAssignmentsPayload[0] ?? null;

      const resolvedMarkerType = fabricRequirementSummary.usageSet.size === 1
        ? Array.from(fabricRequirementSummary.usageSet)[0] === 'body'
          ? 'body'
          : 'gusset'
        : markerType;

      const aggregateRequirement = fabricRequirementSummary.aggregate;
      const aggregateUnit =
        fabricRequirementSummary.entries[0]?.detail.consumptionUnit ||
        (measurementType === 'kg' ? 'kg' : 'yard');

      const payload = {
        marker_number: markerNumber,
        marker_type: resolvedMarkerType,
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
        fabric_assignments: fabricAssignmentsPayload,
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
          fabric_assignments: fabricAssignmentsPayload,
          fabric_requirement_summary: aggregateRequirement
            ? {
                pending_pieces: aggregateRequirement.pendingPieces,
                net_requirement: aggregateRequirement.baseRequirement,
                total_requirement: aggregateRequirement.totalRequirement,
                unit: aggregateUnit,
              }
            : undefined,
        },
      };

      if (mode === 'edit' && initialRequest) {
        const result = await markerRequestService.updateMarkerRequest(initialRequest.id, payload);
        await onRefreshPurchaseOrders();
        toast({ title: 'Marker Request Updated', description: `Marker ${result.marker_number} saved.` });
        onUpdated?.(result);
        onClose();
      } else {
        const result = await markerRequestService.createMarkerRequest(payload);
        await onRefreshPurchaseOrders();
        toast({ title: 'Marker Request Created', description: `Marker ${result.marker_number} saved successfully.` });
        onCreated(result);
        await resetForm();
        onClose();
      }
    } catch (error: any) {
      toast({
        title: mode === 'edit' ? 'Failed to update marker request' : 'Failed to create marker request',
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

  const selectedUsageArray = Array.from(fabricRequirementSummary.usageSet);
  const lockedMarkerType = selectedUsageArray.length === 1
    ? selectedUsageArray[0] === 'body'
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

              {(fabricOptionsLoading || selectedPurchaseOrders.length > 0 || fabricAssignmentError) && (
                <div className="space-y-4 rounded-lg border border-orange-200 bg-orange-50/40 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-semibold text-orange-900">Fabric Usage Assignments</Label>
                      <p className="text-xs text-orange-700">
                        Choose the BOM fabric usage for each selected purchase order.
                      </p>
                    </div>
                    {fabricOptionsLoading && <Loader2 className="h-4 w-4 animate-spin text-orange-600" />}
                  </div>

                  {fabricAssignmentError && (
                    <Alert className="bg-white">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm text-orange-900">
                        {fabricAssignmentError}
                      </AlertDescription>
                    </Alert>
                  )}

                  {!fabricAssignmentError && assignmentValidationMessage && (
                    <Alert className="bg-white">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      <AlertDescription className="text-sm text-orange-900">
                        {assignmentValidationMessage}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid gap-3">
                    {selectedPurchaseOrders.map(po => {
                      const poId = String(po.id);
                      const options = fabricOptionsByPo[poId] ?? [];
                      const selectedOption = selectedFabricAssignments[poId] ?? null;
                      const entry = fabricRequirementSummary.entryMap.get(poId);
                      return (
                        <div key={poId} className="space-y-2 rounded-md border border-orange-100 bg-white/80 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-orange-900">
                                PO {po.po_number || poId}
                              </p>
                              <p className="text-xs text-orange-600">
                                {selectedOption?.productName || 'Select a fabric usage'}
                              </p>
                            </div>
                          </div>
                          {options.length ? (
                            <Select
                              value={selectedOption?.key ?? ''}
                              onValueChange={value => handleFabricAssignmentChange(poId, value)}
                              disabled={fabricOptionsLoading}
                            >
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Select fabric usage" />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                {options.map(option => (
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
                          ) : (
                            <Alert className="bg-white">
                              <AlertDescription className="text-sm text-orange-900">
                                No matching BOM fabric usage options were found for this purchase order.
                              </AlertDescription>
                            </Alert>
                          )}

                          {entry && (
                            <div className="flex flex-wrap gap-2 text-xs text-orange-900">
                              <Badge variant="outline" className="border-orange-300 text-orange-900">
                                {FABRIC_USAGE_LABELS[entry.usage]}
                              </Badge>
                              <Badge variant="outline" className="border-orange-300 text-orange-900">
                                {entry.bomName}
                              </Badge>
                              {entry.option.productName && (
                                <Badge variant="outline" className="border-orange-300 text-orange-900">
                                  {entry.option.productName}
                                </Badge>
                              )}
                              {entry.option.rawMaterialName && (
                                <Badge variant="outline" className="border-orange-300 text-orange-900">
                                  {entry.option.rawMaterialName}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {fabricRequirementSummary.entries.length > 0 && aggregateDetail && (
                    <div className="rounded-md border border-slate-200 bg-white/70 p-4 shadow-sm">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">Fabric Requirement</span>
                          {aggregateRequirementSource && (
                            <Badge variant="outline" className="border-slate-300 text-slate-700">
                              {REQUIREMENT_SOURCE_LABELS[aggregateRequirementSource]}
                            </Badge>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Total pending pieces</p>
                            <p className="text-sm font-medium text-slate-900">
                              {formatQuantity(aggregateDetail.pendingPieces, 0)} pcs
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Consumption per piece</p>
                            <p className="text-sm font-medium text-slate-900">
                              {formatQuantity(aggregateConsumptionPerPiece)} {aggregateConsumptionUnit}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Net requirement</p>
                            <p className="text-sm font-medium text-slate-900">
                              {formatQuantity(aggregateDetail.baseRequirement)} {aggregateConsumptionUnit}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Total requirement (with waste)</p>
                            <p className="text-sm font-medium text-slate-900">
                              {formatQuantity(aggregateDetail.totalRequirement)} {aggregateConsumptionUnit}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2 border-t border-slate-100 pt-2">
                          {fabricRequirementSummary.entries.map(entry => (
                            <div key={entry.poId} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                              <span className="font-medium text-slate-900">
                                PO {entry.poNumber}
                              </span>
                              <span>
                                {formatQuantity(entry.detail.totalRequirement)}{' '}
                                {entry.detail.consumptionUnit || (measurementType === 'kg' ? 'kg' : 'yard')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Totals</p>
                  <div className="mt-2 grid gap-2 text-sm text-slate-900">
                    <div className="flex items-center justify-between">
                      <span>Total pending pieces</span>
                      <span className="font-semibold">{formatQuantity(totalPendingPieces, 0)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Layers</span>
                      <span className="font-semibold">{layersNumber || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Marker length (yards)</span>
                      <span className="font-semibold">{formatQuantity(markerLengthYardsTotal, 3)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Pieces per marker</span>
                      <span className="font-semibold">{formatQuantity(computedPiecesPerMarker, 2)}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Marker Requested Qty</p>
                  <div className="mt-2 space-y-2 text-sm text-slate-900">
                    <div className="flex items-center justify-between">
                      <span>
                        {measurementType === 'kg'
                          ? 'Total fabric (kg)'
                          : 'Total fabric (yards)'}
                      </span>
                      <span className="font-semibold">
                        {formatQuantity(markerRequestedQuantity, measurementType === 'kg' ? 3 : 3)}
                      </span>
                    </div>
                    {measurementType === 'kg' ? (
                      <div className="text-xs text-muted-foreground">
                        Based on width {formatQuantity(widthMeters, 3)} m, marker length {formatQuantity(markerLengthMeters, 3)} m,
                        layers {layersNumber}, GSM {markerGsmValue || '-'}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Marker length {formatQuantity(markerLengthYardsTotal, 3)} yd × layers {layersNumber}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Measurement Mode</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { value: 'yard' as const, label: 'Yard Request' },
                      { value: 'kg' as const, label: 'KG Request' },
                    ].map(option => {
                      const locked = fabricUnitLock !== null && fabricUnitLock !== option.value;
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          variant={measurementType === option.value ? 'default' : 'outline'}
                          disabled={locked}
                          onClick={() => {
                            if (locked) return;
                            setMeasurementType(option.value);
                            if (option.value === 'yard') {
                              setMarkerGsm('');
                            }
                          }}
                          className="w-full"
                        >
                          {option.label}
                        </Button>
                      );
                    })}
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
                      disabled={fabricUnitLock === 'yard'}
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
          {mode === 'edit' ? 'Update Marker Request' : 'Create Marker Request'}
        </Button>
      </div>
    </div>
  );
};

export default MarkerRequestForm;
    const isMissingBomProductsTable = (error: any) => {
      if (!error) return false;
      const message = String(error.message || '').toLowerCase();
      return error.code === 'PGRST200' || error.code === 'PGRST301' || message.includes('bom_products');
    };

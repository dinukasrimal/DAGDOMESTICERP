import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { SearchableOption } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Plus, 
  Minus, 
  Package, 
  Calendar, 
  Check, 
  X,
  Search,
  FileText,
  FileDown,
  AlertTriangle,
  Factory,
  Wrench,
  TestTube,
  Trash2,
  Settings,
  QrCode
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  GoodsIssueService, 
  GoodsIssue, 
  CreateGoodsIssue, 
  CreateGoodsIssueLine 
} from '../../services/goodsIssueService';
import { markerRequestService, MarkerRequest } from '@/services/markerRequestService';
import { MarkerFabricAssignment } from '@/types/marker';
import { parseVariantConsumptionsFromNotes } from '@/utils/variantConsumptions';
import { RawMaterialsService, RawMaterialWithInventory } from '../../services/rawMaterialsService';
import { PurchaseOrderService, PurchaseOrder } from '../../services/purchaseOrderService';
import { supabase } from '@/integrations/supabase/client';
import { BOMService, BOMWithLines } from '../../services/bomService';
import { ModernLayout } from '../layout/ModernLayout';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { generateGoodsIssuePdf } from '@/lib/pdfUtils';
import { cuttingSupplierService, CuttingSupplier } from '@/services/cuttingSupplierService';

const goodsIssueService = new GoodsIssueService();
const rawMaterialsService = new RawMaterialsService();
const purchaseOrderService = new PurchaseOrderService();
const bomService = new BOMService();

const formatNumeric = (value: number | null | undefined, digits = 3): string | null => {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return null;
  return numeric.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
};

const parseNumeric = (value: any): number | null => {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.+-]/g, '');
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

const parseKgFromNotes = (notes?: string): { kg: number | null; factor: number | null } => {
  if (!notes) return { kg: null, factor: null };
  try {
    const text = notes.toString();
    const weightMatch = text.match(/weight\s*\(?(?:kg)?\)?\s*[:=]\s*([\d.]+)/i);
    if (weightMatch && weightMatch[1]) {
      const kg = parseFloat(weightMatch[1]);
      if (!Number.isNaN(kg) && kg >= 0) {
        return { kg, factor: null };
      }
    }
    const factorMatch = text.match(/1\s*kg\s*=\s*([\d.]+)\s*([a-z]+)/i);
    if (factorMatch && factorMatch[1]) {
      const factor = parseFloat(factorMatch[1]);
      if (!Number.isNaN(factor) && factor > 0) {
        return { kg: null, factor };
      }
    }
  } catch (error) {
    console.warn('Failed to parse weight from notes:', error);
  }
  return { kg: null, factor: null };
};

const extractMarkerFabricKg = (marker: MarkerRequest | null | undefined, details?: any): number | null => {
  const markerPayload = marker as any;
  const summary = details?.fabric_requirement_summary ?? markerPayload?.fabric_requirement_summary;
  const requestedQty = details?.marker_requested_qty ?? markerPayload?.marker_requested_qty;
  const summaryUnit = String(summary?.unit || '').toLowerCase();
  const requestedUnit = String(requestedQty?.unit || '').toLowerCase();
  const measurementUnitIsKg = String(markerPayload?.measurement_type || '').toLowerCase() === 'kg';

  const candidates = [
    parseNumeric(markerPayload?.total_fabric_kg),
    parseNumeric(markerPayload?.fabric_total_kg),
    parseNumeric(markerPayload?.total_fabric?.kg),
    parseNumeric(markerPayload?.total_fabric),
    parseNumeric(details?.total_fabric_kg),
    parseNumeric(details?.fabric_total_kg),
    parseNumeric(details?.total_fabric?.kg),
    parseNumeric(details?.total_fabric),
    parseNumeric(details?.fabric_total),
    requestedUnit === 'kg' || measurementUnitIsKg ? parseNumeric(requestedQty?.total_fabric) : null,
    summaryUnit === 'kg' || measurementUnitIsKg ? parseNumeric(summary?.total_requirement) : null,
    summaryUnit === 'kg' || measurementUnitIsKg ? parseNumeric(summary?.net_requirement) : null,
  ];
  const resolved = candidates.find(value => value != null && value > 0) ?? null;
  console.log('🎯 extractMarkerFabricKg', {
    markerId: markerPayload?.id,
    markerNumber: markerPayload?.marker_number,
    measurementType: markerPayload?.measurement_type,
    summary,
    requestedQty,
    candidates,
    resolved,
  });
  return resolved;
};

type RequirementMode = 'bom' | 'marker';

interface RequirementCheck {
  mode: RequirementMode | 'none';
  needsApproval: boolean;
  details: string[];
  limit: number | null;
  totalIssued: number;
}

const requirementChecksEqual = (a: RequirementCheck, b: RequirementCheck): boolean => {
  if (a.mode !== b.mode) return false;
  if (a.needsApproval !== b.needsApproval) return false;
  if (a.limit !== b.limit) return false;
  if (Math.abs(a.totalIssued - b.totalIssued) > 1e-6) return false;
  if (a.details.length !== b.details.length) return false;
  for (let i = 0; i < a.details.length; i += 1) {
    if (a.details[i] !== b.details[i]) return false;
  }
  return true;
};

const normalizeProductIdentifier = (input?: string | null) => {
  if (!input) return '';
  const stripped = input
    .toString()
    .replace(/^\[[^\]]+\]\s*/, '');
  return stripped
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const extractCodeFromName = (input?: string | null) => {
  if (!input) return null;
  const match = input.toString().match(/^\[([^\]]+)\]/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
};

const extractVariantNamesFromNotes = (notes?: string | null): string[] => {
  return parseVariantConsumptionsFromNotes(notes)
    .map(variant => variant.label)
    .filter((label): label is string => Boolean(label && label.length > 0));
};

const buildProductBaseKey = (name?: string | null) => {
  if (!name) return '';
  const normalized = normalizeProductIdentifier(name);
  if (!normalized) return '';
  const base = normalized.replace(/\b\d+\b$/, '').trim();
  return base;
};

const nameMatchesKey = (source?: string | null, keys?: Set<string>) => {
  if (!source || !keys || keys.size === 0) return false;
  const normalized = normalizeProductIdentifier(source);
  if (!normalized) return false;
  for (const key of keys) {
    if (!key) continue;
    if (normalized === key) return true;
    if (normalized.includes(key)) return true;
    if (key.includes(normalized)) return true;
  }
  return false;
};

const ordersMatch = (current: any[] = [], nextOrders: any[] = []): boolean => {
  if (current.length !== nextOrders.length) return false;
  for (let i = 0; i < current.length; i += 1) {
    const currentId = current[i]?.id != null ? String(current[i].id) : '';
    const nextId = nextOrders[i]?.id != null ? String(nextOrders[i].id) : '';
    if (currentId !== nextId) return false;
  }
  return true;
};

const buildProductMatchKey = (
  name?: string | null,
  colour?: string | null,
  size?: string | null
) => {
  const parts = [name, colour, size]
    .map(part => (part ? normalizeProductIdentifier(part) : ''))
    .filter(Boolean);
  if (parts.length === 0) return '';
  return parts.join(' ');
};

const ISSUE_TYPES = [
  { value: 'production', label: 'Production', icon: Factory, color: 'blue' },
  { value: 'maintenance', label: 'Maintenance', icon: Wrench, color: 'purple' },
  { value: 'sample', label: 'Sample', icon: TestTube, color: 'green' },
  { value: 'waste', label: 'Waste', icon: Trash2, color: 'red' },
  { value: 'adjustment', label: 'Adjustment', icon: Settings, color: 'gray' }
] as const;

export const GoodsIssueManager: React.FC = () => {
  const [goodsIssues, setGoodsIssues] = useState<GoodsIssue[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialWithInventory[]>([]);
  const [productionOrders, setProductionOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [markerRequests, setMarkerRequests] = useState<MarkerRequest[]>([]);
  const [markerRequestLoading, setMarkerRequestLoading] = useState(false);
  const [markerOptionsForPO, setMarkerOptionsForPO] = useState<MarkerRequest[]>([]);
  const [selectedMarkerRequest, setSelectedMarkerRequest] = useState<MarkerRequest | null>(null);
  const [linkedPurchaseOrders, setLinkedPurchaseOrders] = useState<any[]>([]);
  const [activePOContext, setActivePOContext] = useState<any | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<GoodsIssue | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [issueMode, setIssueMode] = useState<'po' | 'general'>('po'); // deprecated
  const [issueTab, setIssueTab] = useState<'fabric' | 'trims'>('fabric');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [selectedProductionOrder, setSelectedProductionOrder] = useState<any | null>(null);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState<any | null>(null);
  const [bomRequirements, setBomRequirements] = useState<{[key: string]: number}>({}); // Material requirements by PO
  
  // New BOM selection states
  const [availableBOMs, setAvailableBOMs] = useState<BOMWithLines[]>([]);
  const [selectedBOM, setSelectedBOM] = useState<BOMWithLines | null>(null);
  const [bomMaterialRequirements, setBomMaterialRequirements] = useState<{
    material_id: string;
    material_name: string;
    required_quantity: number;
    issued_so_far: number;
    issuing_quantity: number;
    unit: string;
    available_quantity: number;
    category_id?: number; // For category-based consumption
    category_materials?: { id: number; name: string; base_unit: string; }[]; // Available materials in this category
    is_fabric?: boolean;
  }[]>([]);
  const [showBOMSelection, setShowBOMSelection] = useState(false);
  const [categorySelections, setCategorySelections] = useState<{[categoryId: string]: {materialId: number, quantity: number}[]}>({});
  const [issuedByMaterial, setIssuedByMaterial] = useState<Map<string, number>>(new Map());
  const { toast } = useToast();
  const [cuttingSuppliers, setCuttingSuppliers] = useState<CuttingSupplier[]>([]);
  const [poSuppliers, setPoSuppliers] = useState<string[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [legacySupplier, setLegacySupplier] = useState<string>('');
  const selectedSupplierName = useMemo(() => {
    if (issueTab === 'trims') {
      return legacySupplier.trim();
    }
    const match = cuttingSuppliers.find(supplier => String(supplier.id) === selectedSupplierId);
    return match?.name ?? '';
  }, [issueTab, legacySupplier, cuttingSuppliers, selectedSupplierId]);

  const materialOptions = useMemo<SearchableOption[]>(() => {
    return rawMaterials.map(material => {
      const availableRaw =
        material.inventory?.quantity_available ??
        material.inventory?.quantity_on_hand ??
        0;
      const available =
        typeof availableRaw === 'number' ? availableRaw : Number(availableRaw) || 0;
      const label = `${material.name}${material.code ? ` (${material.code})` : ''}`;
      const availableText = formatNumeric(available, 3) ?? available.toString();
      const unit = material.base_unit ? ` ${material.base_unit}` : '';
      return {
        value: String(material.id),
        label,
        description: `Available: ${availableText}${unit}`,
      };
    });
  }, [rawMaterials]);

  // Fabric scanning state for Goods Issue (per raw material)
  const [giFabricRolls, setGiFabricRolls] = useState<{[materialId: string]: { barcode: string; weight: number; length?: number }[]}>({});
  const [giShowBarcodeCamera, setGiShowBarcodeCamera] = useState(false);
  const [giCurrentMaterialId, setGiCurrentMaterialId] = useState<string | null>(null);
  const [giScannedBarcode, setGiScannedBarcode] = useState('');
  const [giRollWeight, setGiRollWeight] = useState<number>(0);
  const [giRollLength, setGiRollLength] = useState<number>(0);
  const [giShowWeightEntry, setGiShowWeightEntry] = useState(false);
  const [giCurrentCategoryKey, setGiCurrentCategoryKey] = useState<string | null>(null);
  const giWeightInputRef = useRef<HTMLInputElement | null>(null);

  // Form states
  const [formData, setFormData] = useState<CreateGoodsIssue>({
    issue_date: new Date().toISOString().split('T')[0],
    issue_type: 'production',
    reference_number: undefined,
    notes: undefined,
    lines: []
  });

  const [currentLine, setCurrentLine] = useState<CreateGoodsIssueLine>({
    raw_material_id: '',
    quantity_issued: 0,
    batch_number: '',
    notes: ''
  });
  // Per-line manual weight entry (kg) for non-kg base materials in Current Lines table
  // Per-line manual weight entry (kg) for non-kg base materials in Current Lines table
  const [lineKgState, setLineKgState] = useState<Record<string, { kg: number }>>({});
  // Per-material alternate unit issuing state within category selection
  const [altIssueModes, setAltIssueModes] = useState<Record<string, { enabled: boolean; unit: string; qty: number; factor: number }>>({});

  const requirementMode: RequirementMode = 'none';
  const [requirementCheck, setRequirementCheck] = useState<RequirementCheck>({
    mode: 'none',
    needsApproval: false,
    details: [],
    limit: null,
    totalIssued: 0,
  });

  const purchaseOrderMap = useMemo(() => new Map(purchaseOrders.map(order => [String(order.id), order])), [purchaseOrders]);

  const markerSelectOptions = useMemo(
    () =>
      markerOptionsForPO.map(marker => {
        const assignedPos = (marker.po_ids || [])
          .map(id => purchaseOrderMap.get(String(id)))
          .filter((po): po is any => Boolean(po))
          .map(po => po.po_number || po.name || `PO ${po.id}`)
          .join(', ');

        const descriptionParts = [
          marker.marker_type === 'body' ? 'Body Marker' : 'Gusset Marker',
          (marker.measurement_type || 'yard').toUpperCase(),
        ];
        if (assignedPos) {
          descriptionParts.push(`POs: ${assignedPos}`);
        }

        return {
          value: String(marker.id),
          label: marker.marker_number,
          description: descriptionParts.join(' • '),
        };
      }),
    [markerOptionsForPO, purchaseOrderMap]
  );

  const markerDetails = useMemo(() => (selectedMarkerRequest?.details as Record<string, any> | null) ?? null, [selectedMarkerRequest]);
  const markerRequirementSummary = useMemo(() => {
    if (!markerDetails) return null;
    const summary = markerDetails.fabric_requirement_summary as
      | { pending_pieces?: number; net_requirement?: number; total_requirement?: number; unit?: string }
      | null
      | undefined;
    return summary ?? null;
  }, [markerDetails]);
  const markerRequestedQty = markerDetails?.marker_requested_qty as
    | { total_fabric?: number | string; unit?: string }
    | null
    | undefined;
  const markerTotalFabricKg = (() => {
    const markerPayload = selectedMarkerRequest as any;
    const details = markerDetails as any;
    const summary = details?.fabric_requirement_summary ?? markerPayload?.fabric_requirement_summary;
    const summaryUnit = String(summary?.unit || '').toLowerCase();
    const requestedUnit = String(markerRequestedQty?.unit || '').toLowerCase();
    const measurementUnitIsKg = String(selectedMarkerRequest?.measurement_type || '').toLowerCase() === 'kg';
    const candidates = [
      parseNumeric(markerPayload?.total_fabric_kg),
      parseNumeric(markerPayload?.fabric_total_kg),
      parseNumeric(markerPayload?.total_fabric?.kg),
      parseNumeric(markerPayload?.total_fabric),
      parseNumeric(details?.total_fabric_kg),
      parseNumeric(details?.fabric_total_kg),
      parseNumeric(details?.total_fabric?.kg),
      parseNumeric(details?.total_fabric),
      parseNumeric(details?.fabric_total),
      requestedUnit === 'kg' || measurementUnitIsKg ? parseNumeric(markerRequestedQty?.total_fabric) : null,
      summaryUnit === 'kg' || measurementUnitIsKg ? parseNumeric(summary?.total_requirement) : null,
      summaryUnit === 'kg' || measurementUnitIsKg ? parseNumeric(summary?.net_requirement) : null,
    ];
    const resolved = candidates.find(num => num != null && num > 0) ?? null;
    console.log('🎯 Marker fabric resolver', {
      markerId: selectedMarkerRequest?.id,
      markerNumber: selectedMarkerRequest?.marker_number,
      measurementType: selectedMarkerRequest?.measurement_type,
      summary,
      requestedQty: markerRequestedQty,
      candidates,
      resolved,
    });
    return resolved;
  })();
  const markerPendingPieces = markerDetails?.total_pending_pieces ?? markerRequirementSummary?.pending_pieces ?? null;
  const markerNetRequirement = markerRequirementSummary?.net_requirement ?? null;
  const markerRequirementUnit = (() => {
    if (markerTotalFabricKg != null) return 'kg';
    if (markerRequirementSummary?.unit) return markerRequirementSummary.unit;
    if (markerRequestedQty?.unit) return markerRequestedQty.unit;
    if ((selectedMarkerRequest?.measurement_type || '').toLowerCase() === 'kg') return 'kg';
    return 'yard';
  })();
  const markerTotalRequirement = (() => {
    if (markerTotalFabricKg != null) return markerTotalFabricKg;
    const requestedTotal = parseNumeric(markerRequestedQty?.total_fabric);
    if (requestedTotal != null) return requestedTotal;
    if (markerRequirementSummary?.total_requirement != null) return markerRequirementSummary.total_requirement;
    if ((selectedMarkerRequest?.measurement_type || '').toLowerCase() === 'kg') {
      const num = parseNumeric(selectedMarkerRequest?.total_fabric_kg);
      if (num != null) return num;
    }
    return parseNumeric(selectedMarkerRequest?.total_fabric_yards);
  })();
  console.log('📏 Marker requirement resolved', {
    markerId: selectedMarkerRequest?.id,
    fabric_total_kg: parseNumeric(selectedMarkerRequest?.fabric_total_kg),
    markerTotalFabricKg,
    markerRequirementSummary,
    markerRequestedQty,
    markerTotalRequirement,
  });
  const aggregatedPoBadges = useMemo(
    () =>
      linkedPurchaseOrders.map(po => ({
        id: String(po.id),
        label: po.po_number || po.name || `PO ${po.id}`,
      })),
    [linkedPurchaseOrders]
  );
  const markerRequirementText = markerTotalRequirement != null
    ? `${formatNumeric(markerTotalRequirement, markerRequirementUnit === 'kg' ? 3 : 2) ?? markerTotalRequirement} ${markerRequirementUnit}`
    : null;
  const markerNetRequirementText = markerNetRequirement != null
    ? `${formatNumeric(markerNetRequirement, markerRequirementUnit === 'kg' ? 3 : 2) ?? markerNetRequirement} ${markerRequirementUnit}`
    : null;
  const markerPendingPiecesText = markerPendingPieces != null
    ? `${formatNumeric(markerPendingPieces, 0) ?? markerPendingPieces}`
    : null;

  // Focused material context (when scanning or using manual material selector)
  const activeMaterialIdForRequirement = useMemo(() => {
    return giCurrentMaterialId || (currentLine.raw_material_id || '');
  }, [giCurrentMaterialId, currentLine.raw_material_id]);

  // Per-material requirement from BOM requirements (filtered to this material only)
  const perMaterialRequirement = useMemo(() => {
    if (!activeMaterialIdForRequirement) return null;
    const req = bomMaterialRequirements.find(r => !r.category_id && r.material_id === activeMaterialIdForRequirement);
    if (!req) return null;
    const required = Number(req.required_quantity) || 0;
    const unit = req.unit || (markerRequirementUnit || '');
    return { required, unit, name: req.material_name };
  }, [activeMaterialIdForRequirement, bomMaterialRequirements, markerRequirementUnit]);

  const perMaterialRequirementText = useMemo(() => {
    if (!perMaterialRequirement) return null;
    const digits = (perMaterialRequirement.unit || '').toLowerCase().includes('kg') ? 3 : 2;
    const formatted = formatNumeric(perMaterialRequirement.required, digits) ?? perMaterialRequirement.required;
    return `${formatted} ${perMaterialRequirement.unit || ''}`;
  }, [perMaterialRequirement]);

  const bomRequirementMap = useMemo(() => {
    const map = new Map<string, { required: number; name: string }>();
    bomMaterialRequirements.forEach(req => {
      if (!req.category_id) {
        map.set(req.material_id, {
          required: Number(req.required_quantity) || 0,
          name: req.material_name,
        });
      }
    });
    return map;
  }, [bomMaterialRequirements]);

  const bomRequirementTotals = useMemo(() => {
    if (!bomMaterialRequirements.length) {
      return null;
    }
    const totalRequired = bomMaterialRequirements.reduce(
      (sum, req) => sum + (Number(req.required_quantity) || 0),
      0
    );
    const totalIssued = bomMaterialRequirements.reduce(
      (sum, req) => sum + (Number(req.issued_so_far) || 0),
      0
    );
    const unit = bomMaterialRequirements.find(req => req.unit)?.unit || null;
    return {
      totalRequired,
      totalIssued,
      remaining: Math.max(0, totalRequired - totalIssued),
      unit,
    };
  }, [bomMaterialRequirements]);

  const computeRequirementCheck = useCallback(
    (_lines: CreateGoodsIssueLine[]): RequirementCheck => ({
      mode: 'none',
      needsApproval: false,
      details: [],
      limit: null,
      totalIssued: 0,
    }),
    []
  );

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (giShowWeightEntry) {
      requestAnimationFrame(() => {
        if (giWeightInputRef.current) {
          giWeightInputRef.current.focus({ preventScroll: true });
          giWeightInputRef.current.select();
        }
      });
    }
  }, [giShowWeightEntry, giScannedBarcode]);

  useEffect(() => {
    if (issueTab === 'trims' && selectedPurchaseOrder?.partner_name) {
      setLegacySupplier(selectedPurchaseOrder.partner_name);
    }
  }, [issueTab, selectedPurchaseOrder]);

  // Goods Issue scanning unit helpers
  const giUnit = useMemo(() => {
    const mat = giCurrentMaterialId ? rawMaterials.find(m => m.id.toString() === giCurrentMaterialId) : null;
    return (mat?.purchase_unit || 'kg');
  }, [giCurrentMaterialId, rawMaterials]);
  const giIsWeightMode = useMemo(() => giUnit.toLowerCase().includes('kg'), [giUnit]);

  useEffect(() => {
    const nextCheck = computeRequirementCheck(formData.lines);
    setRequirementCheck(prev => requirementChecksEqual(prev, nextCheck) ? prev : nextCheck);
  }, [computeRequirementCheck, formData.lines]);

  useEffect(() => {
    // requirement enforcement disabled; effect retained to satisfy legacy dependencies
  }, [issueTab, selectedBOM, selectedMarkerRequest]);

  useEffect(() => {
    if (issueTab === 'trims') return;
    if (!selectedPurchaseOrder || !selectedPurchaseOrder.partner_name) return;
    if (!cuttingSuppliers.length) return;
    if (selectedSupplierId) return;
    const partnerName = selectedPurchaseOrder.partner_name.trim();
    if (!partnerName) return;
    const match = cuttingSuppliers.find(
      supplier => supplier.name.toLowerCase() === partnerName.toLowerCase()
    );
    if (match) {
      setSelectedSupplierId(String(match.id));
    }
  }, [cuttingSuppliers, selectedPurchaseOrder, selectedSupplierId, issueTab]);

  const loadMarkerRequests = async (): Promise<MarkerRequest[]> => {
    try {
      setMarkerRequestLoading(true);
      const markers = await markerRequestService.getMarkerRequests();
      setMarkerRequests(markers);
      return markers;
    } catch (error) {
      console.error('Failed to load marker requests', error);
      toast({
        title: 'Marker Requests Unavailable',
        description: 'Could not load marker requests. Marker-linked issuing may be limited.',
        variant: 'destructive'
      });
      return [];
    } finally {
      setMarkerRequestLoading(false);
    }
  };

  // Refresh inventory when GRN posts
  useEffect(() => {
    const handler = () => rawMaterialsService.getRawMaterials().then(setRawMaterials).catch(() => {});
    window.addEventListener('inventory-updated', handler as any);
    return () => window.removeEventListener('inventory-updated', handler as any);
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const suppliersPromise = cuttingSupplierService
        .list()
        .catch(error => {
          console.error('Failed to load cutting suppliers', error);
          toast({
            title: 'Supplier Load Failed',
            description: 'Unable to load cutting suppliers. You can still add a new one manually.',
            variant: 'destructive',
          });
          return [] as CuttingSupplier[];
        });

      const [issuesData, materialsData, purchaseOrdersData, supplierData] = await Promise.all([
        goodsIssueService.getAllGoodsIssue(),
        rawMaterialsService.getRawMaterials(),
        loadPurchaseOrders(),
        suppliersPromise,
      ]);
      setGoodsIssues(issuesData);
      setRawMaterials(materialsData);
      setPurchaseOrders(purchaseOrdersData);
      setCuttingSuppliers(supplierData);
      const uniqSuppliers = Array.from(new Set((purchaseOrdersData || []).map(o => o.partner_name).filter(Boolean))) as string[];
      setPoSuppliers(uniqSuppliers);
      await loadMarkerRequests();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Recompute available quantities in BOM requirements when rawMaterials refreshes
  useEffect(() => {
    if (!bomMaterialRequirements.length) return;
    setBomMaterialRequirements(prev => prev.map(req => {
      if (req.category_id) return req; // skip category placeholder rows
      const mat = rawMaterials.find(m => m.id.toString() === req.material_id);
      const avail = mat?.inventory?.quantity_available ?? req.available_quantity;
      return { ...req, available_quantity: avail };
    }));
  }, [rawMaterials]);

  const loadPurchaseOrders = async (): Promise<any[]> => {
    try {
      console.log('Loading purchase orders from purchases table...');
      
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .not('state', 'eq', 'done') // Exclude completed orders
        .not('state', 'eq', 'cancel') // Exclude cancelled orders
        .order('date_order', { ascending: false })
        .limit(200); // Load more orders to match the 171 count

      if (error) {
        console.error('Failed to load purchase orders:', error);
        return [];
      }

      console.log(`Loaded ${data?.length || 0} purchase orders`);
      
      // Parse order_lines JSON to extract product information
      const ordersWithProducts = (data || []).map(order => {
        let products = [];
        try {
          if (order.order_lines) {
            const orderLines = typeof order.order_lines === 'string' 
              ? JSON.parse(order.order_lines) 
              : order.order_lines;
            
            if (Array.isArray(orderLines)) {
              products = orderLines.map(line => {
                const qty = 
                  line.product_uom_qty ??
                  line.product_qty ??
                  line.qty ??
                  line.quantity ??
                  line.order_qty ??
                  0;

                let productId = line.product_id ?? line.id;
                let productName = line.product_name || line.name || '';
                const productArrayId = Array.isArray(line.product_id) ? line.product_id : null;
                if (productArrayId) {
                  if (productArrayId.length > 0 && productArrayId[0]) {
                    productId = productArrayId[0];
                  }
                  if (!productName && productArrayId.length > 1 && typeof productArrayId[1] === 'string') {
                    productName = productArrayId[1];
                  }
                }

                let defaultCode =
                  line.product_code ??
                  line.product_default_code ??
                  line.default_code ??
                  line.product_sku ??
                  line.sku ??
                  undefined;

                if (!defaultCode) {
                  defaultCode = extractCodeFromName(productName || '') || undefined;
                }

                const colour =
                  line.colour ??
                  line.color ??
                  line.product_colour ??
                  line.product_color ??
                  null;

                const size =
                  line.size ??
                  line.product_size ??
                  line.dimension ??
                  null;

                const matchKey = buildProductMatchKey(productName || undefined, colour, size);
                const baseMatchKey = buildProductBaseKey(productName || undefined);

                return ({
                  id: productId ?? line.id,
                  name: productName || 'Unknown Product',
                  default_code: defaultCode ? String(defaultCode) : null,
                  colour,
                  size,
                  quantity: Number(qty) || 0,
                  pending_qty: order.pending_qty || 0,
                  match_key: matchKey,
                  base_match_key: baseMatchKey,
                });
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to parse order_lines for PO ${order.name}:`, error);
        }
        
        return {
          ...order,
          po_number: order.name,
          products,
          supplier_name: order.partner_name,
          outstanding_qty: order.pending_qty || 0
        };
      });

      return ordersWithProducts;
    } catch (error) {
      console.error('Failed to load purchase orders:', error);
      return [];
    }
  };

  const buildPOContext = (orders: any[], marker?: MarkerRequest | null) => {
    if (!orders || orders.length === 0) return null;
    const poNumbers = Array.from(new Set(orders.map((po: any) => po.po_number).filter(Boolean)));
    const flattenedProducts = orders.flatMap((po: any) =>
      (po.products || []).map((product: any) => ({
        ...product,
        source_po_id: po.id,
        source_po_number: po.po_number,
      }))
    );

    return {
      id: marker?.id ?? orders[0].id,
      po_number: orders[0].po_number,
      po_numbers: poNumbers,
      marker_number: marker?.marker_number ?? null,
      marker_type: marker?.marker_type ?? null,
      measurement_type: marker?.measurement_type ?? null,
      total_fabric_yards: marker?.total_fabric_yards ?? null,
      total_fabric_kg: marker?.total_fabric_kg ?? null,
      marker_details: marker?.details ?? null,
      products: flattenedProducts,
      supplier_name: orders[0].supplier_name,
      outstanding_qty: orders.reduce((sum: number, po: any) => sum + Number(po.outstanding_qty || po.pending_qty || 0), 0),
      rawOrders: orders,
    };
  };

  useEffect(() => {
    const syncContextForTab = async () => {
      if (issueTab === 'trims') {
        if (!selectedPurchaseOrder) return;
        const singleOrders = [selectedPurchaseOrder];
        if (ordersMatch(linkedPurchaseOrders, singleOrders)) return;

        setLinkedPurchaseOrders(singleOrders);
        const context = buildPOContext(singleOrders);
        if (context) {
          setActivePOContext(context);
          setSelectedBOM(null);
          setBomMaterialRequirements([]);
          setShowBOMSelection(false);
          await loadAvailableBOMs(context);
        }
        return;
      }

      if (issueTab === 'fabric' && selectedMarkerRequest) {
        const markerPoIds = Array.from(
          new Set((selectedMarkerRequest.po_ids || []).map(id => String(id)).filter(Boolean))
        );
        const resolvedOrders = markerPoIds
          .map(id => purchaseOrderMap.get(id))
          .filter((po): po is any => Boolean(po));

        if (!resolvedOrders.length && selectedPurchaseOrder) {
          resolvedOrders.push(selectedPurchaseOrder);
        }

        if (!resolvedOrders.length) return;
        if (ordersMatch(linkedPurchaseOrders, resolvedOrders)) return;

        setLinkedPurchaseOrders(resolvedOrders);
        const context = buildPOContext(resolvedOrders, selectedMarkerRequest);
        if (context) {
          setActivePOContext(context);
          setSelectedBOM(null);
          setBomMaterialRequirements([]);
          setShowBOMSelection(false);
          await loadAvailableBOMs(context, selectedMarkerRequest);
        }
      }
    };

    void syncContextForTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueTab, selectedPurchaseOrder, selectedMarkerRequest, purchaseOrderMap]);

  const loadActiveProductionOrders = async (): Promise<any[]> => {
    try {
      // First, get the orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          production_line:production_lines(id, name)
        `)
        .in('status', ['pending', 'scheduled', 'in_progress'])
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Failed to load production orders:', ordersError);
        return [];
      }

      if (!ordersData || ordersData.length === 0) {
        return [];
      }

      // Get unique style_ids to fetch products
      const styleIds = [...new Set(ordersData.map(order => order.style_id).filter(Boolean))];
      
      // Fetch products that match the style_ids (assuming style_id maps to product id or code)
      const productsMap: {[key: string]: any} = {};
      
      if (styleIds.length > 0) {
        // Try fetching by id first (assuming style_id is product id as string)
        const numericStyleIds = styleIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        
        if (numericStyleIds.length > 0) {
          const { data: productsData, error: productsError } = await supabase
            .from('products')
            .select('id, name, default_code, colour, size')
            .in('id', numericStyleIds);
            
          if (!productsError && productsData) {
            productsData.forEach(product => {
              productsMap[product.id.toString()] = product;
            });
          }
        }
        
        // If no matches by id, try by default_code
        if (Object.keys(productsMap).length === 0) {
          const { data: productsByCodeData, error: productsByCodeError } = await supabase
            .from('products')
            .select('id, name, default_code, colour, size')
            .in('default_code', styleIds);
            
          if (!productsByCodeError && productsByCodeData) {
            productsByCodeData.forEach(product => {
              if (product.default_code) {
                productsMap[product.default_code] = { ...product, product_id: product.id };
              }
            });
          }
        }
      }

      // Combine orders with product/style information
      const ordersWithStyles = ordersData.map(order => ({
        ...order,
        style: productsMap[order.style_id] || { id: null, name: order.style_id, product_id: null }
      }));

      return ordersWithStyles;
    } catch (error) {
      console.error('Failed to load production orders:', error);
      return [];
    }
  };

  const calculateBOMRequirements = async (purchaseOrder: any) => {
    try {
      const requirements: {[key: string]: number} = {};
      
      if (!purchaseOrder.products || purchaseOrder.products.length === 0) {
        console.warn(`No products found in purchase order ${purchaseOrder.po_number}`);
        return requirements;
      }

      // Calculate BOM requirements for each product in the purchase order
      for (const product of purchaseOrder.products) {
        if (!product.id) continue;
        
        try {
          // Get BOM for this product
          const bomList = await bomService.getBOMsByProduct(product.id);
          
          if (bomList.length === 0) {
            console.warn(`No BOM found for product ${product.id} (${product.name})`);
            continue;
          }

          // Use the first active BOM
          const productBom = bomList[0];
          const productionQuantity = product.pending_qty || product.quantity || 0;

          if (productBom && productBom.lines && productionQuantity > 0) {
            for (const bomLine of productBom.lines) {
              if (bomLine.raw_material) {
                const materialId = bomLine.raw_material.id.toString();
                // Calculate required quantity with waste percentage
                const quantityWithWaste = bomLine.quantity * (1 + (bomLine.waste_percentage || 0) / 100);
                const requiredQty = (quantityWithWaste / productBom.quantity) * productionQuantity;
                
                if (requirements[materialId]) {
                  requirements[materialId] += requiredQty;
                } else {
                  requirements[materialId] = requiredQty;
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to process BOM for product ${product.id}:`, error);
        }
      }

      return requirements;
    } catch (error) {
      console.error('Failed to calculate BOM requirements:', error);
      return {};
    }
  };

  // Load available BOMs for products in the selected PO
  const loadAvailableBOMs = async (poContext: any, marker?: MarkerRequest | null) => {
    try {
      if (!poContext) {
        setAvailableBOMs([]);
        return;
      }

      const markerAssignments: MarkerFabricAssignment[] = [
        ...(((marker?.fabric_assignments as MarkerFabricAssignment[] | null | undefined) ?? [])),
        ...(marker?.fabric_assignment ? [marker.fabric_assignment] : []),
      ].filter((assignment): assignment is MarkerFabricAssignment => Boolean(assignment && assignment.bom_id));

      const preferredBomIds = new Set<string>(
        (markerAssignments || [])
          .map(assignment => assignment?.bom_id)
          .filter((id): id is string => Boolean(id))
      );

      console.log('🔍 Debug: Loading BOMs for PO context:', {
        marker: marker?.marker_number,
        po_numbers: poContext.po_numbers || [poContext.po_number],
      });
      console.log('📦 Debug: PO products:', poContext.products);
      
      const bomSet = new Set<string>();
      const boms: BOMWithLines[] = [];
      
      if (!poContext.products || poContext.products.length === 0) {
        console.log('❌ Debug: No products found in PO');
        setAvailableBOMs([]);
        return;
      }

      const poProducts = poContext.products || [];
      console.log('📦 Debug: PO product details', poProducts);
      const poProductIds = new Set<string>(
        poProducts
          .map((product: any) => {
            if (product?.id == null) return null;
            return String(product.id);
          })
          .filter((id): id is string => Boolean(id))
      );
      const poProductsById = new Map<string, any>();
      poProducts.forEach((product: any) => {
        if (product?.id != null) {
          poProductsById.set(String(product.id), product);
        }
      });
      const poProductCodes = new Set<string>(
        poProducts
          .map((product: any) => (product.default_code || product.code || '')?.toString().toLowerCase())
          .filter((code): code is string => Boolean(code))
      );
      const poProductMatchKeys = new Set<string>(
        poProducts
          .map((product: any) => product.match_key || buildProductMatchKey(product.name, product.colour, product.size))
          .filter((key): key is string => Boolean(key))
      );
      const poProductBaseKeys = new Set<string>(
        poProducts
          .map((product: any) => product.base_match_key || buildProductBaseKey(product.name))
          .filter((key): key is string => Boolean(key))
      );
      const poProductNameKeys = new Set<string>(
        poProducts
          .map((product: any) => normalizeProductIdentifier(product.name))
          .filter((key): key is string => Boolean(key))
      );

      console.log('🧮 Debug: PO product keys', {
        ids: Array.from(poProductIds),
        codes: Array.from(poProductCodes),
        matchKeys: Array.from(poProductMatchKeys),
        baseKeys: Array.from(poProductBaseKeys),
        nameKeys: Array.from(poProductNameKeys),
      });
      const bomMatchesPOProducts = (bom: BOMWithLines) => {
        const associatedProducts: Array<{
          id?: number | string | null;
          name?: string | null;
          default_code?: string | null;
          colour?: string | null;
          size?: string | null;
        }> = [];

        if (Array.isArray(bom.products) && bom.products.length > 0) {
          associatedProducts.push(...bom.products);
        } else if (bom.product) {
          associatedProducts.push(bom.product);
        } else if (bom.product_id) {
          const fallback = poProductsById.get(String(bom.product_id));
          associatedProducts.push({
            id: bom.product_id,
            name: fallback?.name ?? null,
            default_code: fallback?.default_code ?? fallback?.code ?? null,
            colour: fallback?.colour ?? null,
            size: fallback?.size ?? null,
          });
        }

        const bomProductIds = (bom as any).product_ids;
        if (Array.isArray(bomProductIds) && bomProductIds.length > 0) {
          bomProductIds.forEach((id: any) => {
            if (id == null) return;
            const idStr = String(id);
            const fallback = poProductsById.get(idStr);
            associatedProducts.push({
              id: idStr,
              name: fallback?.name ?? null,
              default_code: fallback?.default_code ?? fallback?.code ?? null,
              colour: fallback?.colour ?? null,
              size: fallback?.size ?? null,
            });
          });
        }

        const existingProductIds = new Set<string>(
          associatedProducts
            .map(prod => (prod?.id != null ? String(prod.id) : null))
            .filter((id): id is string => Boolean(id))
        );

        const existingNameKeys = new Set<string>(
          associatedProducts
            .map(prod => normalizeProductIdentifier(prod?.name))
            .filter((key): key is string => Boolean(key))
        );

        (bom.lines || []).forEach(line => {
          const variants = parseVariantConsumptionsFromNotes((line as any)?.notes);
          variants.forEach(variant => {
            const variantId = variant.productId != null ? String(variant.productId) : null;
            const normalizedVariantName = normalizeProductIdentifier(variant.label);

            if ((variantId && existingProductIds.has(variantId)) || (normalizedVariantName && existingNameKeys.has(normalizedVariantName))) {
              return;
            }

            associatedProducts.push({
              id: variantId,
              name: variant.label ?? null,
              default_code: null,
              colour: null,
              size: null,
            });

            if (variantId) {
              existingProductIds.add(variantId);
            }
            if (normalizedVariantName) {
              existingNameKeys.add(normalizedVariantName);
            }
          });
        });

        const validProducts = associatedProducts.filter(prod => {
          return Boolean(
            (prod?.id != null && prod.id !== '') ||
            (prod?.default_code && prod.default_code !== '') ||
            (prod?.name && prod.name !== '')
          );
        });

        if (validProducts.length === 0) {
          const bomNameKey = buildProductBaseKey(bom.name);
          const normalizedBomName = normalizeProductIdentifier(bom.name);
          console.log('🔎 Debug: BOM has no explicit products, checking name/consumptions', {
            bomName: bom.name,
            bomNameKey,
            normalizedBomName,
          });
          if (bomNameKey && (poProductBaseKeys.has(bomNameKey) || poProductNameKeys.has(bomNameKey) || nameMatchesKey(bomNameKey, poProductBaseKeys) || nameMatchesKey(bomNameKey, poProductNameKeys))) {
            return true;
          }

          if (normalizedBomName && (poProductNameKeys.has(normalizedBomName) || poProductBaseKeys.has(normalizedBomName) || nameMatchesKey(normalizedBomName, poProductBaseKeys) || nameMatchesKey(normalizedBomName, poProductNameKeys))) {
            return true;
          }

          const consumptionMatch = (bom.lines || []).some(line => {
            const consumptions = (line as any)?.consumptions;
            if (!Array.isArray(consumptions)) return false;
            return consumptions.some((consumption: any) => {
              const value = normalizeProductIdentifier(consumption?.attribute_value);
              if (!value) return false;
              const baseValue = buildProductBaseKey(consumption?.attribute_value);
              const matches = poProductNameKeys.has(value) ||
                poProductBaseKeys.has(value) ||
                (baseValue && poProductBaseKeys.has(baseValue)) ||
                nameMatchesKey(value, poProductBaseKeys) ||
                nameMatchesKey(value, poProductNameKeys) ||
                (baseValue && (nameMatchesKey(baseValue, poProductBaseKeys) || nameMatchesKey(baseValue, poProductNameKeys)));
              if (matches) {
                console.log('✅ Debug: BOM consumption matched PO product', {
                  bomName: bom.name,
                  consumption: consumption?.attribute_value,
                  normalized: value,
                  baseValue,
                });
              }
              return poProductNameKeys.has(value) ||
                poProductBaseKeys.has(value) ||
                (baseValue && poProductBaseKeys.has(baseValue));
            });
          });

          if (!consumptionMatch) {
            const rawMaterialMatch = (bom.lines || []).some(line => {
              const rawName = normalizeProductIdentifier((line as any)?.raw_material?.name);
              const baseRaw = buildProductBaseKey((line as any)?.raw_material?.name);
              const matched = nameMatchesKey(rawName, poProductNameKeys) ||
                nameMatchesKey(rawName, poProductBaseKeys) ||
                (baseRaw && (nameMatchesKey(baseRaw, poProductNameKeys) || nameMatchesKey(baseRaw, poProductBaseKeys)));
              if (matched) {
                console.log('✅ Debug: BOM raw material matched PO product keywords', {
                  bomName: bom.name,
                  rawMaterial: (line as any)?.raw_material?.name,
                  normalizedRaw: rawName,
                  baseRaw,
                });
              }
              return matched;
            });

            if (!rawMaterialMatch) {
              console.log('⛔ Debug: BOM consumption/raw materials did not match PO products', {
                bomName: bom.name,
                consumptions: (bom.lines || []).flatMap(line => (line as any)?.consumptions || []),
                rawMaterials: (bom.lines || []).map(line => (line as any)?.raw_material?.name),
              });
            }

            if (rawMaterialMatch) {
              return true;
            }

            const variantMatch = (bom.lines || []).some(line => {
              const variants = extractVariantNamesFromNotes((line as any)?.notes);
              return variants.some(variant => {
                const normalized = normalizeProductIdentifier(variant);
                if (!normalized) return false;
                const baseVariant = buildProductBaseKey(variant);
                const matches =
                  poProductNameKeys.has(normalized) ||
                  poProductBaseKeys.has(normalized) ||
                  (baseVariant && poProductBaseKeys.has(baseVariant)) ||
                  nameMatchesKey(normalized, poProductNameKeys) ||
                  nameMatchesKey(normalized, poProductBaseKeys) ||
                  (baseVariant && (nameMatchesKey(baseVariant, poProductNameKeys) || nameMatchesKey(baseVariant, poProductBaseKeys)));
                if (matches) {
                  console.log('✅ Debug: BOM variant note matched PO product', {
                    bomName: bom.name,
                    variant,
                    normalized,
                    baseVariant,
                  });
                }
                return matches;
              });
            });

            if (!variantMatch) {
              console.log('⛔ Debug: BOM variant notes did not match PO products', {
                bomName: bom.name,
                variants: (bom.lines || []).flatMap(line => extractVariantNamesFromNotes((line as any)?.notes)),
              });
            }

            return variantMatch;
          }

          return consumptionMatch;
        }

        let anyMatch = false;

        validProducts.forEach(prod => {
          const id = prod.id != null ? String(prod.id) : null;
          let codeValue = prod.default_code ?? (prod as any).code ?? null;
          if (!codeValue && prod.name) {
            codeValue = extractCodeFromName(prod.name);
          }
          const code = codeValue ? codeValue.toString().toLowerCase() : '';
          const colourValue = (prod as any).colour ?? (prod as any).color ?? null;
          const sizeValue = (prod as any).size ?? null;
          const nameKey = buildProductMatchKey(prod.name, colourValue, sizeValue);
          const baseKey = buildProductBaseKey(prod.name);
          let fallbackKey = '';
          let fallbackBaseKey = '';

          if (!nameKey && id && poProductsById.has(id)) {
            const poProduct = poProductsById.get(id);
            fallbackKey =
              poProduct?.match_key ||
              buildProductMatchKey(
                poProduct?.name,
                poProduct?.colour ?? poProduct?.color,
                poProduct?.size
              );
            fallbackBaseKey =
              poProduct?.base_match_key ||
              buildProductBaseKey(poProduct?.name);
          }

          const effectiveNameKey = nameKey || fallbackKey;
          const effectiveBaseKey = baseKey || fallbackBaseKey;
          const normalizedName = normalizeProductIdentifier(prod.name);

          const idMatch = Boolean(id && poProductIds.has(id));
          const codeMatch = Boolean(code && poProductCodes.has(code));
          const nameMatch = Boolean(effectiveNameKey && poProductMatchKeys.has(effectiveNameKey));
          const baseMatch = Boolean(effectiveBaseKey && poProductBaseKeys.has(effectiveBaseKey));
          const nameKeyMatch = Boolean(normalizedName && (poProductNameKeys.has(normalizedName) || poProductBaseKeys.has(normalizedName) || nameMatchesKey(normalizedName, poProductNameKeys) || nameMatchesKey(normalizedName, poProductBaseKeys)));

          if (idMatch || codeMatch || nameMatch || baseMatch || nameKeyMatch) {
            console.log('✅ Debug: BOM product matched PO product', {
              bomName: bom.name,
              product: prod,
              idMatch,
              codeMatch,
              nameMatch,
              baseMatch,
              nameKeyMatch,
            });
            anyMatch = true;
          }
        });

        if (!anyMatch) {
          console.log('⛔ Debug: BOM products did not match PO products', {
            bomName: bom.name,
            associatedProducts,
          });
        }

        return anyMatch;
      };

      console.log(`📋 Debug: Processing ${poContext.products.length} products`);

      // Get BOMs for all products in the PO
      for (const product of poContext.products) {
        console.log('🔄 Debug: Processing product:', product);
        
        if (!product.id) {
          console.log('⚠️ Debug: Product has no ID, skipping:', product);
          continue;
        }
        
        try {
          console.log(`🔍 Debug: Looking for BOMs for product ID: ${product.id}, name: ${product.name}, code: ${product.default_code}`);
          
          // Try direct product ID lookup first
          const bomList = await bomService.getBOMsByProduct(product.id);
          console.log(`📊 Debug: Found ${bomList.length} BOMs for product ${product.id}:`, bomList);
          
          for (const bom of bomList) {
            console.log('🔍 Debug: Evaluating direct BOM', { id: bom.id, name: bom.name, products: bom.products, product_id: bom.product_id });
            if (!bomMatchesPOProducts(bom)) {
              console.log(`⏭️ Debug: Skipping BOM ${bom.name} (${bom.id}) because it does not match PO products`);
              continue;
            }

            if (!bomSet.has(bom.id)) {
              bomSet.add(bom.id);
              boms.push(bom);
              console.log(`✅ Debug: Added BOM: ${bom.name} (${bom.id})`);
            }
          }
          
          // If no BOMs found by direct lookup, try searching in all BOMs by product name/code
          if (bomList.length === 0) {
            console.log(`🔍 Debug: No direct BOMs found, searching all BOMs for product name/code matches`);
            const allBOMs = await bomService.getAllBOMs();
            console.log('📋 Debug: All BOM names:', allBOMs.map(b => ({ id: b.id, name: b.name, product_id: b.product_id }))); 
            console.log(`📋 Debug: Total BOMs in system: ${allBOMs.length}`);
            
            for (const bom of allBOMs) {
              // More flexible matching - check both directions and word matches
              const productName = product.name?.toLowerCase() || '';
              const productCode = product.default_code?.toLowerCase() || '';
              const bomName = bom.name?.toLowerCase() || '';

              if (!bomMatchesPOProducts(bom)) {
                continue;
              }

              // Extract meaningful words from names (remove brackets, dashes, etc.)
              const getCleanWords = (text: string) => {
                return text.replace(/[\[\]()-]/g, ' ').split(/\s+/).filter(word => word.length > 1);
              };
              
              const productWords = getCleanWords(productName);
              const bomWords = getCleanWords(bomName);
              
              // Check if BOM name is contained in product name or vice versa
              const bomInProduct = bomName && productName.includes(bomName);
              const productInBom = productName && bomName.includes(productName);
              
              // Check if product code matches
              const codeMatches = productCode && (bomName.includes(productCode) || productCode.includes(bomName));
              
              // Check if there are common significant words (length > 2)
              const commonWords = bomWords.filter(bomWord => 
                bomWord.length > 2 && productWords.some(productWord => 
                  productWord.includes(bomWord) || bomWord.includes(productWord)
                )
              );
              
              const hasCommonWords = commonWords.length > 0;
              
              if (bomInProduct || productInBom || codeMatches || hasCommonWords) {
                console.log(`🎯 Debug: Found potential BOM match: "${bom.name}" for product "${product.name}" (${product.default_code})`);
                console.log(`🔍 Debug: Match reason - bomInProduct: ${bomInProduct}, productInBom: ${productInBom}, codeMatches: ${codeMatches}, commonWords: [${commonWords.join(', ')}]`);
                if (!bomSet.has(bom.id)) {
                  bomSet.add(bom.id);
                  boms.push(bom);
                  console.log(`✅ Debug: Added BOM by name match: ${bom.name} (${bom.id})`);
                }
              }
            }
          }
        } catch (error) {
          console.error(`❌ Debug: Failed to get BOMs for product ${product.id}:`, error);
        }
      }
      
      console.log(`🎯 Debug: Total BOMs found: ${boms.length}`, boms);

      if (preferredBomIds.size) {
        const bomIdsPresent = new Set(boms.map(b => String(b.id)));
        const missingBomIds = Array.from(preferredBomIds).filter(id => !bomIdsPresent.has(id));

        for (const bomId of missingBomIds) {
          try {
            const bom = await bomService.getBOMById(bomId);
            if (bom && bomMatchesPOProducts(bom)) {
              bomSet.add(bom.id);
              boms.push(bom);
              console.log(`✅ Debug: Added BOM from marker assignment: ${bom.name} (${bom.id})`);
            }
          } catch (error) {
            console.warn(`⚠️ Debug: Failed to fetch BOM ${bomId} from marker assignment`, error);
          }
        }
      }

      let filteredBoms = boms;

      if (preferredBomIds.size) {
        filteredBoms = filteredBoms.filter(bom => preferredBomIds.has(String(bom.id)));
        console.log(`🎯 Debug: Filtered BOMs to marker assignments: ${filteredBoms.length}`);
      }

      filteredBoms = filteredBoms.filter(bomMatchesPOProducts);

      setAvailableBOMs(filteredBoms);
      if (filteredBoms.length > 0) {
        setShowBOMSelection(true);
        toast({
          title: 'BOMs Found',
          description: `Found ${filteredBoms.length} available BOMs for the selected context. Please select a BOM to calculate material requirements.`
        });

        if (filteredBoms.length === 1) {
          setSelectedBOM(filteredBoms[0]);
          await calculateBOMBasedRequirements(filteredBoms[0], poContext, marker);
        }
      } else {
        toast({
          title: 'No BOMs Found',
          description: 'No BOMs found for the products in this purchase order. You can create general goods issue instead.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to load available BOMs:', error);
      setAvailableBOMs([]);
    }
  };

  const handleCreateSupplierOption = async (label: string): Promise<SearchableOption | null> => {
    const trimmed = label.trim();
    if (!trimmed) {
      return null;
    }

    const existing = cuttingSuppliers.find(
      supplier => supplier.name.toLowerCase() === trimmed.toLowerCase()
    );

    if (existing) {
      const value = String(existing.id);
      setSelectedSupplierId(value);
      return { value, label: existing.name };
    }

    try {
      const created = await cuttingSupplierService.create(trimmed);
      setCuttingSuppliers(prev => {
        const next = [...prev, created];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      const value = String(created.id);
      setSelectedSupplierId(value);
      toast({ title: 'Supplier Added', description: `${created.name} is now available for selection.` });
      return { value, label: created.name };
    } catch (error: any) {
      toast({
        title: 'Failed to add supplier',
        description: error?.message || 'Unable to add supplier at the moment.',
        variant: 'destructive',
      });
      return null;
    }
  };

  // Helper: fetch total issued quantity per material for a given PO
  const fetchIssuedSoFarForPO = async (poNumberOrNumbers: string | string[]): Promise<Map<string, number>> => {
    const poNumbers = (Array.isArray(poNumberOrNumbers) ? poNumberOrNumbers : [poNumberOrNumbers])
      .filter((value): value is string => Boolean(value));

    const aggregate = new Map<string, number>();
    if (!poNumbers.length) return aggregate;

    for (const poNumber of poNumbers) {
      try {
        const { data: issues, error: issueErr } = await supabase
          .from('goods_issue')
          .select('id')
          .eq('reference_number', poNumber)
          .eq('status', 'issued');

        if (!issueErr && issues && issues.length > 0) {
          const issueIds = issues.map(i => i.id);
          const { data: lines, error: linesErr } = await supabase
            .from('goods_issue_lines')
            .select('raw_material_id, quantity_issued')
            .in('goods_issue_id', issueIds);
          if (!linesErr && lines) {
            for (const l of lines) {
              const key = l.raw_material_id?.toString();
              if (!key) continue;
              aggregate.set(key, (aggregate.get(key) || 0) + (Number(l.quantity_issued) || 0));
            }
            continue;
          }
        }

        // Fallback: derive from raw_material_inventory if it has po_number + transaction_type
        try {
          const { data, error } = await supabase
            .from('raw_material_inventory')
            .select('raw_material_id, quantity_available, quantity_on_hand, transaction_type, po_number')
            .eq('transaction_type', 'issue')
            .eq('po_number', poNumber);
          if (!error && data) {
            for (const row of data) {
              const key = String((row as any).raw_material_id);
              const qty = Math.abs(Number((row as any).quantity_available ?? (row as any).quantity_on_hand ?? 0));
              aggregate.set(key, (aggregate.get(key) || 0) + qty);
            }
            if (data.length) continue;
          }
        } catch {
        }

        // If transaction_type isn't available, fall back to negative rows by po_number only
        try {
          const { data, error } = await supabase
            .from('raw_material_inventory')
            .select('raw_material_id, quantity_available, quantity_on_hand, po_number')
            .eq('po_number', poNumber);
          if (!error && data) {
            for (const row of data) {
              const qoh = Number((row as any).quantity_on_hand ?? 0);
              const qav = Number((row as any).quantity_available ?? 0);
              const isNeg = qoh < 0 || qav < 0;
              if (!isNeg) continue;
              const key = String((row as any).raw_material_id);
              const qty = Math.abs(qoh !== 0 ? qoh : qav);
              aggregate.set(key, (aggregate.get(key) || 0) + qty);
            }
          }
        } catch {
          // ignore fallback errors per PO
        }
      } catch {
        // ignore single PO errors and continue
      }
    }

    return aggregate;
  };

  // Calculate material requirements based on selected BOM and PO quantities
const calculateBOMBasedRequirements = async (bom: BOMWithLines, purchaseOrder: any, markerOverride?: MarkerRequest | null) => {
    try {
      const materialRequirements: typeof bomMaterialRequirements = [];
      
      if (!bom.lines || bom.lines.length === 0) {
        setBomMaterialRequirements([]);
        return;
      }

      // Load issued quantities so far for this PO, grouped by material
      const poNumbers = issueTab === 'trims'
        ? (purchaseOrder?.po_number ? [purchaseOrder.po_number] : [])
        : purchaseOrder?.po_numbers?.length
          ? purchaseOrder.po_numbers
          : purchaseOrder?.po_number
            ? [purchaseOrder.po_number]
            : [];
      const issuedMap = poNumbers.length
        ? await fetchIssuedSoFarForPO(poNumbers)
        : new Map<string, number>();
      // Keep a copy for rendering per-material issued in category selections
      setIssuedByMaterial(new Map(issuedMap));

      // Check if this is a category-wise BOM
      // Helper to parse category info from legacy/hacky notes format: CATEGORY:{id}:{name}:[...]
      const parseCategoryFromNotes = (notes?: string): { id: number; name: string } | null => {
        if (!notes) return null;
        const match = notes.match(/CATEGORY:(\d+):([^:]+)(?::|$)/);
        if (!match) return null;
        return { id: Number(match[1]), name: match[2] };
      };

      // Helpers for size-aware fabric calculation
      const normalizeSize = (s: string): string => {
        const t = (s || '').toString().trim().toLowerCase();
        if (!t) return '';
        if (t === 'xxl' || t === '2xl') return '2xl';
        if (t === 'xl') return 'xl';
        if (t === 'l') return 'l';
        if (t === 'm') return 'm';
        if (t === 's') return 's';
        return t;
      };
      const extractSizeFromProductName = (name?: string): string => {
        if (!name) return '';
        // Try patterns like "CREDO- XL" (after dash)
        const dashIdx = name.lastIndexOf('-');
        if (dashIdx !== -1) {
          const candidate = normalizeSize(name.slice(dashIdx + 1).replace(/\W+/g, ''));
          if (candidate) return candidate;
        }
        // Try bracket default code like [CRXL]
        const bracket = name.match(/\[(.*?)\]/);
        if (bracket) {
          const code = bracket[1];
          if (/xl$/i.test(code)) return 'xl';
          if (/^crxl$/i.test(code)) return 'xl';
          if (/l$/i.test(code)) return 'l';
          if (/m$/i.test(code)) return 'm';
          if (/s$/i.test(code)) return 's';
          if (/2xl$/i.test(code) || /xxl$/i.test(code)) return '2xl';
        }
        // Fallback: look for size tokens
        const token = name.match(/\b(2xl|xxl|xl|l|m|s)\b/i);
        return normalizeSize(token?.[1] || '');
      };
      const parseSizeConsumptionsFromNotes = (notes?: string): Record<string, number> => {
        const map: Record<string, number> = {};
        if (!notes) return map;
        const text = notes.toString();
        // Pattern A: entries like "CRXL|XL|multicolour: 0.03 units (0% waste)"
        const pipeRe = /[^;\n]*\|(2xl|xxl|xl|l|m|s)\|[^:]*:\s*(\d+(?:\.\d+)?)/gi;
        let matchA: RegExpExecArray | null;
        while ((matchA = pipeRe.exec(text)) !== null) {
          const size = normalizeSize(matchA[1]);
          const val = parseFloat(matchA[2]);
          if (!isNaN(val)) map[size] = val;
        }
        // Pattern B: entries like "XL: 0.03" or "XL = 0.03"
        const directRe = /(2xl|xxl|xl|l|m|s)\s*[:=]\s*(\d+(?:\.\d+)?)/gi;
        let matchB: RegExpExecArray | null;
        while ((matchB = directRe.exec(text)) !== null) {
          const size = normalizeSize(matchB[1]);
          const val = parseFloat(matchB[2]);
          if (!isNaN(val)) map[size] = val;
        }
        return map;
      };

      if (bom.is_category_wise) {
        // For category-wise BOMs, show categories instead of specific materials
        for (const bomLine of bom.lines) {
          // Prefer explicit material_category; otherwise try to parse from notes
          const categoryInfo = bomLine.material_category || parseCategoryFromNotes(bomLine.notes || '');
          if (!categoryInfo) continue;

          // Calculate total quantity needed based on PO quantities
          let totalRequired = 0;
          
          const bomBaseQty = bom.quantity && bom.quantity > 0 ? bom.quantity : 1;
          const sizeMap = parseSizeConsumptionsFromNotes(bomLine.notes);
          for (const product of purchaseOrder.products || []) {
            const productQty = (Number(product.quantity) || Number(product.pending_qty) || Number(product.outstanding_qty) || 0);
            const sizeKey = extractSizeFromProductName(product.name);
            let perUnitConsumption: number;
            if (sizeKey && sizeMap[sizeKey] != null) {
              perUnitConsumption = (sizeMap[sizeKey] * (1 + (bomLine.waste_percentage || 0) / 100)) / bomBaseQty;
            } else {
              // Fallback to generic line quantity if size-specific not present
              perUnitConsumption = (bomLine.quantity * (1 + (bomLine.waste_percentage || 0) / 100)) / bomBaseQty;
            }
            totalRequired += perUnitConsumption * productQty;
          }

          // Get available inventory for this category
          const { data: categoryMaterials } = await supabase
            .from('raw_materials')
            .select('id, name, base_unit')
            .eq('category_id', categoryInfo.id)
            .eq('active', true);

          // Add category as a requirement entry
          const categoryIsFabric = isFabricCategory(categoryInfo.id, categoryInfo.name);

          materialRequirements.push({
            material_id: `category-${categoryInfo.id}`,
            material_name: `📁 ${categoryInfo.name} (Category)`,
            required_quantity: totalRequired,
            issued_so_far: (categoryMaterials || []).reduce((s, m) => s + (issuedMap.get(m.id.toString()) || 0), 0),
            issuing_quantity: 0,
            unit: bomLine.unit,
            available_quantity: 999999, // Categories don't have stock limits
            category_id: categoryInfo.id,
            category_materials: categoryMaterials || [],
            is_fabric: categoryIsFabric
          });
        }
      } else {
        // For regular BOMs, show specific materials
        for (const bomLine of bom.lines) {
          if (!bomLine.raw_material) continue;

          // Calculate total quantity needed based on PO quantities
          let totalRequired = 0;
          
          const bomBaseQty = bom.quantity && bom.quantity > 0 ? bom.quantity : 1;
          const rawMaterialCategoryName = bomLine.raw_material?.category?.name || bomLine.material_category?.name || '';
          const isFabricLine = Boolean(bomLine.fabric_usage) || isFabricCategory(bomLine.material_category?.id, rawMaterialCategoryName);
          const sizeMap = isFabricLine ? parseSizeConsumptionsFromNotes(bomLine.notes) : {};
          for (const product of purchaseOrder.products || []) {
            const productQty = (Number(product.quantity) || Number(product.pending_qty) || Number(product.outstanding_qty) || 0);
            let perUnitConsumption: number;
            if (isFabricLine) {
              const sizeKey = extractSizeFromProductName(product.name);
              if (sizeKey && sizeMap[sizeKey] != null) {
                perUnitConsumption = (sizeMap[sizeKey] * (1 + (bomLine.waste_percentage || 0) / 100)) / bomBaseQty;
              } else {
                // Fallback to generic quantity
                perUnitConsumption = (bomLine.quantity * (1 + (bomLine.waste_percentage || 0) / 100)) / bomBaseQty;
              }
            } else {
              perUnitConsumption = (bomLine.quantity * (1 + (bomLine.waste_percentage || 0) / 100)) / bomBaseQty;
            }
            totalRequired += perUnitConsumption * productQty;
          }

          if (totalRequired > 0) {
            const issuedSoFar = issuedMap.get(bomLine.raw_material_id.toString()) || 0;
            // Get available quantity from inventory if present
            const material = rawMaterials.find(m => m.id.toString() === bomLine.raw_material_id.toString());
            const availableQty = material?.inventory?.quantity_available || 0;
            materialRequirements.push({
              material_id: bomLine.raw_material_id.toString(),
              material_name: bomLine.raw_material.name,
              required_quantity: totalRequired,
              issued_so_far: issuedSoFar,
              issuing_quantity: 0,
              unit: bomLine.raw_material.base_unit,
              available_quantity: availableQty,
              is_fabric: isFabricLine
            });
          }
        }
      }

      const mergedRequirements = (() => {
        const map = new Map<string, typeof materialRequirements[number]>();
        materialRequirements.forEach(req => {
          const key = req.category_id ? `category-${req.category_id}` : req.material_id;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, { ...req });
            return;
          }

          const combineCategoryMaterials = () => {
            if (!existing.category_materials && !req.category_materials) return undefined;
            const combined = [...(existing.category_materials || []), ...(req.category_materials || [])];
            const seen = new Set<string>();
            return combined.filter(material => {
              const id = material?.id != null ? String(material.id) : JSON.stringify(material);
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            });
          };

          map.set(key, {
            ...existing,
            required_quantity: (Number(existing.required_quantity) || 0) + (Number(req.required_quantity) || 0),
            issued_so_far: Math.max(Number(existing.issued_so_far) || 0, Number(req.issued_so_far) || 0),
            category_materials: combineCategoryMaterials(),
            is_fabric: (existing.is_fabric ?? false) || (req.is_fabric ?? false),
          });
        });
        return Array.from(map.values());
      })();

      let adjustedRequirements = mergedRequirements;
      const rawMarkerKg = markerOverride ? parseNumeric((markerOverride as any)?.total_fabric_kg) : null;
      const markerRequirementForScaling = markerOverride
        ? extractMarkerFabricKg(markerOverride, (markerOverride as any)?.details) ?? rawMarkerKg ?? markerTotalRequirement
        : markerTotalRequirement;
      const isFabricRequirement = (req: typeof mergedRequirements[number]) => {
        if (req.is_fabric === true) return true;
        if (req.is_fabric === false) return false;
        return req.category_id ? isFabricCategory(req.category_id, req.material_name) : isFabricMaterialId(req.material_id);
      };

      if (issueTab === 'fabric' && (markerOverride || selectedMarkerRequest) && markerRequirementForScaling != null) {
        // If marker has explicit fabric assignments, restrict scaling only to those materials
        const assignedMaterialIds = new Set<string>(
          [
            ...(((markerOverride as any)?.fabric_assignments as MarkerFabricAssignment[] | null | undefined) ?? []),
            ...(((markerOverride as any)?.fabric_assignment ? [(markerOverride as any).fabric_assignment] : []) as MarkerFabricAssignment[]),
          ]
            .map(a => (a?.raw_material_id != null ? String(a.raw_material_id) : null))
            .filter((id): id is string => Boolean(id))
        );

        const relevantRequirements = assignedMaterialIds.size > 0
          ? mergedRequirements.filter(req => !req.category_id && assignedMaterialIds.has(req.material_id))
          : mergedRequirements.filter(isFabricRequirement);
        const totalRelevant = relevantRequirements.reduce((sum, req) => sum + (Number(req.required_quantity) || 0), 0);
        console.log('🧮 Scaling BOM requirements (fabric subset)', {
          markerRequirementForScaling,
          totalRelevant,
          relevantRequirements,
        });

        if (totalRelevant > 0) {
          const scale = markerRequirementForScaling / totalRelevant;
          adjustedRequirements = mergedRequirements.map(req => {
            const isRelevant = assignedMaterialIds.size > 0
              ? (!req.category_id && assignedMaterialIds.has(req.material_id))
              : isFabricRequirement(req);
            if (!isRelevant) return req;
            return {
              ...req,
              required_quantity: (Number(req.required_quantity) || 0) * scale
            };
          });
        } else if (relevantRequirements.length > 0) {
          adjustedRequirements = mergedRequirements.map(req => {
            const isRelevant = assignedMaterialIds.size > 0
              ? (!req.category_id && assignedMaterialIds.has(req.material_id))
              : isFabricRequirement(req);
            if (!isRelevant) return req;
            const isFirst = relevantRequirements[0] === req;
            return {
              ...req,
              required_quantity: isFirst ? markerRequirementForScaling : 0
            };
          });
        }

        const scaledRelevantTotal = adjustedRequirements
          .filter(req => (assignedMaterialIds.size > 0
            ? (!req.category_id && assignedMaterialIds.has(req.material_id))
            : isFabricRequirement(req)))
          .reduce((sum, req) => sum + (Number(req.required_quantity) || 0), 0);
        if (markerRequirementForScaling > 0 && scaledRelevantTotal > 0 && Math.abs(scaledRelevantTotal - markerRequirementForScaling) > 1e-6) {
          const ratio = markerRequirementForScaling / scaledRelevantTotal;
          adjustedRequirements = adjustedRequirements.map(req => {
            const isRelevant = assignedMaterialIds.size > 0
              ? (!req.category_id && assignedMaterialIds.has(req.material_id))
              : isFabricRequirement(req);
            if (!isRelevant) return req;
            return {
              ...req,
              required_quantity: (Number(req.required_quantity) || 0) * ratio
            };
          });
        }

        console.log('🧮 Scaled BOM requirements result (fabric subset)', {
          markerRequirementForScaling,
          adjustedRequirements,
          totalAfterScale: adjustedRequirements
            .filter(isFabricRequirement)
            .reduce((sum, req) => sum + (Number(req.required_quantity) || 0), 0),
        });
      }

      // Filter based on tab
      const filterFn = (req: typeof adjustedRequirements[number]) => {
        const isFab = isFabricRequirement(req);
        if (issueTab !== 'fabric') return !isFab;
        // In fabric tab: if marker assigns specific materials, only include those
        const assignedMaterialIds = new Set<string>(
          [
            ...(((markerOverride as any)?.fabric_assignments as MarkerFabricAssignment[] | null | undefined) ?? []),
            ...(((markerOverride as any)?.fabric_assignment ? [(markerOverride as any).fabric_assignment] : []) as MarkerFabricAssignment[]),
          ]
            .map(a => (a?.raw_material_id != null ? String(a.raw_material_id) : null))
            .filter((id): id is string => Boolean(id))
        );
        if (assignedMaterialIds.size > 0) {
          return !req.category_id && assignedMaterialIds.has(req.material_id);
        }
        return isFab;
      };
      const filtered = adjustedRequirements.filter(filterFn);
      console.log('📋 Final BOM requirements for UI', {
        issueTab,
        markerRequirementForScaling,
        adjustedRequirements,
        filtered,
        totalFiltered: filtered.reduce((sum, req) => sum + (Number(req.required_quantity) || 0), 0),
      });
      setBomMaterialRequirements(filtered);

      if (mergedRequirements.length === 0) {
        toast({
          title: 'No Requirements Calculated',
          description: 'Could not derive quantities from PO items. Please verify PO line quantities and BOM base quantity.',
          variant: 'destructive'
        });
      }
      
      // Auto-populate form lines based on BOM requirements
      setFormData(prev => ({
        ...prev,
        lines: []
      }));

    } catch (error) {
      console.error('Failed to calculate BOM-based requirements:', error);
      setBomMaterialRequirements([]);
    }
  };

  // Handle BOM selection
  const handleBOMSelection = async (bomId: string) => {
    if (!bomId) return;
    const bom = availableBOMs.find(b => String(b.id) === String(bomId));
    if (bom && activePOContext) {
      setSelectedBOM(bom);
      await calculateBOMBasedRequirements(bom, activePOContext, selectedMarkerRequest);
    }
  };

  const resolveMarkerOptionsForOrder = (order: any): MarkerRequest[] => {
    if (!order || !order.id) return [];
    const orderId = String(order.id);
    return markerRequests.filter(marker => Array.isArray(marker.po_ids) && marker.po_ids.some(poId => String(poId) === orderId));
  };

  const applyMarkerSelection = async (marker: MarkerRequest, fallbackOrder?: any) => {
    if (!marker) return;
    console.log('🧾 Selected marker raw data:', marker);
    console.log('🧾 Marker details keys:', marker?.details ? Object.keys(marker.details) : null);

    const markerPoIds = Array.from(new Set((marker.po_ids || []).map(id => String(id)).filter(Boolean)));
    const resolvedOrders = markerPoIds
      .map(id => purchaseOrderMap.get(id))
      .filter((po): po is any => Boolean(po));

    if (!resolvedOrders.length && fallbackOrder) {
      resolvedOrders.push(fallbackOrder);
    }

    if (!resolvedOrders.length) {
      toast({
        title: 'Marker Purchase Orders Missing',
        description: `Could not resolve purchase orders for marker ${marker.marker_number}.`
      });
      return;
    }

    setSelectedMarkerRequest(marker);
    setFormData(prev => ({
      ...prev,
      reference_number: marker.marker_number || prev.reference_number,
    }));

    if (issueTab === 'trims') {
      const effectiveOrder = fallbackOrder || selectedPurchaseOrder || resolvedOrders[0] || null;
      const singleOrders = effectiveOrder ? [effectiveOrder] : [];
      setLinkedPurchaseOrders(singleOrders);
      setSelectedPurchaseOrder(effectiveOrder ?? null);

      if (effectiveOrder) {
        const context = buildPOContext(singleOrders);
        if (context) {
          setActivePOContext(context);
          setSelectedBOM(null);
          setBomMaterialRequirements([]);
          setShowBOMSelection(false);
          await loadAvailableBOMs(context);
        }
      }
      return;
    }

    setLinkedPurchaseOrders(resolvedOrders);
    setSelectedPurchaseOrder(fallbackOrder || resolvedOrders[0]);

    const context = buildPOContext(resolvedOrders, marker);
    if (context) {
      setActivePOContext(context);

      setSelectedBOM(null);
      setBomMaterialRequirements([]);
      setShowBOMSelection(false);

      await loadAvailableBOMs(context, marker);
    }
  };

  const handleMarkerSelectionChange = async (markerId: string, fallbackOrder?: any) => {
    if (!markerId) {
      setSelectedMarkerRequest(null);
      if (fallbackOrder) {
        const context = buildPOContext([fallbackOrder]);
        if (context) {
          setActivePOContext(context);
          setLinkedPurchaseOrders([fallbackOrder]);
          setSelectedBOM(null);
          setBomMaterialRequirements([]);
          setShowBOMSelection(false);

          await loadAvailableBOMs(context);
        }
      }
      return;
    }

    const marker = markerRequests.find(m => String(m.id) === String(markerId));
    if (marker) {
      await applyMarkerSelection(marker, fallbackOrder);
    }
  };

  // Update issuing quantity for a specific material
  const updateIssuingQuantity = (materialId: string, quantity: number) => {
    setBomMaterialRequirements(prev => 
      prev.map(req => 
        req.material_id === materialId 
          ? { ...req, issuing_quantity: Math.max(0, quantity) }
          : req
      )
    );
    
    // Update form lines
    setFormData(prev => {
      const exists = prev.lines.some(l => l.raw_material_id === materialId);
      const newLines = exists
        ? prev.lines.map(line => line.raw_material_id === materialId
            ? { ...line, quantity_issued: Math.max(0, quantity) }
            : line)
        : (quantity > 0
            ? [...prev.lines, { raw_material_id: materialId, quantity_issued: Math.max(0, quantity), batch_number: '', notes: '' }]
            : prev.lines);
      return { ...prev, lines: newLines };
    });
  };

  // Fabric scan handlers (Goods Issue)
  const startScanForMaterial = (materialId: string) => {
    setGiCurrentMaterialId(materialId);
    setGiShowBarcodeCamera(true);
    setGiCurrentCategoryKey(null);
  };

  const startScanForCategoryMaterial = (categoryId: number, materialId: number) => {
    setGiCurrentMaterialId(materialId.toString());
    setGiCurrentCategoryKey(`category-${categoryId}`);
    setGiShowBarcodeCamera(true);
  };

  const startScanForCategory = (categoryId: number) => {
    setGiCurrentMaterialId(null);
    setGiCurrentCategoryKey(`category-${categoryId}`);
    setGiShowBarcodeCamera(true);
  };

  const handleBarcodeScannedGI = async (barcode: string) => {
    try {
      // Look up barcode from Goods Received lines
      const { data: lines, error } = await supabase
        .from('goods_received_lines')
        .select('raw_material_id, roll_barcode, roll_weight, roll_length')
        .eq('roll_barcode', barcode)
        .limit(1);
      if (error) throw error;

      if (!lines || lines.length === 0) {
        toast({ title: 'Roll Not Found', description: 'This barcode has not been received in Goods Received.', variant: 'destructive' });
        return;
      }

      const line = lines[0];
      // Fetch material to validate category and get unit
      const { data: material } = await supabase
        .from('raw_materials')
        .select('id, name, category_id, purchase_unit')
        .eq('id', line.raw_material_id)
        .single();

      // Validate Fabric category and target
      const isFabric = material?.category_id === 1 || (material?.name || '').toLowerCase().includes('fabric');
      if (!isFabric) {
        toast({ title: 'Not Fabric Category', description: 'Scanned roll is not in the Fabric category.', variant: 'destructive' });
        return;
      }

      // If scanning under a category row, ensure the scanned roll's material belongs to that category
      if (giCurrentCategoryKey) {
        const expectedCategoryId = Number(giCurrentCategoryKey.replace('category-', '')) || null;
        if (expectedCategoryId && material?.category_id !== expectedCategoryId) {
          toast({ title: 'Wrong Category', description: 'Scanned roll does not belong to the selected category.', variant: 'destructive' });
          return;
        }
      }

      // If we are scanning at category level (no material selected), adopt the detected material
      if (!giCurrentMaterialId && giCurrentCategoryKey) {
        setGiCurrentMaterialId(String(material?.id));
      }

      const expectedMaterialId = giCurrentMaterialId || String(material?.id);

      // If scanning under a specific material row, ensure it matches
      if (giCurrentMaterialId && String(material?.id) !== String(expectedMaterialId)) {
        // If scanning under category mode, allow only if the selected category matches Fabric; otherwise block
        toast({ title: 'Different Material', description: 'This roll belongs to a different material.', variant: 'destructive' });
        return;
      }

      const unit = (material?.purchase_unit || 'kg').toLowerCase();
      const isWeightMode = unit.includes('kg');
      const recordedWeight = Number(line.roll_weight) || 0;
      const recordedLength = Number((line as any).roll_length) || 0;

      // When scanned, bring up the overlay with the recorded value filled
      setGiScannedBarcode(barcode);
      if (isWeightMode) {
        if (recordedWeight <= 0) {
          toast({ title: 'Invalid Roll', description: 'This roll has no recorded weight in GRN.', variant: 'destructive' });
          return;
        }
        setGiRollWeight(recordedWeight);
        setGiRollLength(0);
      } else {
        if (recordedLength <= 0) {
          toast({ title: 'Invalid Roll', description: 'This roll has no recorded length in GRN.', variant: 'destructive' });
          return;
        }
        setGiRollWeight(0);
        setGiRollLength(recordedLength);
      }
      setGiShowWeightEntry(true);
    } catch (err: any) {
      toast({ title: 'Scan Error', description: err?.message || 'Failed to validate scanned roll.', variant: 'destructive' });
    }
  };

  const handleAddScannedRollGI = () => {
    if (!giCurrentMaterialId || !giScannedBarcode) return;

    const mat = rawMaterials.find(m => m.id.toString() === giCurrentMaterialId);
    const unit = (mat?.purchase_unit || 'kg').toLowerCase();
    const isWeightMode = unit.includes('kg');
    const primary = isWeightMode ? giRollWeight : giRollLength;
    if (!primary || primary <= 0) return;

    setGiFabricRolls(prev => {
      const existing = prev[giCurrentMaterialId] || [];
      if (existing.some(r => r.barcode === giScannedBarcode)) {
        toast({ title: 'Duplicate Barcode', description: 'This roll is already scanned for this material.', variant: 'destructive' });
        return prev;
      }
      const updated = {
        ...prev,
        [giCurrentMaterialId]: [...existing, { barcode: giScannedBarcode, weight: giRollWeight, length: giRollLength }]
      };
      // Update issuing quantity to total scanned quantity based on unit
      const total = updated[giCurrentMaterialId].reduce((s, r) => s + (isWeightMode ? (r.weight || 0) : (r.length || 0)), 0);
      updateIssuingQuantity(giCurrentMaterialId, total);
      // If scanning under a category selection, mirror into categorySelections to reflect in UI input
      if (giCurrentCategoryKey) {
        setCategorySelections(prev => ({
          ...prev,
          [giCurrentCategoryKey]: (prev[giCurrentCategoryKey]?.filter(i => i.materialId !== Number(giCurrentMaterialId)) || [])
            .concat(total > 0 ? [{ materialId: Number(giCurrentMaterialId), quantity: total }] : [])
        }));
      }
      return updated;
    });

    // Reset for next scan but keep scanner open
    setGiScannedBarcode('');
    setGiRollWeight(0);
    setGiRollLength(0);
    setGiShowWeightEntry(false);
  };

  const handleRemoveScannedRollGI = (barcode: string) => {
    if (!giCurrentMaterialId) return;
    setGiFabricRolls(prev => {
      const updatedList = (prev[giCurrentMaterialId] || []).filter(r => r.barcode !== barcode);
      const total = updatedList.reduce((s, r) => s + r.weight, 0);
      updateIssuingQuantity(giCurrentMaterialId, total);
      return { ...prev, [giCurrentMaterialId]: updatedList };
    });
  };

  const handleFinishScanningGI = () => {
    setGiShowBarcodeCamera(false);
    setGiShowWeightEntry(false);
    setGiScannedBarcode('');
    setGiRollWeight(0);
    setGiRollLength(0);
    setGiCurrentMaterialId(null);
    setGiCurrentCategoryKey(null);
    // Ensure the Goods Issue dialog remains open after closing scanner
    setIsCreateDialogOpen(true);
  };

  // Restrict scanning to Fabric only (category_id === 1, or name contains 'fabric')
  const isFabricMaterialId = (materialId: string): boolean => {
    const requirement = bomMaterialRequirements.find(req => !req.category_id && req.material_id === materialId);
    if (requirement?.is_fabric === true) return true;
    if (requirement?.is_fabric === false) return false;

    const mat = rawMaterials.find(m => m.id.toString() === materialId);
    if (!mat) return false;
    if ((mat as any).category_id === 1 || mat.category?.id === 1) return true;
    const categoryName = mat.category?.name || '';
    return categoryName.toLowerCase().includes('fabric');
  };

  const isFabricCategory = (categoryId?: number, categoryName?: string): boolean => {
    if (categoryId === 1) return true;
    return (categoryName || '').toLowerCase().includes('fabric');
  };

  const handlePOSelection = async (orderId: string) => {
    if (!orderId) return;
    const order = purchaseOrders.find(o => String(o.id) === orderId);
    if (order) {
      setSelectedPurchaseOrder(order);
      setSelectedMarkerRequest(null);
      setMarkerOptionsForPO([]);
      setLinkedPurchaseOrders([order]);

      if (issueTab === 'trims') {
        setLegacySupplier(order.partner_name || '');
        setSelectedSupplierId('');
      } else if (order.partner_name) {
        const match = cuttingSuppliers.find(
          supplier => supplier.name.toLowerCase() === order.partner_name.toLowerCase()
        );
        setSelectedSupplierId(match ? String(match.id) : '');
        setLegacySupplier('');
      } else {
        setSelectedSupplierId('');
        setLegacySupplier('');
      }

      const context = buildPOContext([order]);
      if (context) {
        setActivePOContext(context);
      }
      setFormData(prev => ({
        ...prev,
        // Tie issues to this PO so issued-so-far can be computed
        reference_number: order.po_number || order.name || prev.reference_number,
        issue_type: 'production',
        lines: [] // Clear existing lines
      }));

      // Reset BOM selection states
      setSelectedBOM(null);
      setBomMaterialRequirements([]);
      setShowBOMSelection(false);

      // Load available BOMs for the products in this PO
      if (context) {
        await loadAvailableBOMs(context);
      }

      const markersForOrder = resolveMarkerOptionsForOrder(order);
      setMarkerOptionsForPO(markersForOrder);

      if (markersForOrder.length === 1) {
        await applyMarkerSelection(markersForOrder[0], order);
        toast({
          title: 'Marker Linked',
          description: `Marker ${markersForOrder[0].marker_number} auto-selected for this purchase order.`,
        });
      } else if (markersForOrder.length > 1) {
        toast({
          title: 'Select Marker Request',
          description: 'Multiple marker requests found for this purchase order. Please choose one to continue.',
        });
      }
    }
  };

  const handleCreateIssue = async () => {
    try {
      // Enforce issue date must be today
      const today = new Date().toISOString().split('T')[0];
      if (formData.issue_date !== today) {
        setFormData(prev => ({ ...prev, issue_date: today }));
      }

      if (formData.lines.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please add at least one line item',
          variant: 'destructive'
        });
        return;
      }

      // Require a marker request for fabric issues regardless of availability list
      if (issueTab === 'fabric' && !selectedMarkerRequest) {
        toast({
          title: 'Marker Request Required',
          description: 'Select a marker request before creating a fabric goods issue.',
          variant: 'destructive',
        });
        return;
      }

      // For general issues, allow without PO/BOM; for trims, still require supplier
      if (issueTab === 'trims' && !selectedSupplierName) {
        toast({ title: 'Validation Error', description: 'Please select a supplier for trims issue', variant: 'destructive' });
        return;
      }

      // Sanitize lines: only numeric material ids and positive quantities
      const cleanedLines = formData.lines.filter(l => Number(l.quantity_issued) > 0 && /^\d+$/.test(String(l.raw_material_id)));
      if (cleanedLines.length === 0) {
        toast({ title: 'Validation Error', description: 'No valid line items to issue.', variant: 'destructive' });
        return;
      }

      const requirementResult = computeRequirementCheck(cleanedLines);
      setRequirementCheck(prev => requirementChecksEqual(prev, requirementResult) ? prev : requirementResult);
      let approvalNote: string | undefined;
      if (requirementResult.needsApproval) {
        toast({
          title: 'Approval Required',
          description: 'Issued quantities exceed the selected requirement. Issue will be saved with approval note.',
          variant: 'destructive',
        });
        const detailText = requirementResult.details.length ? ` - ${requirementResult.details.join(' | ')}` : '';
        approvalNote = `APPROVAL_PENDING: ${requirementMode.toUpperCase()}${detailText}`;
      }

      setLoading(true);
      // Build category totals summary to persist in notes for accurate PDFs after refresh
      let categoryTotalsNote: string | undefined = undefined;
      if (bomMaterialRequirements && bomMaterialRequirements.some(r => r.category_id)) {
        const totals: Record<string, number> = {};
        for (const r of bomMaterialRequirements) {
          if (!r.category_id) continue;
          const name = r.material_name
            .replace(/^📁\s*/, '')
            .replace(/\s*\(Category\)\s*$/, '');
          totals[name] = Number(r.required_quantity || 0);
        }
        const parts = Object.entries(totals).map(([k, v]) => `${k}=${v}`);
        if (parts.length) categoryTotalsNote = `CATEGORY_TOTALS: ${parts.join(' | ')}`;
      }

      const referenceNumber = formData.reference_number
        || selectedMarkerRequest?.marker_number
        || activePOContext?.marker_number
        || selectedPurchaseOrder?.po_number
        || selectedPurchaseOrder?.name;

      const linkedPoNote = selectedMarkerRequest && linkedPurchaseOrders.length
        ? `POs: ${linkedPurchaseOrders.map(po => po.po_number || po.name).filter(Boolean).join(', ')}`
        : undefined;

      const markerNote = selectedMarkerRequest
        ? `Marker: ${selectedMarkerRequest.marker_number} (${selectedMarkerRequest.marker_type})`
        : undefined;

      const requirementNote = requirementResult.mode !== 'none'
        ? `Requirement Mode: ${requirementMode.toUpperCase()} | Issued=${formatNumeric(requirementResult.totalIssued, 3) ?? requirementResult.totalIssued}${requirementMode === 'marker' && markerRequirementUnit ? ` ${markerRequirementUnit}` : ''}${requirementResult.limit != null ? ` | Limit=${formatNumeric(requirementResult.limit, 3) ?? requirementResult.limit}${requirementMode === 'marker' && markerRequirementUnit ? ` ${markerRequirementUnit}` : ''}` : ''}${requirementResult.details.length && !requirementResult.needsApproval ? ` | ${requirementResult.details.join(' | ')}` : ''}`
        : undefined;

      const newIssue = await goodsIssueService.createGoodsIssue({
        ...formData,
        reference_number: referenceNumber,
        lines: cleanedLines,
        notes: [
          issueTab === 'trims' && selectedSupplierName ? `Supplier: ${selectedSupplierName}` : undefined,
          categoryTotalsNote,
          markerNote,
          linkedPoNote,
          requirementNote,
          approvalNote,
        ].filter(Boolean).join('\n') || undefined,
      });
      setGoodsIssues(prev => [newIssue, ...prev]);
      // Mark scanned fabric barcodes as issued (tracking-only) so stock barcode view matches on-hand
      try {
        const allEntries = Object.entries(giFabricRolls || {});
        for (const [materialId, arr] of allEntries) {
          const codes = (arr || []).map((r: any) => r.barcode).filter(Boolean);
          if (codes.length) {
            await rawMaterialsService.markRollsIssuedByBarcodes(Number(materialId), codes as string[]);
          }
        }
      } catch (e) {
        console.warn('Failed to mark scanned rolls as issued:', e);
      }
      // Refresh local materials and notify other views to refresh inventory
      try {
        const mats = await rawMaterialsService.getRawMaterials();
        setRawMaterials(mats);
        // Recompute BOM requirements view to refresh available stock columns
        if (selectedBOM && activePOContext) {
          await calculateBOMBasedRequirements(selectedBOM, activePOContext, selectedMarkerRequest);
        }
        window.dispatchEvent(new CustomEvent('inventory-updated'));
      } catch {}
      
      const successMessage = `Goods Issue ${newIssue.issue_number} created and issued`;
      
      toast({
        title: 'Success',
        description: successMessage
      });

      handleCloseCreateDialog();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create goods issue',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddLine = () => {
    if (!currentLine.raw_material_id || currentLine.quantity_issued <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select a material and specify quantity',
        variant: 'destructive'
      });
      return;
    }

    const material = rawMaterials.find(m => m.id.toString() === currentLine.raw_material_id);
    if (!material) return;

    // Check if material already exists in lines
    const existingLineIndex = formData.lines.findIndex(line => 
      line.raw_material_id === currentLine.raw_material_id
    );

    if (existingLineIndex >= 0) {
      // Update existing line
      setFormData(prev => ({
        ...prev,
        lines: prev.lines.map((line, index) => 
          index === existingLineIndex 
            ? { ...line, quantity_issued: line.quantity_issued + currentLine.quantity_issued }
            : line
        )
      }));
    } else {
      // Add new line
      setFormData(prev => ({
        ...prev,
        lines: [...prev.lines, { ...currentLine }]
      }));
    }

    setCurrentLine({
      raw_material_id: '',
      quantity_issued: 0,
      batch_number: '',
      notes: ''
    });
  };

  const handleRemoveLine = (index: number) => {
    setFormData(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateLineQuantity = (index: number, quantity: number) => {
    setFormData(prev => ({
      ...prev,
      lines: prev.lines.map((line, i) => 
        i === index ? { ...line, quantity_issued: quantity } : line
      )
    }));
  };

  const handleCloseCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setIssueMode('po'); // Reset to PO mode
    setSelectedPO(null);
    setSelectedProductionOrder(null);
    setSelectedPurchaseOrder(null);
    setBomRequirements({});
    setFormData({
      issue_date: new Date().toISOString().split('T')[0],
      issue_type: 'production',
      reference_number: undefined,
      notes: undefined,
      lines: []
    });
    setCurrentLine({
      raw_material_id: '',
      quantity_issued: 0,
      batch_number: '',
      notes: ''
    });
  };

  const handleViewIssue = (issue: GoodsIssue) => {
    setSelectedIssue(issue);
    setIsViewDialogOpen(true);
  };

  const handleIssueGoods = async (id: string) => {
    try {
      await goodsIssueService.issueGoods(id);
      setGoodsIssues(prev => prev.map(issue => 
        issue.id === id ? { ...issue, status: 'issued' } : issue
      ));
      
      toast({
        title: 'Success',
        description: 'Goods issued successfully. Inventory has been updated.'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to issue goods',
        variant: 'destructive'
      });
    }
  };

  const handleCancelIssue = async (id: string) => {
    try {
      await goodsIssueService.cancelGoodsIssue(id);
      setGoodsIssues(prev => prev.map(issue => 
        issue.id === id ? { ...issue, status: 'cancelled' } : issue
      ));
      
      toast({
        title: 'Success',
        description: 'Goods issue cancelled successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel goods issue',
        variant: 'destructive'
      });
    }
  };

  const getStatusColor = (status: GoodsIssue['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'issued': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeColor = (type: GoodsIssue['issue_type']) => {
    const typeInfo = ISSUE_TYPES.find(t => t.value === type);
    const color = typeInfo?.color || 'gray';
    return `bg-${color}-100 text-${color}-800 border-${color}-200`;
  };

  const getTypeIcon = (type: GoodsIssue['issue_type']) => {
    const typeInfo = ISSUE_TYPES.find(t => t.value === type);
    return typeInfo?.icon || Package;
  };

  const filteredIssues = goodsIssues.filter(issue =>
    issue.issue_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    issue.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    issue.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportIssuePdf = async (issue: GoodsIssue) => {
    try {
      // Try to fetch supplier name using reference_number (PO number)
      let supplierName: string | undefined = undefined;
      let issuedMap: Record<string, number> = {};
      let weightKgMap: Record<string, number> = {};
      try {
        // Supplier lookup (optional)
        if (issue.reference_number) {
          const { data: po } = await supabase
            .from('purchases')
            .select('partner_name, name')
            .eq('name', issue.reference_number)
            .maybeSingle();
          if (po?.partner_name) supplierName = po.partner_name as string;
        }

        // Issued so far by PO (aggregated across all past issues for this PO)
        if (issue.reference_number) {
          const mapByPo = await fetchIssuedSoFarForPO(issue.reference_number);
          const agg: Record<string, number> = {};
          for (const [k, v] of mapByPo.entries()) agg[k] = v;
          issuedMap = agg;
        }

        // Fetch weights for this issue number (current issue rows), fallback by PO
        const { data: rmiIssue } = await supabase
          .from('raw_material_inventory')
          .select('raw_material_id, quantity_available, quantity_on_hand, transaction_type, transaction_ref, weight_kg')
          .eq('transaction_ref', issue.issue_number);
        let rows = rmiIssue || [];
        // Fallback: match by PO number if no rows by issue_number
        if ((!rows || rows.length === 0) && issue.reference_number) {
          const { data: byPo } = await supabase
            .from('raw_material_inventory')
            .select('raw_material_id, quantity_available, quantity_on_hand, transaction_type, po_number, weight_kg')
            .eq('po_number', issue.reference_number);
          rows = byPo || [];
        }
        if (rows && rows.length) {
          const mapKg: Record<string, number> = {};
          for (const row of rows) {
            const qoh = Number((row as any).quantity_on_hand || 0);
            const qav = Number((row as any).quantity_available || 0);
            const isNeg = qoh < 0 || qav < 0;
            const isIssue = (row as any).transaction_type === 'issue' || (!row?.transaction_type && isNeg);
            if (!isIssue) continue;
            const key = String((row as any).raw_material_id);
            const wkg = Number((row as any).weight_kg || 0);
            if (!isNaN(wkg) && wkg > 0) mapKg[key] = (mapKg[key] || 0) + wkg;
          }
          weightKgMap = mapKg;
        }
      } catch {}

      // Fetch material names + categories for grouping
      const ids = Array.from(new Set((issue.lines || []).map(l => Number(l.raw_material_id)).filter(n => !isNaN(n))));
      let nameById: Record<string, string> = {};
      let categoryById: Record<string, string> = {};
      if (ids.length) {
        const { data: mats } = await supabase
          .from('raw_materials')
          .select('id, name, category:material_categories(name)')
          .in('id', ids);
        for (const m of (mats || [])) {
          nameById[String((m as any).id)] = (m as any).name;
          categoryById[String((m as any).id)] = (m as any).category?.name || 'Uncategorized';
        }
      }

      // If current UI has requirements loaded for this PO, pass category totals (both category-wise and regular rows)
      let categoryRequirementByName: Record<string, number> | undefined = undefined;
      if (bomMaterialRequirements?.length && issue.reference_number) {
        const referenceCandidates = [
          selectedMarkerRequest?.marker_number,
          ...(activePOContext?.po_numbers || []),
          activePOContext?.marker_number,
          selectedPurchaseOrder?.po_number,
          selectedPurchaseOrder?.name,
        ].filter(Boolean) as string[];
        const relatesToCurrentPO = referenceCandidates.includes(issue.reference_number || '');
        if (relatesToCurrentPO) {
          const totals: Record<string, number> = {};
          for (const req of bomMaterialRequirements) {
            if (req.category_id) {
              const name = req.material_name.replace(/^📁\s*/, '').replace(/\s*\(Category\)\s*$/, '');
              totals[name] = (totals[name] || 0) + Number(req.required_quantity || 0);
            } else {
              // Non-category row: find category name from rawMaterials
              const mat = rawMaterials.find(m => m.id.toString() === req.material_id);
              const cat = ((mat as any)?.category?.name || 'Uncategorized') as string;
              totals[cat] = (totals[cat] || 0) + Number(req.required_quantity || 0);
            }
          }
          categoryRequirementByName = totals;
          if (Object.keys(categoryRequirementByName).length === 0) categoryRequirementByName = undefined;
        }
      }

      await Promise.resolve(generateGoodsIssuePdf(issue, supplierName, issuedMap, nameById, categoryById, categoryRequirementByName, weightKgMap));
      toast({ title: 'PDF Generated', description: `Goods Issue ${issue.issue_number} downloaded` });
    } catch (e: any) {
      console.error('Failed to export Goods Issue PDF:', e);
      toast({ title: 'PDF Error', description: e?.message || 'Failed to generate PDF', variant: 'destructive' });
    }
  };

  // Export PDF for the currently viewed issue using on-screen requirements (ensures category totals match UI)
  const handleExportCurrentIssuePdf = async () => {
    if (!selectedIssue) return;
    try {
      // Build material name and category mappings from already loaded rawMaterials
      const ids = Array.from(new Set((selectedIssue.lines || []).map(l => Number(l.raw_material_id)).filter(n => !isNaN(n))));
      const nameById: Record<string, string> = {};
      const categoryById: Record<string, string> = {};
      for (const m of rawMaterials) {
        const idStr = m.id.toString();
        if (!ids.includes(Number(idStr))) continue;
        nameById[idStr] = m.name;
        categoryById[idStr] = (m as any).category?.name || 'Uncategorized';
      }

      // Compute issued map by PO (total issued so far for this PO)
      let issuedMap: Record<string, number> = {};
      let weightKgMap: Record<string, number> = {};
      try {
        if (selectedIssue.reference_number) {
          const mapByPo = await fetchIssuedSoFarForPO(selectedIssue.reference_number);
          for (const [k, v] of mapByPo.entries()) issuedMap[k] = v;
        }

        // For weights, start with current issue rows and fallback by PO
        const { data: rmiIssue } = await supabase
          .from('raw_material_inventory')
          .select('raw_material_id, quantity_available, quantity_on_hand, transaction_type, transaction_ref, weight_kg')
          .eq('transaction_ref', selectedIssue.issue_number);
        let rows = rmiIssue || [];
        if ((!rows || rows.length === 0) && selectedIssue.reference_number) {
          const { data: byPo } = await supabase
            .from('raw_material_inventory')
            .select('raw_material_id, quantity_available, quantity_on_hand, transaction_type, po_number, weight_kg')
            .eq('po_number', selectedIssue.reference_number);
          rows = byPo || [];
        }
        if (rows && rows.length) {
          const mapKg: Record<string, number> = {};
          for (const row of rows) {
            const qoh = Number((row as any).quantity_on_hand || 0);
            const qav = Number((row as any).quantity_available || 0);
            const isNeg = qoh < 0 || qav < 0;
            const isIssue = (row as any).transaction_type === 'issue' || (!row?.transaction_type && isNeg);
            if (!isIssue) continue;
            const key = String((row as any).raw_material_id);
            const wkg = Number((row as any).weight_kg || 0);
            if (!isNaN(wkg) && wkg > 0) mapKg[key] = (mapKg[key] || 0) + wkg;
          }
          weightKgMap = mapKg;
        }
      } catch {}

      // Derive category total requirements from UI state (both category-wise and regular rows)
      const categoryRequirementByName: Record<string, number> = {};
      for (const req of bomMaterialRequirements) {
        if (req.category_id) {
          const name = req.material_name.replace(/^📁\s*/, '').replace(/\s*\(Category\)\s*$/, '');
          categoryRequirementByName[name] = (categoryRequirementByName[name] || 0) + Number(req.required_quantity || 0);
        } else {
          const mat = rawMaterials.find(m => m.id.toString() === req.material_id);
          const cat = ((mat as any)?.category?.name || 'Uncategorized') as string;
          categoryRequirementByName[cat] = (categoryRequirementByName[cat] || 0) + Number(req.required_quantity || 0);
        }
      }

      await Promise.resolve(
        generateGoodsIssuePdf(
          selectedIssue,
          selectedSupplierName || undefined,
          issuedMap,
          nameById,
          categoryById,
          categoryRequirementByName,
          weightKgMap
        )
      );
      toast({ title: 'PDF Generated', description: `Goods Issue ${selectedIssue.issue_number} downloaded` });
    } catch (e: any) {
      console.error('Failed to export Goods Issue PDF (context-aware):', e);
      toast({ title: 'PDF Error', description: e?.message || 'Failed to generate PDF', variant: 'destructive' });
    }
  };

  const getAvailableQuantity = (materialId: string): number => {
    const material = rawMaterials.find(m => m.id.toString() === materialId);
    return material?.inventory?.quantity_available || 0;
  };

  return (
    <ModernLayout
      title="Goods Issue"
      description="Issue raw materials for production and other purposes"
      icon={Minus}
      gradient="bg-gradient-to-r from-red-500 to-pink-600"
    >
      <div className="space-y-6">
        {/* Action Button */}
        <div className="flex justify-end">
          <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 shadow-lg">
            <Minus className="h-4 w-4 mr-2" />
            Issue Goods
          </Button>
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Total Issues</p>
                <p className="text-2xl font-bold text-red-800">{goodsIssues.length}</p>
              </div>
              <Minus className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        {ISSUE_TYPES.map(type => (
          <Card key={type.value} className={`bg-gradient-to-br from-${type.color}-50 to-${type.color}-100 border-${type.color}-200`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm text-${type.color}-600 font-medium`}>{type.label}</p>
                  <p className={`text-2xl font-bold text-${type.color}-800`}>
                    {goodsIssues.filter(issue => issue.issue_type === type.value).length}
                  </p>
                </div>
                <type.icon className={`h-8 w-8 text-${type.color}-600`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Goods Issues List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Goods Issues</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search issues..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIssues.map((issue) => {
                const TypeIcon = getTypeIcon(issue.issue_type);
                return (
                  <TableRow key={issue.id}>
                    <TableCell className="font-medium">{issue.issue_number}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <TypeIcon className="h-4 w-4" />
                        <span className="capitalize">{issue.issue_type}</span>
                      </div>
                    </TableCell>
                    <TableCell>{new Date(issue.issue_date).toLocaleDateString()}</TableCell>
                    <TableCell>{issue.reference_number || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(issue.status)}>
                        {issue.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleViewIssue(issue)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleExportIssuePdf(issue)}
                          title="Export PDF"
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                        {issue.status === 'pending' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleIssueGoods(issue.id)}
                              className="text-green-600 hover:text-green-800"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleCancelIssue(issue.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Goods Issue Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Minus className="h-5 w-5 text-red-600" />
              <span>Issue Goods</span>
            </DialogTitle>
            <DialogDescription>
              Create a goods issue for raw materials consumption
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Tabs: Fabric vs Trims */}
            <Card className="bg-blue-50/30 border-blue-200">
              <CardHeader>
                <CardTitle className="text-sm">Issue Type</CardTitle>
                <CardDescription>Select material group to issue</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={issueTab} onValueChange={(v: any) => {
                  setIssueTab(v);
                  // Re-filter current requirements into form lines
                  setBomMaterialRequirements(prev => prev.filter(req => {
                    const isFab = req.category_id ? isFabricCategory(req.category_id, req.material_name) : isFabricMaterialId(req.material_id);
                    return v === 'fabric' ? isFab : !isFab;
                  }));
                  setFormData(prev => ({
                    ...prev,
                    lines: prev.lines.filter(line => {
                      const isFab = isFabricMaterialId(line.raw_material_id);
                      return v === 'fabric' ? isFab : !isFab;
                    })
                  }));
                }}>
                  <TabsList>
                    <TabsTrigger value="fabric">Fabric Issue</TabsTrigger>
                    <TabsTrigger value="trims">Trims Issue</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Purchase Order Selection */}
                {issueMode === 'po' && (
                  <div className="mt-4">
                    <Label>Purchase Order *</Label>
                    <SearchableSelect
                      value={selectedPurchaseOrder?.id ? String(selectedPurchaseOrder.id) : ''}
                      onChange={handlePOSelection}
                      placeholder="Select Purchase Order"
                      searchPlaceholder="Search purchase orders..."
                      options={purchaseOrders.map(order => ({
                        value: String(order.id),
                        label: order.po_number || order.name || 'Unnamed PO',
                        description: `${order.products?.length || 0} products • Pending: ${order.outstanding_qty || order.pending_qty || 0}`
                      }))}
                    />

                    <div className="mt-4">
                      {issueTab === 'fabric' ? (
                        <>
                          <Label>Cutting Supplier</Label>
                          <SearchableSelect
                            value={selectedSupplierId}
                            onChange={setSelectedSupplierId}
                            placeholder="Select cutting supplier"
                            searchPlaceholder="Search or add cutting supplier..."
                            allowCreate
                            onCreateOption={handleCreateSupplierOption}
                            createLabel={label => `Add "${label}"`}
                            options={cuttingSuppliers.map(supplier => ({
                              value: String(supplier.id),
                              label: supplier.name
                            }))}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Start typing to search or add a new cutting supplier.
                          </p>
                        </>
                      ) : (
                        <>
                          <Label>Supplier *</Label>
                          <SearchableSelect
                            value={legacySupplier}
                            onChange={setLegacySupplier}
                            placeholder="Select supplier"
                            searchPlaceholder="Search suppliers..."
                            allowCreate
                            onCreateOption={label => {
                              const trimmed = label.trim();
                              if (!trimmed) return null;
                              setPoSuppliers(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
                              setLegacySupplier(trimmed);
                              return { value: trimmed, label: trimmed };
                            }}
                            createLabel={label => `Add "${label}"`}
                            options={poSuppliers.map(name => ({
                              value: name,
                              label: name
                            }))}
                          />
                        </>
                      )}
                    </div>
                    
                    {activePOContext && (
                      <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-green-800">
                          <strong>Included POs:</strong>
                          {aggregatedPoBadges.length ? (
                            aggregatedPoBadges.map(po => (
                              <Badge
                                key={po.id}
                                variant="outline"
                                className="text-xs border-green-300 text-green-800 bg-white/60"
                              >
                                {po.label}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-green-700">No linked purchase orders</span>
                          )}
                        </div>
                        <p className="text-xs text-green-700">
                          Products: {activePOContext.products?.length || 0} • Pending Qty: {formatNumeric(activePOContext.outstanding_qty ?? 0, 0) ?? '0'}
                        </p>
                        {(activePOContext.supplier_name || linkedPurchaseOrders[0]?.supplier_name) && (
                          <p className="text-xs text-green-600">
                            Supplier: {activePOContext.supplier_name || linkedPurchaseOrders[0]?.supplier_name}
                          </p>
                        )}
                      </div>
                    )}

                    {issueTab === 'fabric' && selectedPurchaseOrder && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Marker Request{markerSelectOptions.length ? ' *' : ''}</Label>
                          {markerRequestLoading && (
                            <span className="text-xs text-muted-foreground">Loading…</span>
                          )}
                        </div>
                        {markerSelectOptions.length ? (
                          <SearchableSelect
                            value={selectedMarkerRequest?.id ? String(selectedMarkerRequest.id) : ''}
                            onChange={(value) => handleMarkerSelectionChange(value, selectedPurchaseOrder)}
                            placeholder="Select marker request"
                            searchPlaceholder="Search marker requests..."
                            options={markerSelectOptions}
                            disabled={markerRequestLoading}
                          />
                        ) : (
                          !markerRequestLoading && (
                            <p className="text-xs text-muted-foreground">
                              No marker requests linked to this purchase order.
                            </p>
                          )
                        )}

                    {selectedMarkerRequest && (
                      <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 space-y-1">
                        <p className="text-sm font-semibold text-rose-900">
                          Marker {selectedMarkerRequest.marker_number}
                        </p>
                            <p className="text-xs text-rose-700">
                              {selectedMarkerRequest.marker_type === 'body' ? 'Body' : 'Gusset'} marker • Measurement: {selectedMarkerRequest.measurement_type?.toUpperCase?.() || 'YARD'}
                            </p>
                            {markerRequirementText && (
                              <p className="text-xs text-rose-700">
                                Total requirement: {markerRequirementText}
                                {markerNetRequirementText ? ` • Net: ${markerNetRequirementText}` : ''}
                              </p>
                            )}
                            {markerPendingPiecesText && (
                              <p className="text-xs text-rose-700">Pieces: {markerPendingPiecesText}</p>
                            )}
                      </div>
                    )}
                  </div>
                )}

                {issueTab === 'fabric' && selectedMarkerRequest && (
                  <div className="mt-4 space-y-2">
                    <Label>Marker &amp; BOM Requirements</Label>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {(perMaterialRequirementText || markerRequirementText) && (
                        <div>Marker total: {perMaterialRequirementText || markerRequirementText}{(!perMaterialRequirementText && markerNetRequirementText) ? ` • Net ${markerNetRequirementText}` : ''}</div>
                      )}
                      {markerPendingPiecesText && (
                        <div>Marker pending pieces: {markerPendingPiecesText}</div>
                      )}
                      {bomRequirementTotals && (
                        <div>
                          BOM total: {formatNumeric(bomRequirementTotals.totalRequired, 3) ?? bomRequirementTotals.totalRequired} {bomRequirementTotals.unit || ''}
                          {' • Issued '}
                          {formatNumeric(bomRequirementTotals.totalIssued, 3) ?? bomRequirementTotals.totalIssued} {bomRequirementTotals.unit || ''}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* BOM Selection */}
                {showBOMSelection && availableBOMs.length > 0 && (
                  <div className="mt-4">
                    <Label>Select BOM for Material Requirements *</Label>
                    <SearchableSelect
                          value={selectedBOM?.id ? String(selectedBOM.id) : ''}
                          onChange={handleBOMSelection}
                          placeholder="Select BOM to calculate material requirements"
                          searchPlaceholder="Search BOMs..."
                          options={availableBOMs.map(bom => ({
                            value: String(bom.id),
                            label: bom.name,
                            description: `v${bom.version} • ${bom.lines?.length || 0} materials`
                          }))}
                        />
                        
                        {selectedBOM && (
                          <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-sm text-blue-800">
                              <strong>Selected BOM:</strong> {selectedBOM.name} v{selectedBOM.version}
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                              {selectedBOM.lines?.length || 0} materials • Quantity: {selectedBOM.quantity} {selectedBOM.unit}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* BOM-Based Material Requirements Table */}
                {selectedBOM && bomMaterialRequirements.length > 0 && (
                  <div className="mt-6">
                    {issueTab === 'fabric' && (
                      <div className="mb-4 grid gap-3 md:grid-cols-2">
                        {(perMaterialRequirementText || markerRequirementText) && (
                          <div className="rounded-md border border-rose-200 bg-rose-50/80 p-3">
                            <p className="text-xs uppercase tracking-wide text-rose-700">Marker Requirement</p>
                            <p className="mt-1 text-sm font-medium text-rose-900">
                              {perMaterialRequirementText || markerRequirementText}
                              {(!perMaterialRequirementText && markerNetRequirementText) ? ` • Net ${markerNetRequirementText}` : ''}
                            </p>
                            {markerPendingPiecesText && (
                              <p className="text-xs text-rose-700">Pieces: {markerPendingPiecesText}</p>
                            )}
                          </div>
                        )}
                        {bomRequirementTotals && (
                          <div className="rounded-md border border-blue-200 bg-blue-50/80 p-3">
                            <p className="text-xs uppercase tracking-wide text-blue-700">BOM Requirement</p>
                            <div className="mt-1 space-y-1 text-sm text-blue-900">
                              <div className="flex items-center justify-between">
                                <span>Total</span>
                                <span className="font-medium">
                                  {formatNumeric(bomRequirementTotals.totalRequired, 3) ?? bomRequirementTotals.totalRequired} {bomRequirementTotals.unit || ''}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Issued</span>
                                <span className="font-medium">
                                  {formatNumeric(bomRequirementTotals.totalIssued, 3) ?? bomRequirementTotals.totalIssued} {bomRequirementTotals.unit || ''}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>Remaining</span>
                                <span className="font-medium">
                                  {formatNumeric(bomRequirementTotals.remaining, 3) ?? bomRequirementTotals.remaining} {bomRequirementTotals.unit || ''}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <span>Material Requirements - {selectedBOM.name} ({issueTab === 'fabric' ? 'Fabric' : 'Trims'})</span>
                    </h3>
                    
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="font-semibold">Material</TableHead>
                            <TableHead className="font-semibold">Total Required</TableHead>
                            <TableHead className="font-semibold">Issued So Far</TableHead>
                            <TableHead className="font-semibold">To Issue</TableHead>
                            <TableHead className="font-semibold">Balance To Issue</TableHead>
                            <TableHead className="font-semibold">Available Stock</TableHead>
                            <TableHead className="font-semibold">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bomMaterialRequirements
                            .filter(req => !req.category_id)
                            .filter(req => !perMaterialRequirement || req.material_id === activeMaterialIdForRequirement)
                            .map((req, index) => {
                            const remainingToIssue = Math.max(0, req.required_quantity - req.issued_so_far);
                            const isOverIssuing = req.issuing_quantity > remainingToIssue;
                            const isInsufficientStock = req.issuing_quantity > req.available_quantity;
                            
                            // Check if this is a category-based requirement
                            const isCategoryBased = req.category_id !== undefined;
                            
                            return (
                              <React.Fragment key={req.material_id}>
                                <TableRow className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                  <TableCell>
                                    <div className="flex items-center space-x-2">
                                      {isCategoryBased ? (
                                        <div className="flex items-center space-x-2">
                                          <FileText className="h-4 w-4 text-blue-600" />
                                          <div>
                                            <div className="font-medium text-gray-900">{req.material_name}</div>
                                            <div className="text-sm text-gray-500">
                                              Category-based • {req.category_materials?.length || 0} materials available
                                            </div>
                                            <div className="flex items-center space-x-2 mt-2">
                                              <Button 
                                                size="sm" 
                                                variant="outline" 
                                                className="text-xs h-6"
                                                onClick={() => {
                                                  // Toggle category selection view
                                                  const categoryKey = `category-${req.category_id}`;
                                                  setCategorySelections(prev => ({
                                                    ...prev,
                                                    [categoryKey]: prev[categoryKey] ? undefined : []
                                                  }));
                                                }}
                                              >
                                                {categorySelections[`category-${req.category_id}`] ? 'Hide Materials' : 'Select Materials'}
                                              </Button>
                                              {isFabricCategory(req.category_id, req.material_name) && (
                                                <Button 
                                                  size="sm" 
                                                  variant="outline" 
                                                  className="text-xs h-6"
                                                  onClick={() => startScanForCategory(req.category_id!)}
                                                  title="Scan rolls and auto-detect materials"
                                                >
                                                  <QrCode className="h-3 w-3 mr-1" />
                                                  Scan Rolls
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <Package className="h-4 w-4 text-purple-600" />
                                          <div>
                                            <div className="font-medium text-gray-900">{req.material_name}</div>
                                            <div className="text-sm text-gray-500">ID: {req.material_id}</div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </TableCell>
                                <TableCell>
                                  <span className="font-medium">{req.required_quantity.toFixed(3)} {req.unit}</span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-green-700">{req.issued_so_far.toFixed(3)} {req.unit}</span>
                                </TableCell>
                                <TableCell>
                                  {isCategoryBased ? (
                                    <span className="text-sm text-gray-500 italic">Select materials below</span>
                                  ) : (
                                    (() => {
                                      const mat = rawMaterials.find(m => m.id.toString() === req.material_id);
                                      const baseUnitLabel = mat?.base_unit || req.unit || 'unit';
                                      const baseUnitLower = baseUnitLabel.toLowerCase();
                                      const isBaseKg = baseUnitLower === 'kg' || baseUnitLower === 'kilogram' || baseUnitLower === 'kilograms';
                                      const altKey = `material-${req.material_id}`;
                                      const alt = altIssueModes[altKey] || { enabled: false, unit: '', qty: 0, factor: 1 };
                                      const setAlt = (patch: Partial<{enabled: boolean; unit: string; qty: number; factor: number}>) => {
                                        setAltIssueModes(prev => ({
                                          ...prev,
                                          [altKey]: {
                                            enabled: alt.enabled,
                                            unit: alt.unit,
                                            qty: alt.qty,
                                            factor: alt.factor,
                                            ...patch,
                                          },
                                        }));
                                      };
                                      const key = String(req.material_id);
                                      const kgVal = (lineKgState[key]?.kg || 0);

                                      return (
                                        <div className="flex flex-col gap-2">
                                          <div className="flex items-center space-x-2">
                                            <Input
                                              type="number"
                                              min="0"
                                              step="0.001"
                                              value={req.issuing_quantity}
                                              onChange={(e) => updateIssuingQuantity(req.material_id, parseFloat(e.target.value) || 0)}
                                              className={`w-24 ${isOverIssuing ? 'border-yellow-400 bg-yellow-50' : ''} ${isInsufficientStock ? 'border-red-400 bg-red-50' : ''}`}
                                            />
                                            {!isBaseKg && (
                                              <div className="flex items-center space-x-1">
                                                <Input
                                                  aria-label="Weight (kg)"
                                                  type="number"
                                                  min={0}
                                                  step={0.001}
                                                  className="h-8 w-24 text-sm"
                                                  value={kgVal}
                                                  placeholder="kg"
                                                  onChange={(e) => {
                                                    const kg = Number(e.target.value) || 0;
                                                    setLineKgState(prev => ({ ...prev, [key]: { kg } }));
                                                    setFormData(prev => {
                                                      const baseQty = Number(req.issuing_quantity) || 0;
                                                      const notesFactor = kg > 0 && baseQty > 0 ? ` | 1 kg = ${(baseQty / kg).toFixed(4)} ${baseUnitLabel}` : '';
                                                      const matId = String(req.material_id);
                                                      const exists = prev.lines.some(l => l.raw_material_id === matId);
                                                      const updateNotes = (n?: string) => {
                                                        const existing = (n || '').toString();
                                                        const cleaned1 = existing.replace(/\s*\|?\s*Weight\s*\(?(?:kg)?\)?\s*[:=]\s*[\d.]+\s*kg?/i, '');
                                                        const cleaned = cleaned1.replace(/\s*\|?\s*1\s*kg\s*=\s*[\d.]+\s*[a-zA-Z]+/i, '');
                                                        const weightPart = kg > 0 ? `${cleaned ? ' | ' : ''}Weight: ${kg} kg` : '';
                                                        return `${cleaned}${weightPart}${notesFactor}`;
                                                      };
                                                      if (exists) {
                                                        return {
                                                          ...prev,
                                                          lines: prev.lines.map(l => l.raw_material_id === matId ? { ...l, notes: updateNotes(l.notes) } : l)
                                                        };
                                                      }
                                                      if (baseQty > 0) {
                                                        return {
                                                          ...prev,
                                                          lines: [...prev.lines, { raw_material_id: matId, quantity_issued: baseQty, batch_number: '', notes: updateNotes('') }]
                                                        };
                                                      }
                                                      return prev;
                                                    });
                                                  }}
                                                />
                                                <span className="text-xs text-gray-500">kg</span>
                                              </div>
                                            )}
                                            {isFabricMaterialId(req.material_id) && (
                                              <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-8 px-2"
                                                onClick={() => startScanForMaterial(req.material_id)}
                                                title="Scan rolls to set quantity"
                                              >
                                                <QrCode className="h-4 w-4" />
                                              </Button>
                                            )}
                                            {!alt.enabled && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2 text-xs"
                                                onClick={() => setAlt({ enabled: true, unit: alt.unit || '', qty: alt.qty || 0, factor: alt.factor || 1 })}
                                              >
                                                Different unit
                                              </Button>
                                            )}
                                          </div>

                                          {alt.enabled && (
                                            <div className="flex flex-wrap items-center gap-2 pl-0 md:pl-10">
                                              <Select value={alt.unit} onValueChange={(v) => setAlt({ unit: v })}>
                                                <SelectTrigger className="h-8 w-28 text-sm">
                                                  <SelectValue placeholder="Unit" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {['kg','meter','meters','m','yard','yards','yd','piece','pieces','pc','dozen','dz'].map(u => (
                                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                              <Input
                                                type="number"
                                                min="0"
                                                step="0.001"
                                                className="h-8 w-24 text-sm"
                                                placeholder="Qty"
                                                value={alt.qty || 0}
                                                onChange={(e) => setAlt({ qty: Number(e.target.value) || 0 })}
                                              />
                                              <Input
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                className="h-8 w-28 text-sm"
                                                placeholder="Factor"
                                                value={alt.factor}
                                                onChange={(e) => setAlt({ factor: Math.max(0, Number(e.target.value) || 0) })}
                                              />
                                              <Button
                                                variant="secondary"
                                                size="sm"
                                                className="h-8"
                                                onClick={() => {
                                                  const altQty = Number(alt.qty) || 0;
                                                  const altFactor = Number(alt.factor) || 0;
                                                  const baseQty = altQty * altFactor;
                                                  if (!baseQty || baseQty <= 0) {
                                                    toast({ title: 'Invalid Quantity', description: 'Provide alt quantity and conversion factor.', variant: 'destructive' });
                                                    return;
                                                  }
                                                  const matId = String(req.material_id);
                                                  const altUnitLabel = alt.unit || 'alt';
                                                  const altNote = `Issued via alt unit: ${altQty} ${altUnitLabel} (1 ${altUnitLabel} = ${altFactor} ${baseUnitLabel}) => ${baseQty.toFixed(3)} ${baseUnitLabel}`;
                                                  updateIssuingQuantity(req.material_id, baseQty);
                                                  setFormData(prev => {
                                                    const existingLine = prev.lines.find(l => l.raw_material_id === matId);
                                                    // Preserve any previously stored requirement context (e.g., Total required) while refreshing the alt-unit snippet
                                                    const existingNote = existingLine?.notes || `BOM-based requirement for ${req.material_name} • Total required: ${req.required_quantity} ${req.unit}`;
                                                    const cleanedExisting = existingNote
                                                      .replace(/\s*\|?\s*Issued via alt unit:.*$/i, '')
                                                      .replace(/\s*\|?\s*Weight\s*\(?(?:kg)?\)?\s*[:=].*$/i, '')
                                                      .trim();
                                                    const combinedNote = [cleanedExisting, altNote].filter(Boolean).join(' | ');
                                                    const lines = existingLine
                                                      ? prev.lines.map(l => l.raw_material_id === matId ? { ...l, quantity_issued: baseQty, notes: combinedNote } : l)
                                                      : [...prev.lines, { raw_material_id: matId, quantity_issued: baseQty, batch_number: '', notes: combinedNote }];
                                                    return { ...prev, lines };
                                                  });
                                                  setAlt({ enabled: false });
                                                }}
                                              >
                                                Apply
                                              </Button>
                                              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setAlt({ enabled: false })}>Cancel</Button>
                                              <div className="text-xs text-gray-500">
                                                {(() => {
                                                  const baseQty = (Number(alt.qty) || 0) * (Number(alt.factor) || 0);
                                                  return baseQty > 0 ? `= ${baseQty.toFixed(3)} ${baseUnitLabel}` : '';
                                                })()}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="text-gray-700">{remainingToIssue.toFixed(3)} {req.unit}</span>
                                </TableCell>
                                <TableCell>
                                  {isCategoryBased ? (
                                    <span className="text-sm text-gray-700">Issued: {req.issued_so_far.toFixed(3)} {req.unit}</span>
                                  ) : (
                                    <div className={`font-medium ${req.available_quantity < req.issuing_quantity ? 'text-red-600' : 'text-gray-700'}`}>
                                      Avl: {req.available_quantity.toFixed(3)} {req.unit}
                                      <span className="text-gray-500"> • Issued: {req.issued_so_far.toFixed(3)} {req.unit}</span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {isCategoryBased ? (
                                    <Badge className="bg-blue-100 text-blue-800 text-xs">
                                      <FileText className="h-3 w-3 mr-1" />
                                      Category-based
                                    </Badge>
                                  ) : isInsufficientStock ? (
                                    <Badge variant="destructive" className="text-xs">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      Insufficient Stock
                                    </Badge>
                                  ) : isOverIssuing ? (
                                    <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      Over-issuing
                                    </Badge>
                                  ) : req.issuing_quantity === remainingToIssue ? (
                                    <Badge className="bg-green-100 text-green-800 text-xs">
                                      <Check className="h-3 w-3 mr-1" />
                                      Exact
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">
                                      Partial
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                              
                              {/* Category Material Selection Row */}
                              {isCategoryBased && categorySelections[`category-${req.category_id}`] !== undefined && (
                                <TableRow>
                                  <TableCell colSpan={7}>
                                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                      <h4 className="font-medium text-blue-900 mb-3">
                                        Select Materials from {req.material_name.replace('📁 ', '').replace(' (Category)', '')}
                                      </h4>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {req.category_materials?.map((material) => {
                                          const matFull = rawMaterials.find(m => m.id === material.id);
                                          const avl = matFull?.inventory?.quantity_available ?? 0;
                                          const issued = issuedByMaterial.get(material.id.toString()) || 0;
                                          return (
                                          <div key={material.id} className="bg-white p-3 rounded border space-y-2">
                                            <div className="flex items-center space-x-2">
                                              <Package className="h-4 w-4 text-gray-600" />
                                              <div>
                                                <div className="font-medium text-sm">{material.name}</div>
                                                <div className="text-xs text-gray-500">Unit: {material.base_unit} • Avl: {avl} {material.base_unit} • Issued: {issued} {material.base_unit}</div>
                                              </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              {(() => {
                                                const key = `cat-${req.category_id}-mat-${material.id}`;
                                                const alt = altIssueModes[key] || { enabled: false, unit: '', qty: 0, factor: 1 };
                                                const setAlt = (patch: Partial<{enabled:boolean; unit:string; qty:number; factor:number;}>) => {
                                                  setAltIssueModes(prev => ({ ...prev, [key]: { ...alt, ...patch } }));
                                                };
                                                if (!alt.enabled) {
                                                  return (
                                                    <>
                                                      <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.001"
                                                        placeholder="Qty"
                                                        className="w-20 h-8 text-sm"
                                                        value={(categorySelections[`category-${req.category_id}`]?.find(i => i.materialId === material.id)?.quantity ?? '') as any}
                                                        onChange={(e) => {
                                                          const qty = parseFloat(e.target.value) || 0;
                                                          const categoryKey = `category-${req.category_id}`;
                                                          setCategorySelections(prev => ({
                                                            ...prev,
                                                            [categoryKey]: prev[categoryKey]?.filter(item => item.materialId !== material.id)
                                                              .concat(qty > 0 ? [{materialId: material.id, quantity: qty}] : []) || 
                                                              (qty > 0 ? [{materialId: material.id, quantity: qty}] : [])
                                                          }));
                                                          setFormData(prev => {
                                                            const matId = String(material.id);
                                                            const exists = prev.lines.some(l => l.raw_material_id === matId);
                                                            let newLines = prev.lines;
                                                            if (qty > 0) {
                                                              newLines = exists
                                                                ? prev.lines.map(l => l.raw_material_id === matId ? { ...l, quantity_issued: qty, notes: '' } : l)
                                                                : [...prev.lines, { raw_material_id: matId, quantity_issued: qty, batch_number: '', notes: '' }];
                                                            } else if (exists && qty <= 0) {
                                                              newLines = prev.lines.filter(l => l.raw_material_id !== matId);
                                                            }
                                                            return { ...prev, lines: newLines };
                                                          });
                                                        }}
                                                      />
                                                      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setAlt({ enabled: true })}>
                                                        Different unit
                                                      </Button>
                                                      {isFabricCategory(req.category_id, req.material_name) && (
                                                        <Button 
                                                          variant="outline" 
                                                          size="sm" 
                                                          className="h-8 px-2"
                                                          onClick={() => startScanForCategoryMaterial(req.category_id!, material.id)}
                                                          title="Scan rolls to set quantity"
                                                        >
                                                          <QrCode className="h-4 w-4" />
                                                        </Button>
                                                      )}
                                                    </>
                                                  );
                                                }
                                                return (
                                                  <div className="flex flex-wrap items-center gap-2">
                                                    <Select value={alt.unit} onValueChange={(v) => setAlt({ unit: v })}>
                                                      <SelectTrigger className="h-8 w-28 text-sm">
                                                        <SelectValue placeholder="Unit" />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        {['kg','meter','meters','m','yard','yards','yd','piece','pieces','pc','dozen','dz'].map(u => (
                                                          <SelectItem key={u} value={u}>{u}</SelectItem>
                                                        ))}
                                                      </SelectContent>
                                                    </Select>
                                                    <Input
                                                      type="number"
                                                      min="0"
                                                      step="0.001"
                                                      className="h-8 w-24 text-sm"
                                                      placeholder="Qty"
                                                      value={alt.qty || 0}
                                                      onChange={(e) => setAlt({ qty: Number(e.target.value) || 0 })}
                                                    />
                                                    <Input
                                                      type="number"
                                                      min="0"
                                                      step="0.0001"
                                                      className="h-8 w-28 text-sm"
                                                      placeholder="Factor"
                                                      value={alt.factor}
                                                      onChange={(e) => setAlt({ factor: Math.max(0, Number(e.target.value) || 0) })}
                                                    />
                                                    <Button
                                                      variant="secondary"
                                                      size="sm"
                                                      className="h-8"
                                                      onClick={() => {
                                                        const baseQty = (Number(alt.qty) || 0) * (Number(alt.factor) || 0);
                                                        if (!baseQty || baseQty <= 0) {
                                                          toast({ title: 'Invalid Quantity', description: 'Provide alt quantity and conversion factor.', variant: 'destructive' });
                                                          return;
                                                        }
                                                        const matId = String(material.id);
                                                        const baseUnit = material.base_unit || 'unit';
                                                        const note = `Issued via alt unit: ${alt.qty} ${alt.unit || ''} (1 ${alt.unit || 'alt'} = ${alt.factor} ${baseUnit}) => ${baseQty.toFixed(3)} ${baseUnit}`;
                                                        const categoryKey = `category-${req.category_id}`;
                                                        setCategorySelections(prev => ({
                                                          ...prev,
                                                          [categoryKey]: prev[categoryKey]?.filter(item => item.materialId !== material.id)
                                                            .concat(baseQty > 0 ? [{materialId: material.id, quantity: baseQty}] : []) || 
                                                            (baseQty > 0 ? [{materialId: material.id, quantity: baseQty}] : [])
                                                        }));
                                                        setFormData(prev => {
                                                          const exists = prev.lines.some(l => l.raw_material_id === matId);
                                                          const newLine = { raw_material_id: matId, quantity_issued: baseQty, batch_number: '', notes: note } as any;
                                                          const lines = exists
                                                            ? prev.lines.map(l => l.raw_material_id === matId ? { ...l, quantity_issued: baseQty, notes: note } : l)
                                                            : [...prev.lines, newLine];
                                                          return { ...prev, lines };
                                                        });
                                                      }}
                                                    >
                                                      Apply
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setAlt({ enabled: false })}>Cancel</Button>
                                                    <div className="text-xs text-gray-500">
                                                      {(() => {
                                                        const baseQty = (Number(alt.qty) || 0) * (Number(alt.factor) || 0);
                                                        return baseQty > 0 ? `= ${baseQty.toFixed(3)} ${material.base_unit}` : '';
                                                      })()}
                                                    </div>
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          </div>
                                        )})}
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Total Materials:</span>
                        <span className="font-medium">{bomMaterialRequirements.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-gray-600">Materials with Sufficient Stock:</span>
                        <span className="font-medium text-green-600">
                          {bomMaterialRequirements.filter(req => req.available_quantity >= req.issuing_quantity).length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-gray-600">Materials with Insufficient Stock:</span>
                        <span className="font-medium text-red-600">
                          {bomMaterialRequirements.filter(req => req.available_quantity < req.issuing_quantity).length}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* General Issue removed */}
              </CardContent>
            </Card>

            {/* Header Information */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="issue_type">Issue Type *</Label>
                <Select 
                  value={formData.issue_type} 
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, issue_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select issue type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ISSUE_TYPES.map(type => {
                      const Icon = type.icon;
                      return (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center space-x-2">
                            <Icon className="h-4 w-4" />
                            <span>{type.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="issue_date">Issue Date *</Label>
                <Input
                  type="date"
                  value={formData.issue_date}
                  min={new Date().toISOString().split('T')[0]}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={() => {
                    // Enforce today only
                    const today = new Date().toISOString().split('T')[0];
                    setFormData(prev => ({ ...prev, issue_date: today }));
                  }}
                />
              </div>
              <div>
                <Label>Issue Number</Label>
                <Input value={"Assigned on create"} disabled />
              </div>
            </div>

            {/* Manual Material + Quantity (auto-add/auto-update line) */}
            <div className="mt-6 p-4 border rounded-md">
              <div className="grid grid-cols-3 gap-4 items-end">
                <div>
                  <Label>Material</Label>
                  <SearchableSelect
                    value={currentLine.raw_material_id}
                    onChange={(value: string) => {
                      const qty = currentLine.quantity_issued || 0;
                      setCurrentLine(prev => ({ ...prev, raw_material_id: value }));
                      setFormData(prev => {
                        const exists = prev.lines.some(line => line.raw_material_id === value);
                        let newLines = prev.lines;
                        if (qty > 0) {
                          newLines = exists
                            ? prev.lines.map(line =>
                                line.raw_material_id === value
                                  ? { ...line, quantity_issued: qty }
                                  : line
                              )
                            : [
                                ...prev.lines,
                                { raw_material_id: value, quantity_issued: qty, batch_number: '', notes: '' },
                              ];
                        } else if (exists && qty <= 0) {
                          newLines = prev.lines.filter(line => line.raw_material_id !== value);
                        }
                        return { ...prev, lines: newLines };
                      });
                    }}
                    placeholder="Select material"
                    searchPlaceholder="Search materials..."
                    options={materialOptions}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label htmlFor="issue-qty">Quantity</Label>
                  <Input
                    id="issue-qty"
                    type="number"
                    min={0}
                    step={0.001}
                    value={currentLine.quantity_issued || 0}
                    onChange={(e) => {
                      const q = Number(e.target.value) || 0;
                      const mat = currentLine.raw_material_id;
                      setCurrentLine(prev => ({ ...prev, quantity_issued: q }));
                      if (!mat) return;
                      setFormData(prev => {
                        const exists = prev.lines.some(l => l.raw_material_id === mat);
                        let newLines = prev.lines;
                        if (q > 0) {
                          newLines = exists 
                            ? prev.lines.map(l => l.raw_material_id === mat ? { ...l, quantity_issued: q } : l)
                            : [...prev.lines, { raw_material_id: mat, quantity_issued: q, batch_number: '', notes: '' }];
                        } else if (exists && q <= 0) {
                          newLines = prev.lines.filter(l => l.raw_material_id !== mat);
                        }
                        return { ...prev, lines: newLines };
                      });
                    }}
                  />
                </div>
                <div />
              </div>

              {/* Current lines */}
              {formData.lines.length > 0 && (
                <div className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Weight (kg)</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formData.lines.map((line, idx) => {
                        const mat = rawMaterials.find(m => m.id.toString() === line.raw_material_id);
                        const key = String(line.raw_material_id);
                        const baseUnit = (mat?.base_unit || '').toLowerCase();
                        const isBaseKg = baseUnit === 'kg' || baseUnit === 'kilogram' || baseUnit === 'kilograms';
                        const kgState = lineKgState[key] || { kg: 0 };
                        return (
                          <TableRow key={idx}>
                            <TableCell>{mat ? `${mat.name}${mat.code ? ` (${mat.code})` : ''}` : line.raw_material_id}</TableCell>
                            <TableCell className="w-64">
                              <Input
                                aria-label="Quantity (base unit)"
                                type="number"
                                min={0}
                                step={0.001}
                                className="h-8 w-28 text-sm"
                                value={Number(line.quantity_issued) || 0}
                                onChange={(e) => {
                                  const q = Number(e.target.value) || 0;
                                  setFormData(prev => ({
                                    ...prev,
                                    lines: prev.lines.map((l, i) => i === idx ? { ...l, quantity_issued: q } : l)
                                  }));
                                }}
                              />
                              <div className="text-xs text-gray-500 mt-1">{mat?.base_unit}</div>
                              {line.notes ? (
                                <div className="text-xs text-gray-500 mt-1">{line.notes}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="w-64">
                              {mat ? (
                                isBaseKg ? (
                                  <span className="text-xs text-gray-500">Base unit is kg</span>
                                ) : (
                                  <div className="flex items-center space-x-2">
                                    <Input
                                      aria-label="Weight (kg)"
                                      type="number"
                                      min={0}
                                      step={0.001}
                                      className="h-8 w-28 text-sm"
                                      value={kgState.kg || 0}
                                      onChange={(e) => {
                                        const kg = Number(e.target.value) || 0;
                                        setLineKgState(prev => ({ ...prev, [key]: { kg } }));
                                        // Update note with weight and derived factor (base/1kg) when base qty present
                                        setFormData(prev => ({
                                          ...prev,
                                          lines: prev.lines.map((l, i) => {
                                            if (i !== idx) return l;
                                            const baseUnitLabel = mat.base_unit || 'unit';
                                            const existing = (l.notes || '').toString();
                                            const cleaned1 = existing.replace(/\s*\|?\s*Weight\s*\(?(?:kg)?\)?\s*[:=]\s*[\d.]+\s*kg?/i, '');
                                            const cleaned = cleaned1.replace(/\s*\|?\s*1\s*kg\s*=\s*[\d.]+\s*[a-zA-Z]+/i, '');
                                            const weightPart = kg > 0 ? `${cleaned ? ' | ' : ''}Weight: ${kg} kg` : '';
                                            const factor = kg > 0 ? (Number(l.quantity_issued) || 0) / kg : 0;
                                            const factorPart = kg > 0 && (Number(l.quantity_issued) || 0) > 0 ? ` | 1 kg = ${factor.toFixed(4)} ${baseUnitLabel}` : '';
                                            return { ...l, notes: `${cleaned}${weightPart}${factorPart}` };
                                          })
                                        }));
                                      }}
                                    />
                                    <span className="text-xs text-gray-500">kg</span>
                                  </div>
                                )
                              ) : null}
                            </TableCell>
                            <TableCell className="w-20 text-right">
                              <Button type="button" variant="outline" onClick={() => handleRemoveLine(idx)}>Remove</Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Validation Alerts */}
            {formData.lines.length > 0 && formData.lines.some(line => line.quantity_issued > getAvailableQuantity(line.raw_material_id)) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Some line items exceed available inventory. Please adjust quantities before creating the issue.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseCreateDialog}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateIssue} 
              disabled={loading || formData.lines.length === 0 || (issueTab === 'fabric' && !selectedMarkerRequest)}
              className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
            >
              {loading ? 'Creating...' : 'Create Goods Issue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Full-Screen Barcode Scanner for Goods Issue */}
      <BarcodeScanner
        isOpen={giShowBarcodeCamera}
        onScan={handleBarcodeScannedGI}
        scannedRolls={giCurrentMaterialId ? giFabricRolls[giCurrentMaterialId] || [] : []}
        currentScanningLine={
          giCurrentMaterialId 
            ? (rawMaterials.find(m => m.id.toString() === giCurrentMaterialId)?.name || 'Material')
            : 'Material'
        }
        unitLabel={(giCurrentMaterialId ? (rawMaterials.find(m => m.id.toString() === giCurrentMaterialId)?.purchase_unit) : '') || 'kg'}
        quantityMetric={(giCurrentMaterialId ? ((rawMaterials.find(m => m.id.toString() === giCurrentMaterialId)?.purchase_unit || 'kg').toLowerCase().includes('kg') ? 'weight' : 'length') : 'weight')}
        onRemoveRoll={(barcode) => handleRemoveScannedRollGI(barcode)}
        onDone={handleFinishScanningGI}
        onClose={handleFinishScanningGI}
      >
        {selectedMarkerRequest && (
          <div className="absolute top-4 left-4 right-4 z-[2147483646] pointer-events-none">
            <div className="inline-flex max-w-full flex-col gap-1 rounded-lg bg-black/70 px-4 py-3 text-white shadow-lg">
              <span className="text-sm font-semibold">
                Marker {selectedMarkerRequest.marker_number}
              </span>
              {(perMaterialRequirementText || markerRequirementText) && (
                <span className="text-xs">
                  Requirement: {perMaterialRequirementText || markerRequirementText}
                  {(!perMaterialRequirementText && markerNetRequirementText) ? ` • Net ${markerNetRequirementText}` : ''}
                </span>
              )}
              {markerPendingPiecesText && (
                <span className="text-xs">Pieces: {markerPendingPiecesText}</span>
              )}
              {aggregatedPoBadges.length > 0 && (
                <span className="text-[11px] text-white/80">
                  POs: {aggregatedPoBadges.map(po => po.label).join(', ')}
                </span>
              )}
            </div>
          </div>
        )}
        {giShowWeightEntry && giScannedBarcode && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black/50"
            style={{ zIndex: 2147483646, pointerEvents: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Card 
              className="w-full max-w-md mx-4 bg-white"
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'relative', zIndex: 2147483647, pointerEvents: 'auto' }}
            >
              <CardHeader>
                <CardTitle className="text-lg">Enter Roll Details</CardTitle>
                <CardDescription>
                  Barcode: <strong>{giScannedBarcode}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{`${giIsWeightMode ? 'Weight' : 'Length'} (${giUnit}) *`}</Label>
                    <Input
                      ref={giWeightInputRef}
                      type="number"
                      step="0.01"
                      value={(giIsWeightMode ? giRollWeight : giRollLength) || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        if (giIsWeightMode) setGiRollWeight(val); else setGiRollLength(val);
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  {/* Secondary field hidden for simplicity in GI */}
                </div>
                <div className="flex space-x-2">
                  <Button 
                    onClick={handleAddScannedRollGI}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={!((giIsWeightMode ? giRollWeight : giRollLength) > 0)}
                    type="button"
                  >
                    Add Roll
                  </Button>
                  <Button 
                    onClick={() => {
                      setGiShowWeightEntry(false);
                      setGiScannedBarcode('');
                      setGiRollWeight(0);
                      setGiRollLength(0);
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </BarcodeScanner>

      {/* View Goods Issue Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Minus className="h-5 w-5 text-red-600" />
              <span>Goods Issue {selectedIssue?.issue_number}</span>
              {selectedIssue && (
                <Button size="sm" variant="outline" className="ml-2" onClick={handleExportCurrentIssuePdf}>
                  <FileText className="h-4 w-4 mr-1" /> PDF
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedIssue && (
            <div className="space-y-6">
              {/* Issue Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Issue Type</Label>
                  <div className="flex items-center space-x-2">
                    {React.createElement(getTypeIcon(selectedIssue.issue_type), { className: "h-4 w-4" })}
                    <span className="font-medium capitalize">{selectedIssue.issue_type}</span>
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge className={getStatusColor(selectedIssue.status)}>
                    {selectedIssue.status.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <Label>Issue Date</Label>
                  <p>{new Date(selectedIssue.issue_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label>Reference Number</Label>
                  <p>{selectedIssue.reference_number || 'N/A'}</p>
                </div>
              </div>

              {/* Notes */}
              {selectedIssue.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-gray-700">{selectedIssue.notes}</p>
                </div>
              )}

              {/* Issued Items */}
              <div>
                <Label>Issued Items</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Quantity Issued</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Batch/Lot</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedIssue.lines?.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{line.raw_material?.name}</div>
                            <div className="text-sm text-gray-500">{line.raw_material?.code}</div>
                          </div>
                        </TableCell>
                        <TableCell>{line.quantity_issued} {line.raw_material?.base_unit}</TableCell>
                        <TableCell>LKR {line.unit_cost?.toFixed(2) || '0.00'}</TableCell>
                        <TableCell className="font-semibold">
                          LKR {((line.quantity_issued * (line.unit_cost || 0)).toFixed(2))}
                        </TableCell>
                        <TableCell>{line.batch_number || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
            {selectedIssue?.status === 'pending' && (
              <div className="flex space-x-2">
                <Button 
                  onClick={() => {
                    handleCancelIssue(selectedIssue.id);
                    setIsViewDialogOpen(false);
                  }}
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                >
                  Cancel Issue
                </Button>
                <Button 
                  onClick={() => {
                    handleIssueGoods(selectedIssue.id);
                    setIsViewDialogOpen(false);
                  }}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                >
                  Issue Goods
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </ModernLayout>
);
};

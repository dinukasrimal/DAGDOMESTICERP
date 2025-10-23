import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Edit, Trash2, Search, Package, AlertTriangle, TrendingUp, DollarSign, Boxes, MoreVertical, Pencil, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RawMaterialsService, RawMaterialWithInventory, RawMaterialInsert, RawMaterialUpdate, MaterialCategory, MaterialSupplier } from '../../services/rawMaterialsService';
import { getUnitSuggestions, validateConversionFactor } from '../../utils/unitConversion';
import { ModernLayout } from '../layout/ModernLayout';

const rawMaterialsService = new RawMaterialsService();

interface MaterialFormProps {
  defaultValues: Partial<RawMaterialInsert>;
  categories: MaterialCategory[];
  suppliers: MaterialSupplier[];
  onSubmit: (data: Partial<RawMaterialInsert>) => void;
  onCreateCategory: (name: string) => Promise<void>;
  onCreateSupplier: (name: string) => Promise<void>;
  onEditCategory: (id: number, name: string) => Promise<void>;
  onDeleteCategory: (id: number) => Promise<void>;
  onEditSupplier: (id: number, name: string) => Promise<void>;
  onDeleteSupplier: (id: number) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

const MaterialForm: React.FC<MaterialFormProps> = React.memo(({
  defaultValues,
  categories,
  suppliers,
  onSubmit,
  onCreateCategory,
  onCreateSupplier,
  onEditCategory,
  onDeleteCategory,
  onEditSupplier,
  onDeleteSupplier,
  onCancel,
  submitLabel
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(defaultValues.category_id?.toString() || '');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(defaultValues.supplier_id?.toString() || '');
  const [baseUnit, setBaseUnit] = useState<string>(defaultValues.base_unit || '');
  const [purchaseUnit, setPurchaseUnit] = useState<string>(defaultValues.purchase_unit || '');
  const [conversionFactor, setConversionFactor] = useState<number>(defaultValues.conversion_factor || 1);
  
  // Category and supplier management states
  const [editingCategory, setEditingCategory] = useState<MaterialCategory | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<MaterialSupplier | null>(null);
  const [categoryName, setCategoryName] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    
    const data: Partial<RawMaterialInsert> = {
      name: formData.get('name') as string,
      code: formData.get('code') as string || undefined,
      base_unit: baseUnit,
      purchase_unit: purchaseUnit,
      conversion_factor: conversionFactor,
      reorder_level: formData.get('reorder_level') ? parseFloat(formData.get('reorder_level') as string) : 0,
      category_id: selectedCategoryId ? parseInt(selectedCategoryId) : undefined,
      supplier_id: selectedSupplierId ? parseInt(selectedSupplierId) : undefined,
      active: true
    };
    
    onSubmit(data);
  };

  const handleCreateCategory = async () => {
    const input = formRef.current?.querySelector('[name="new_category"]') as HTMLInputElement;
    const name = input?.value.trim();
    if (name) {
      await onCreateCategory(name);
      input.value = '';
    }
  };

  const handleCreateSupplier = async () => {
    const input = formRef.current?.querySelector('[name="new_supplier"]') as HTMLInputElement;
    const name = input?.value.trim();
    if (name) {
      await onCreateSupplier(name);
      input.value = '';
    }
  };

  const handleEditCategory = (category: MaterialCategory) => {
    setEditingCategory(category);
    setCategoryName(category.name);
  };

  const handleSaveCategory = async () => {
    if (editingCategory && categoryName.trim()) {
      await onEditCategory(editingCategory.id, categoryName.trim());
      setEditingCategory(null);
      setCategoryName('');
    }
  };

  const handleDeleteCategory = async (category: MaterialCategory) => {
    if (confirm(`Are you sure you want to delete category "${category.name}"?`)) {
      await onDeleteCategory(category.id);
    }
  };

  const handleEditSupplier = (supplier: MaterialSupplier) => {
    setEditingSupplier(supplier);
    setSupplierName(supplier.name);
  };

  const handleSaveSupplier = async () => {
    if (editingSupplier && supplierName.trim()) {
      await onEditSupplier(editingSupplier.id, supplierName.trim());
      setEditingSupplier(null);
      setSupplierName('');
    }
  };

  const handleDeleteSupplier = async (supplier: MaterialSupplier) => {
    if (confirm(`Are you sure you want to delete supplier "${supplier.name}"?`)) {
      await onDeleteSupplier(supplier.id);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            name="name"
            autoComplete="off"
            defaultValue={defaultValues.name}
            placeholder="Cotton Fabric"
            required
          />
        </div>
        <div>
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            autoComplete="off"
            defaultValue={defaultValues.code}
            placeholder="COT001"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="base_unit">Base Unit *</Label>
          <Select value={baseUnit} onValueChange={setBaseUnit}>
            <SelectTrigger id="base_unit">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {getUnitSuggestions().map(unit => (
                <SelectItem key={unit} value={unit}>{unit}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="purchase_unit">Purchase Unit *</Label>
          <Select value={purchaseUnit} onValueChange={setPurchaseUnit}>
            <SelectTrigger id="purchase_unit">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {getUnitSuggestions().map(unit => (
                <SelectItem key={unit} value={unit}>{unit}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="conversion_factor">Conversion Factor *</Label>
          <Input
            id="conversion_factor"
            name="conversion_factor"
            type="number"
            step="0.001"
            autoComplete="off"
            value={conversionFactor}
            onChange={(e) => setConversionFactor(parseFloat(e.target.value) || 1)}
            placeholder="1"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="reorder_level">Reorder Level</Label>
          <Input
            id="reorder_level"
            name="reorder_level"
            type="number"
            autoComplete="off"
            defaultValue={defaultValues.reorder_level}
            placeholder="100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="category" className="text-sm font-semibold text-gray-700">Category</Label>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger id="category" className="bg-white/70 border-purple-200 focus:border-purple-400">
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent className="bg-white border-purple-200">
                  {categories.map(category => (
                    <SelectItem key={category.id} value={category.id.toString()} className="hover:bg-purple-50">
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategoryId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditCategory(categories.find(c => c.id.toString() === selectedCategoryId)!)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Category
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => handleDeleteCategory(categories.find(c => c.id.toString() === selectedCategoryId)!)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Category
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            
            {editingCategory ? (
              <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                <Label className="text-sm font-medium text-purple-800">Edit Category</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="text-sm bg-white border-purple-300 focus:border-purple-500"
                  />
                  <Button type="button" size="sm" onClick={handleSaveCategory} className="bg-purple-600 hover:bg-purple-700">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingCategory(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 p-3 rounded-lg border">
                <Label className="text-sm font-medium text-gray-700">Create New Category</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    name="new_category"
                    autoComplete="off"
                    placeholder="Enter category name"
                    className="text-sm bg-white"
                  />
                  <Button type="button" size="sm" onClick={handleCreateCategory} className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="supplier" className="text-sm font-semibold text-gray-700">Supplier</Label>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger id="supplier" className="bg-white/70 border-blue-200 focus:border-blue-400">
                  <SelectValue placeholder="Choose supplier" />
                </SelectTrigger>
                <SelectContent className="bg-white border-blue-200">
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id.toString()} className="hover:bg-blue-50">
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSupplierId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-10 w-10 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditSupplier(suppliers.find(s => s.id.toString() === selectedSupplierId)!)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Supplier
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => handleDeleteSupplier(suppliers.find(s => s.id.toString() === selectedSupplierId)!)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Supplier
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            
            {editingSupplier ? (
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <Label className="text-sm font-medium text-blue-800">Edit Supplier</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Supplier name"
                    className="text-sm bg-white border-blue-300 focus:border-blue-500"
                  />
                  <Button type="button" size="sm" onClick={handleSaveSupplier} className="bg-blue-600 hover:bg-blue-700">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingSupplier(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 p-3 rounded-lg border">
                <Label className="text-sm font-medium text-gray-700">Create New Supplier</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    name="new_supplier"
                    autoComplete="off"
                    placeholder="Enter supplier name"
                    className="text-sm bg-white"
                  />
                  <Button type="button" size="sm" onClick={handleCreateSupplier} className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {baseUnit && purchaseUnit && baseUnit !== purchaseUnit && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            1 {purchaseUnit} = {conversionFactor} {baseUnit}
          </AlertDescription>
        </Alert>
      )}
      
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
});

export const RawMaterialsManager: React.FC = () => {
  const [materials, setMaterials] = useState<RawMaterialWithInventory[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<RawMaterialWithInventory[]>([]);
  const [valuationMap, setValuationMap] = useState<Record<number, { totalQty: number; totalValue: number; avgCost: number }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterialWithInventory | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([]);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustMaterialId, setAdjustMaterialId] = useState<number | null>(null);
  const [adjustLayers, setAdjustLayers] = useState<Array<{ unit_price: number, available: number }>>([]);
  const adjustPendingRef = useRef<Record<string, string>>({});
  const newAdjPriceRef = useRef<HTMLInputElement | null>(null);
  const newAdjQtyRef = useRef<HTMLInputElement | null>(null);
  const [fabricRolls, setFabricRolls] = useState<Array<{ id: string, roll_barcode: string | null, roll_weight: number | null, roll_length: number | null, unit_price: number }>>([]);
  const [isFabricAdjustment, setIsFabricAdjustment] = useState(false);
  // Read-only fabric rolls view states
  const [viewRollsOpen, setViewRollsOpen] = useState(false);
  const [viewRollsLoading, setViewRollsLoading] = useState(false);
  const [viewRollsMaterialId, setViewRollsMaterialId] = useState<number | null>(null);
  const [viewRollsMaterialName, setViewRollsMaterialName] = useState<string>('');
  const [viewRollsUnit, setViewRollsUnit] = useState<string>('kg');
  const [viewFabricRolls, setViewFabricRolls] = useState<Array<{ id: string, roll_barcode: string | null, roll_weight: number | null, roll_length: number | null, unit_price: number, goods_received_id: string }>>([]);
  const { toast } = useToast();

  const defaultFormData: Partial<RawMaterialInsert> = {
    name: '',
    code: '',
    base_unit: '',
    purchase_unit: '',
    conversion_factor: 1,
    cost_per_unit: undefined,
    category_id: undefined,
    supplier_id: undefined,
    reorder_level: 0,
    active: true
  };

  const [createFormData, setCreateFormData] = useState<Partial<RawMaterialInsert>>(defaultFormData);
  const [editFormData, setEditFormData] = useState<Partial<RawMaterialInsert>>(defaultFormData);

  useEffect(() => {
    loadMaterials();
    loadCategories();
    loadSuppliers();
  }, []);

  // Refresh when inventory updates elsewhere (e.g., after GRN approval)
  useEffect(() => {
    const handler = () => loadMaterials();
    window.addEventListener('inventory-updated', handler as any);
    return () => window.removeEventListener('inventory-updated', handler as any);
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = materials.filter(material =>
        material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        material.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        material.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        material.supplier?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredMaterials(filtered);
    } else {
      setFilteredMaterials(materials);
    }
  }, [searchTerm, materials]);

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const data = await rawMaterialsService.getRawMaterials(false); // Get all including inactive
      setMaterials(data);
      setFilteredMaterials(data);
      const ids = data.map(m => m.id);
      const valuation = await rawMaterialsService.getInventoryValuation(ids);
      setValuationMap(valuation);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load raw materials',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const openAdjustmentDialog = async () => {
    setShowAdjustDialog(true);
    setAdjustMaterialId(null);
    setAdjustLayers([]);
    adjustPendingRef.current = {};
  };

  const isFabric = (m: RawMaterialWithInventory | null | undefined) => {
    if (!m) return false;
    if ((m as any).category_id === 1) return true;
    if (m.category?.id === 1) return true;
    return (m.category?.name || m.name || '').toLowerCase().includes('fabric');
  };

  const openViewRolls = async (material: RawMaterialWithInventory) => {
    if (!isFabric(material)) {
      toast({ title: 'Not a fabric', description: 'Barcode stock view is available for fabrics only.', variant: 'destructive' });
      return;
    }
    setViewRollsMaterialId(material.id);
    setViewRollsMaterialName(material.name || 'Fabric');
    setViewRollsUnit((material.purchase_unit || 'kg'));
    setViewRollsOpen(true);
    setViewRollsLoading(true);
    try {
      // Prefer authoritative in-stock rolls from inventory layers with roll_barcode
      const invRolls = await rawMaterialsService.getInStockRollsFromInventory(material.id);
      if (invRolls.length > 0) {
        // Map to view model shape similar to GRN rolls
        const mapped = invRolls.map((r: any) => ({
          id: r.id,
          roll_barcode: r.roll_barcode,
          roll_weight: (material.purchase_unit || 'kg').toLowerCase().includes('kg') ? r.qty : null,
          roll_length: (material.purchase_unit || 'kg').toLowerCase().includes('kg') ? null : r.qty,
          unit_price: r.unit_price,
          goods_received_id: '-',
        }));
        setViewFabricRolls(mapped as any);
      } else {
        // Fallback to GRN lines filtered + FIFO match to available qty
        const rolls = await rawMaterialsService.getFabricRolls(material.id);
        const mat = materials.find(m => m.id === material.id) || material;
        const available = Number((mat as any)?.inventory?.quantity_available || 0);
        const isKg = (material.purchase_unit || 'kg').toLowerCase().includes('kg');
        const grnIds = Array.from(new Set((rolls as any[]).map(r => r.goods_received_id).filter(Boolean)));
        let grnDates = new Map<string, string>();
        if (grnIds.length) {
          const { data: grns } = await supabase
            .from('goods_received')
            .select('id, received_date')
            .in('id', grnIds);
          grnDates = new Map((grns || []).map((g: any) => [g.id, g.received_date]));
        }
        const sorted = (rolls as any[]).slice().sort((a, b) => {
          const da = grnDates.get(a.goods_received_id) || '1970-01-01';
          const db = grnDates.get(b.goods_received_id) || '1970-01-01';
          if (da < db) return -1;
          if (da > db) return 1;
          return String(a.id) < String(b.id) ? -1 : 1;
        });
        const inStock: any[] = [];
        let sum = 0;
        const eps = 1e-6;
        for (const r of sorted) {
          const w = Number(r.roll_weight || 0);
          const l = Number(r.roll_length || 0);
          const qty = isKg ? (w > 0 ? w : l) : (l > 0 ? l : w);
          if (qty <= 0) continue;
          if (sum + qty <= available + eps) {
            inStock.push(r);
            sum += qty;
            if (sum >= available - eps) break;
          }
        }
        setViewFabricRolls(inStock as any);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to load fabric rolls', variant: 'destructive' });
    } finally {
      setViewRollsLoading(false);
    }
  };

  const onSelectAdjustMaterial = async (idStr: string) => {
    const id = Number(idStr);
    setAdjustMaterialId(id);
    try {
      const mat = materials.find(m => m.id === id);
      const isFabric = mat && (mat.category?.id === 1 || (mat.name || '').toLowerCase().includes('fabric'));
      setIsFabricAdjustment(!!isFabric);
      if (isFabric) {
        const rolls = await rawMaterialsService.getFabricRolls(id);
        setFabricRolls(rolls as any);
        setAdjustLayers([]);
      } else {
        const layers = await rawMaterialsService.getGrnLayersByMaterial(id);
        // Group by unit_price
        const byPrice = new Map<number, number>();
        for (const l of layers) {
          const price = Number((l as any).unit_price || 0);
          const avail = Number((l as any).quantity_available || 0);
          byPrice.set(price, (byPrice.get(price) || 0) + avail);
        }
        const list = Array.from(byPrice.entries()).map(([price, avail]) => ({ unit_price: price, available: avail }));
        setAdjustLayers(list);
        setFabricRolls([]);
      }
    } catch (e) {
      console.error('Failed to load layers for adjustment', e);
      setAdjustLayers([]);
      setFabricRolls([]);
    }
  };

  const submitAdjustment = async () => {
    if (!adjustMaterialId) return;
    try {
      if (isFabricAdjustment && adjustMaterialId) {
        // For fabric, use roll-specific updates
        // Read any edited rows via DOM refs isn't ideal; keep simple: provide inline buttons per roll
      }
      const adjustments = adjustLayers
        .map(l => {
          const key = `${l.unit_price}`;
          const s = adjustPendingRef.current[key];
          const val = s == null ? 0 : (parseFloat(s) || 0);
          return { unit_price: l.unit_price, delta: val };
        })
        .filter(l => l.delta !== 0);
      const newPrice = parseFloat(newAdjPriceRef.current?.value || '0') || 0;
      const newQty = parseFloat(newAdjQtyRef.current?.value || '0') || 0;
      const newLayer = newQty > 0 && newPrice > 0 ? { unit_price: newPrice, qty: newQty } : undefined;
      await rawMaterialsService.applyStockAdjustment(adjustMaterialId, adjustments, newLayer);
      toast({ title: 'Success', description: 'Stock adjusted successfully' });
      setShowAdjustDialog(false);
      // Refresh materials
      loadMaterials();
      try { window.dispatchEvent(new CustomEvent('inventory-updated')); } catch {}
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to apply stock adjustment', variant: 'destructive' });
    }
  };

  const loadCategories = async () => {
    try {
      const data = await rawMaterialsService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadSuppliers = async () => {
    try {
      const data = await rawMaterialsService.getSuppliers();
      setSuppliers(data);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
    }
  };

  const handleCreateCategory = async (name: string) => {
    try {
      const category = await rawMaterialsService.createCategory({ name });
      setCategories([...categories, category]);
      toast({
        title: 'Success',
        description: 'Category created successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create category',
        variant: 'destructive'
      });
    }
  };

  const handleCreateSupplier = async (name: string) => {
    try {
      const supplier = await rawMaterialsService.createSupplier({ name });
      setSuppliers([...suppliers, supplier]);
      toast({
        title: 'Success',
        description: 'Supplier created successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create supplier',
        variant: 'destructive'
      });
    }
  };

  const handleEditCategory = async (id: number, name: string) => {
    try {
      const updatedCategory = await rawMaterialsService.updateCategory(id, { name });
      setCategories(categories.map(cat => cat.id === id ? updatedCategory : cat));
      toast({
        title: 'Success',
        description: 'Category updated successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update category',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await rawMaterialsService.deleteCategory(id);
      setCategories(categories.filter(cat => cat.id !== id));
      toast({
        title: 'Success',
        description: 'Category deleted successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete category',
        variant: 'destructive'
      });
    }
  };

  const handleEditSupplier = async (id: number, name: string) => {
    try {
      const updatedSupplier = await rawMaterialsService.updateSupplier(id, { name });
      setSuppliers(suppliers.map(sup => sup.id === id ? updatedSupplier : sup));
      toast({
        title: 'Success',
        description: 'Supplier updated successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update supplier',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteSupplier = async (id: number) => {
    try {
      await rawMaterialsService.deleteSupplier(id);
      setSuppliers(suppliers.filter(sup => sup.id !== id));
      toast({
        title: 'Success',
        description: 'Supplier deleted successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete supplier',
        variant: 'destructive'
      });
    }
  };

  const handleCreateSubmit = async (data: Partial<RawMaterialInsert>) => {
    try {
      if (!data.name || !data.base_unit || !data.purchase_unit) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields',
          variant: 'destructive'
        });
        return;
      }

      const validation = validateConversionFactor(
        data.base_unit!,
        data.purchase_unit!,
        data.conversion_factor || 1
      );

      if (!validation.valid) {
        toast({
          title: 'Validation Error',
          description: validation.message,
          variant: 'destructive'
        });
        return;
      }

      await rawMaterialsService.createRawMaterial(data as RawMaterialInsert);
      
      toast({
        title: 'Success',
        description: 'Raw material created successfully'
      });
      
      setShowCreateDialog(false);
      setCreateFormData(defaultFormData);
      loadMaterials();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create raw material',
        variant: 'destructive'
      });
    }
  };

  const handleEditSubmit = async (data: Partial<RawMaterialInsert>) => {
    try {
      if (!editingMaterial || !data.name || !data.base_unit || !data.purchase_unit) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields',
          variant: 'destructive'
        });
        return;
      }

      const validation = validateConversionFactor(
        data.base_unit!,
        data.purchase_unit!,
        data.conversion_factor || 1
      );

      if (!validation.valid) {
        toast({
          title: 'Validation Error',
          description: validation.message,
          variant: 'destructive'
        });
        return;
      }

      await rawMaterialsService.updateRawMaterial(editingMaterial.id, data as RawMaterialUpdate);
      
      toast({
        title: 'Success',
        description: 'Raw material updated successfully'
      });
      
      setShowEditDialog(false);
      setEditingMaterial(null);
      setEditFormData(defaultFormData);
      loadMaterials();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update raw material',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (material: RawMaterialWithInventory) => {
    if (!confirm(`Are you sure you want to deactivate "${material.name}"?`)) {
      return;
    }

    try {
      await rawMaterialsService.deleteRawMaterial(material.id);
      
      toast({
        title: 'Success',
        description: 'Raw material deactivated successfully'
      });
      
      loadMaterials();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to deactivate raw material',
        variant: 'destructive'
      });
    }
  };


  const openEditDialog = (material: RawMaterialWithInventory) => {
    setEditingMaterial(material);
    setEditFormData({
      name: material.name,
      code: material.code || '',
      base_unit: material.base_unit,
      purchase_unit: material.purchase_unit,
      conversion_factor: material.conversion_factor,
      cost_per_unit: material.cost_per_unit,
      category_id: material.category_id,
      supplier_id: material.supplier_id,
      reorder_level: material.reorder_level,
      active: material.active
    });
    setShowEditDialog(true);
  };

  const getStockStatus = (material: RawMaterialWithInventory) => {
    if (!material.inventory) return 'No data';
    
    const { quantity_available, reorder_level } = material;
    const availableQty = material.inventory.quantity_available;
    
    if (availableQty <= reorder_level) {
      return 'Low stock';
    } else if (availableQty <= reorder_level * 1.5) {
      return 'Medium stock';
    } else {
      return 'In stock';
    }
  };

  const getStockBadgeVariant = (status: string) => {
    switch (status) {
      case 'Low stock': return 'destructive';
      case 'Medium stock': return 'secondary';
      case 'In stock': return 'default';
      default: return 'outline';
    }
  };



  if (loading) {
    return (
      <ModernLayout
        title="Raw Materials"
        description="Manage raw materials and their units"
        icon={Package}
        gradient="bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700"
      >
        <div className="flex justify-center p-8">Loading...</div>
      </ModernLayout>
    );
  }

  const MaterialsContent = () => (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200/50 hover:shadow-lg transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium mb-1">Total Materials</p>
                <p className="text-2xl font-bold text-blue-900">{materials.length}</p>
              </div>
              <div className="p-3 bg-blue-500 rounded-xl">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200/50 hover:shadow-lg transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-600 text-sm font-medium mb-1">Active Materials</p>
                <p className="text-2xl font-bold text-emerald-900">{materials.filter(m => m.active).length}</p>
              </div>
              <div className="p-3 bg-emerald-500 rounded-xl">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200/50 hover:shadow-lg transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-600 text-sm font-medium mb-1">Low Stock</p>
                <p className="text-2xl font-bold text-orange-900">
                  {materials.filter(m => getStockStatus(m) === 'Low stock').length}
                </p>
              </div>
              <div className="p-3 bg-orange-500 rounded-xl">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200/50 hover:shadow-lg transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-600 text-sm font-medium mb-1">Categories</p>
                <p className="text-2xl font-bold text-purple-900">{categories.length}</p>
              </div>
              <div className="p-3 bg-purple-500 rounded-xl">
                <Boxes className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              id="search-materials"
              name="search"
              autoComplete="off"
              placeholder="Search materials, codes, suppliers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white/80 border-gray-200/50 focus:bg-white focus:border-purple-300 transition-all duration-300"
            />
          </div>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => setCreateFormData(defaultFormData)}
              className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-lg hover:shadow-purple-500/25 transition-all duration-300"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-sm border-gray-200/50" key="create-dialog">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">Create Raw Material</DialogTitle>
              <DialogDescription className="text-gray-600">
                Add a new raw material with unit conversion settings
              </DialogDescription>
            </DialogHeader>
            <MaterialForm
              key="create-material-form"
              defaultValues={createFormData}
              categories={categories}
              suppliers={suppliers}
              onSubmit={handleCreateSubmit}
              onCreateCategory={handleCreateCategory}
              onCreateSupplier={handleCreateSupplier}
              onEditCategory={handleEditCategory}
              onDeleteCategory={handleDeleteCategory}
              onEditSupplier={handleEditSupplier}
              onDeleteSupplier={handleDeleteSupplier}
              onCancel={() => setShowCreateDialog(false)}
              submitLabel="Create Material"
            />
          </DialogContent>
        </Dialog>

        <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-sm border-gray-200/50">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">Stock Adjustment</DialogTitle>
              <DialogDescription className="text-gray-600">Adjust stock quantities by material and unit price</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Material</Label>
                <Select value={adjustMaterialId ? String(adjustMaterialId) : ''} onValueChange={onSelectAdjustMaterial}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name} {m.code ? `(${m.code})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {adjustMaterialId && !isFabricAdjustment && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-700 font-medium">Existing Layers (by Unit Price)</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Adjust (±)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustLayers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-gray-500 text-sm">No existing stock layers</TableCell>
                        </TableRow>
                      )}
                      {adjustLayers.map((l, idx) => (
                        <TableRow key={`adj-${adjustMaterialId}-${l.unit_price}-${idx}`}>
                          <TableCell>LKR {l.unit_price}</TableCell>
                          <TableCell>{l.available}</TableCell>
                          <TableCell className="w-48">
                            <Input type="text" inputMode="decimal" defaultValue={"0"}
                              onChange={(e) => {
                                adjustPendingRef.current[`${l.unit_price}`] = e.target.value;
                              }} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {!isFabricAdjustment && (<div className="space-y-2">
                <div className="text-sm text-gray-700 font-medium">New Layer (optional)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Unit Price</Label>
                    <Input type="text" inputMode="decimal" ref={newAdjPriceRef} defaultValue={""} />
                  </div>
                  <div>
                    <Label>Quantity (+)</Label>
                    <Input type="text" inputMode="decimal" ref={newAdjQtyRef} defaultValue={""} />
                  </div>
                </div>
                <div className="text-xs text-gray-500">Enter a positive quantity to add a new stock layer at the given price.</div>
              </div>)}

              {adjustMaterialId && isFabricAdjustment && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-700 font-medium">Current Rolls</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Barcode</TableHead>
                        <TableHead>Weight</TableHead>
                        <TableHead>Length</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fabricRolls.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-gray-500 text-sm">No rolls found for this material</TableCell>
                        </TableRow>
                      )}
                      {fabricRolls.map((r, idx) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.roll_barcode || '-'}</TableCell>
                          <TableCell className="w-40">
                            <Input type="text" inputMode="decimal" defaultValue={r.roll_weight ?? ''}
                              onBlur={async (e) => {
                                const v = parseFloat(e.target.value || '0') || 0;
                                try {
                                  await rawMaterialsService.updateFabricRoll(r.id, v, r.roll_length ?? null);
                                  toast({ title: 'Updated', description: 'Roll weight adjusted' });
                                  const rolls = await rawMaterialsService.getFabricRolls(adjustMaterialId!);
                                  setFabricRolls(rolls as any);
                                  loadMaterials();
                                } catch (err: any) {
                                  toast({ title: 'Error', description: err?.message || 'Failed to update roll', variant: 'destructive' });
                                }
                              }} />
                          </TableCell>
                          <TableCell className="w-40">
                            <Input type="text" inputMode="decimal" defaultValue={r.roll_length ?? ''}
                              onBlur={async (e) => {
                                const v = parseFloat(e.target.value || '0') || 0;
                                try {
                                  await rawMaterialsService.updateFabricRoll(r.id, r.roll_weight ?? 0, v);
                                  toast({ title: 'Updated', description: 'Roll length adjusted' });
                                  const rolls = await rawMaterialsService.getFabricRolls(adjustMaterialId!);
                                  setFabricRolls(rolls as any);
                                } catch (err: any) {
                                  toast({ title: 'Error', description: err?.message || 'Failed to update roll', variant: 'destructive' });
                                }
                              }} />
                          </TableCell>
                          <TableCell>LKR {r.unit_price}</TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={async () => {
                              if (!confirm('Delete this roll (set weight to 0) and adjust stock?')) return;
                              try {
                                await rawMaterialsService.deleteFabricRoll(r.id);
                                toast({ title: 'Deleted', description: 'Roll removed and stock adjusted' });
                                const rolls = await rawMaterialsService.getFabricRolls(adjustMaterialId!);
                                setFabricRolls(rolls as any);
                                loadMaterials();
                              } catch (err: any) {
                                toast({ title: 'Error', description: err?.message || 'Failed to delete roll', variant: 'destructive' });
                              }
                            }}>Delete</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="text-xs text-gray-500">Tip: Edit weights/lengths by typing and blurring the field. Deleting sets the roll to zero and adjusts stock.</div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>Cancel</Button>
              <Button onClick={submitAdjustment}>Apply Adjustment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Materials Table */}
      <Card className="bg-white/60 backdrop-blur-sm border-gray-200/50 shadow-xl">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg">
              <Package className="h-5 w-5 text-white" />
            </div>
            Materials Inventory
          </CardTitle>
          <CardDescription className="text-gray-600">
            {filteredMaterials.length} of {materials.length} materials shown
          </CardDescription>
          <div className="mt-2">
            <Button variant="outline" onClick={openAdjustmentDialog}>Stock Adjustment</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-gray-200/50">
                  <TableHead className="font-semibold text-gray-700">Material</TableHead>
                  <TableHead className="font-semibold text-gray-700">Code</TableHead>
                  <TableHead className="font-semibold text-gray-700">Category</TableHead>
                  <TableHead className="font-semibold text-gray-700">Units</TableHead>
                  <TableHead className="font-semibold text-gray-700">Stock Status</TableHead>
                  <TableHead className="font-semibold text-gray-700">Value (FIFO)</TableHead>
                  <TableHead className="font-semibold text-gray-700">Status</TableHead>
                  <TableHead className="font-semibold text-gray-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMaterials.map((material) => (
                  <TableRow key={material.id} className="hover:bg-gradient-to-r hover:from-purple-50/50 hover:to-blue-50/50 transition-all duration-300 border-gray-200/30">
                    <TableCell>
                      <div>
                        <div className="font-semibold text-gray-900">{material.name}</div>
                        {material.description && (
                          <div className="text-sm text-gray-500">{material.description}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-mono">
                        {material.code || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {material.category?.name ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {material.category.name}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Base:</span>
                          <span className="font-medium">{material.base_unit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Purchase:</span>
                          <span className="font-medium">{material.purchase_unit}</span>
                        </div>
                        {material.base_unit !== material.purchase_unit && (
                          <div className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                            1 {material.purchase_unit} = {material.conversion_factor} {material.base_unit}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant={getStockBadgeVariant(getStockStatus(material))} className="text-xs">
                          {getStockStatus(material)}
                        </Badge>
                        {material.inventory && (
                          <div className="text-xs text-gray-600 font-medium">
                            {material.inventory.quantity_available} {material.base_unit}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {valuationMap[material.id] ? (
                        <div className="flex items-center gap-1 text-green-700">
                          <DollarSign className="h-3 w-3" />
                          <span className="font-semibold">LKR {Math.round(valuationMap[material.id].totalValue).toLocaleString()}</span>
                          <span className="text-xs text-gray-500"> (Avg: LKR {Math.round(valuationMap[material.id].avgCost).toLocaleString()}/{material.base_unit})</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={material.active ? 'default' : 'secondary'} className={
                        material.active ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : ''
                      }>
                        {material.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(material)}
                          className="hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all duration-300"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {isFabric(material) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openViewRolls(material)}
                            title="View fabric rolls"
                            className="hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-all duration-300"
                          >
                            <QrCode className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(material)}
                          disabled={!material.active}
                          className="hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-all duration-300 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-sm border-gray-200/50" key="edit-dialog">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">Edit Raw Material</DialogTitle>
            <DialogDescription className="text-gray-600">
              Update material information and unit settings
            </DialogDescription>
          </DialogHeader>
          <MaterialForm
            key="edit-material-form"
            defaultValues={editFormData}
            categories={categories}
            suppliers={suppliers}
            onSubmit={handleEditSubmit}
            onCreateCategory={handleCreateCategory}
            onCreateSupplier={handleCreateSupplier}
            onEditCategory={handleEditCategory}
            onDeleteCategory={handleDeleteCategory}
            onEditSupplier={handleEditSupplier}
            onDeleteSupplier={handleDeleteSupplier}
            onCancel={() => setShowEditDialog(false)}
            submitLabel="Update Material"
          />
        </DialogContent>
      </Dialog>

      {/* View Fabric Rolls (Barcode-wise stock) */}
      <Dialog open={viewRollsOpen} onOpenChange={setViewRollsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>Fabric Rolls — {viewRollsMaterialName}</DialogTitle>
            <DialogDescription>Barcode-wise stock for this fabric material</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {viewRollsLoading ? (
              <div className="text-sm text-gray-600">Loading rolls…</div>
            ) : (
              <>
                <div className="text-sm text-gray-700">
                  Total Rolls: <span className="font-medium">{viewFabricRolls.length}</span> • Total: {' '}
                  <span className="font-medium">
                    {(() => {
                      const isKg = (viewRollsUnit || 'kg').toLowerCase().includes('kg');
                      const total = viewFabricRolls.reduce((s, r) => s + (isKg ? (Number(r.roll_weight) || 0) : (Number(r.roll_length) || 0)), 0);
                      return `${total.toFixed(isKg ? 3 : 2)} ${viewRollsUnit}`;
                    })()}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Barcode</TableHead>
                        <TableHead>Quantity ({viewRollsUnit})</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>GRN</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewFabricRolls.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-gray-500 text-sm">No rolls found</TableCell>
                        </TableRow>
                      ) : (
                        viewFabricRolls.map((r) => {
                          const isKg = (viewRollsUnit || 'kg').toLowerCase().includes('kg');
                          const w = Number(r.roll_weight ?? 0);
                          const l = Number(r.roll_length ?? 0);
                          const qty = isKg ? (w > 0 ? w : l) : (l > 0 ? l : w);
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono">{r.roll_barcode || '-'}</TableCell>
                              <TableCell>{qty}</TableCell>
                              <TableCell>LKR {Number(r.unit_price || 0).toFixed(2)}</TableCell>
                              <TableCell>{r.goods_received_id}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewRollsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <ModernLayout
      title="Raw Materials"
      description="Manage raw materials, inventory, and supplier information"
      icon={Package}
      gradient="bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700"
    >
      <MaterialsContent />
    </ModernLayout>
  );
};

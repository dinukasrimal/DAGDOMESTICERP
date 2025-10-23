import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Plus, 
  Minus, 
  Package, 
  Factory, 
  Palette, 
  Ruler, 
  Globe,
  ShoppingCart,
  AlertTriangle,
  Search,
  X,
  DollarSign,
  Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BOMService, MultiProductBOMCreate } from '../../services/bomService';
import { RawMaterialsService, RawMaterialWithInventory, MaterialCategory } from '../../services/rawMaterialsService';

const bomService = new BOMService();
const rawMaterialsService = new RawMaterialsService();

interface Product {
  id: number;
  name: string;
  default_code: string | null;
  colour: string | null;
  size: string | null;
}

interface ProductVariant {
  product: Product;
  variant_key: string; // combination of product_id, size, color
  display_name: string;
}

interface VariantConsumption {
  variant_key: string;
  product_id: number;
  product_name: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unit: string;
  waste_percentage: number;
}

type FabricUsageOption = 'body' | 'gusset_1' | 'gusset_2';

const FABRIC_USAGE_OPTIONS: { value: FabricUsageOption; label: string }[] = [
  { value: 'body', label: 'Body' },
  { value: 'gusset_1', label: 'Gusset 1' },
  { value: 'gusset_2', label: 'Gusset 2' }
];

const isFabricMaterial = (material?: RawMaterialWithInventory | null) => {
  const categoryName = material?.category?.name;
  return typeof categoryName === 'string' && categoryName.toLowerCase().includes('fabric');
};

const createMaterialEntryId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `fabric-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

interface SelectedRawMaterial {
  entryId: string;
  raw_material_id: number;
  raw_material: RawMaterialWithInventory;
  variant_consumptions: VariantConsumption[];
  notes: string;
  fabricUsage: FabricUsageOption | null;
}

interface MultiProductBOMCreatorProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const MultiProductBOMCreator: React.FC<MultiProductBOMCreatorProps> = ({
  open,
  onClose,
  onSuccess
}) => {
  const [step, setStep] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialWithInventory[]>([]);
  const [materialCategories, setMaterialCategories] = useState<MaterialCategory[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [selectedRawMaterials, setSelectedRawMaterials] = useState<SelectedRawMaterial[]>([]);
  const [productVariants, setProductVariants] = useState<ProductVariant[]>([]);
  const [uniqueColors, setUniqueColors] = useState<string[]>([]);
  const [uniqueSizes, setUniqueSizes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Bulk application states
  const [bulkQuantity, setBulkQuantity] = useState<number>(0);
  const [bulkWaste, setBulkWaste] = useState<number>(0);
  
  // Material navigation state
  const [currentMaterialIndex, setCurrentMaterialIndex] = useState<number>(0);
  const [showMaterialsByCategory, setShowMaterialsByCategory] = useState(false);
  const { toast } = useToast();

  // BOM Header Data
  const [bomName, setBomName] = useState('');
  const [bomVersion, setBomVersion] = useState('1.0');
  const [bomQuantity, setBomQuantity] = useState(1);
  const [bomUnit, setBomUnit] = useState('pieces');
  const [bomDescription, setBomDescription] = useState('');
  const [isCategoryWiseBOM, setIsCategoryWiseBOM] = useState(false);
  
  // Selected categories for category-wise BOM
  const [selectedCategories, setSelectedCategories] = useState<MaterialCategory[]>([]);
  
  // Category consumption data: category_id -> variant_key -> {quantity, waste_percentage, notes}
  const [categoryConsumptions, setCategoryConsumptions] = useState<{
    [category_id: number]: {
      [variant_key: string]: {
        quantity: number;
        unit: string;
        waste_percentage: number;
      };
    };
  }>({});
  
  // Category notes
  const [categoryNotes, setCategoryNotes] = useState<{[category_id: number]: string}>({});

  const hasPendingFabricUsage = selectedRawMaterials.some(
    (rm) => isFabricMaterial(rm.raw_material) && !rm.fabricUsage
  );

  useEffect(() => {
    if (open) {
      loadInitialData();
    }
  }, [open]);

  useEffect(() => {
    if (selectedProducts.length > 0) {
      const productIds = selectedProducts.map(p => p.id);
      loadAttributesForProducts(productIds);
      generateProductVariants();
    } else {
      setProductVariants([]);
      setUniqueColors([]);
      setUniqueSizes([]);
    }
  }, [selectedProducts]);

  useEffect(() => {
    if (step === 2) {
      setSearchTerm('');
    }
  }, [step]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      console.log('Loading initial data for Multi-Product BOM Creator...');
      
      const [productsData, materialsData, categoriesData] = await Promise.all([
        bomService.getAllProducts(),
        rawMaterialsService.getRawMaterials(),
        rawMaterialsService.getCategories()
      ]);
      
      console.log('Loaded data:', {
        products: productsData.length,
        materials: materialsData.length,
        categories: categoriesData.length
      });
      
      setProducts(productsData);
      setRawMaterials(materialsData);
      setMaterialCategories(categoriesData);
    } catch (error: any) {
      console.error('Error loading initial data:', error);
      toast({
        title: 'Error Loading Data',
        description: error.message || 'Failed to load products and materials. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAttributesForProducts = async (productIds: number[]) => {
    try {
      const [colors, sizes] = await Promise.all([
        bomService.getUniqueColorsForProducts(productIds),
        bomService.getUniqueSizesForProducts(productIds)
      ]);
      setUniqueColors(colors);
      setUniqueSizes(sizes);
    } catch (error) {
      console.error('Error loading attributes:', error);
    }
  };

  const generateProductVariants = () => {
    const variants: ProductVariant[] = [];
    
    // Always generate product-based variants regardless of category-wise setting
    // Category-wise only affects how consumption is defined, not which products are shown
    selectedProducts.forEach(product => {
      const variantKey = `${product.default_code || product.name}|${product.size || 'no-size'}|${product.colour || 'no-color'}`;
      const displayName = `${product.name}${product.size ? ` - ${product.size}` : ''}${product.colour ? ` - ${product.colour}` : ''}`;
      
      variants.push({
        product,
        variant_key: variantKey,
        display_name: displayName
      });
    });
    
    setProductVariants(variants);
  };

  const handleProductToggle = (product: Product) => {
    setSelectedProducts(prev => {
      const exists = prev.find(p => p.id === product.id);
      if (exists) {
        return prev.filter(p => p.id !== product.id);
      } else {
        return [...prev, product];
      }
    });
  };

  const handleCategoryToggle = (category: MaterialCategory) => {
    setSelectedCategories(prev => {
      const exists = prev.find(c => c.id === category.id);
      if (exists) {
        return prev.filter(c => c.id !== category.id);
      } else {
        return [...prev, category];
      }
    });
  };


  const handleAddRawMaterial = (rawMaterial: RawMaterialWithInventory) => {
    if (hasPendingFabricUsage) {
      toast({
        title: 'Select fabric usage',
        description: 'Please choose whether the pending fabric is for the body, gusset 1, or gusset 2 before adding another material.',
        variant: 'destructive'
      });
      return;
    }

    const fabricMaterial = isFabricMaterial(rawMaterial);

    if (!fabricMaterial) {
      const exists = selectedRawMaterials.find(rm => rm.raw_material_id === rawMaterial.id);
      if (exists) {
        toast({
          title: 'Already added',
          description: 'This material is already part of the BOM. Adjust its consumption instead of adding it again.',
          variant: 'destructive'
        });
        return;
      }
    }

    let variantConsumptions: VariantConsumption[] = [];

    variantConsumptions = productVariants.map(variant => ({
      variant_key: variant.variant_key,
      product_id: variant.product.id,
      product_name: variant.product.name,
      size: variant.product.size,
      color: variant.product.colour,
      quantity: 0,
      unit: rawMaterial.base_unit,
      waste_percentage: 0
    }));

    let defaultFabricUsage: FabricUsageOption | null = null;
    if (fabricMaterial) {
      const existingEntries = selectedRawMaterials.filter(rm => rm.raw_material_id === rawMaterial.id);
      const usedUsages = new Set(
        existingEntries
          .map(entry => entry.fabricUsage)
          .filter((value): value is FabricUsageOption => Boolean(value))
      );
      const availableUsage = FABRIC_USAGE_OPTIONS.find(option => !usedUsages.has(option.value));

      if (availableUsage) {
        defaultFabricUsage = availableUsage.value;
      }
    }

    const newRawMaterial: SelectedRawMaterial = {
      entryId: createMaterialEntryId(),
      raw_material_id: rawMaterial.id,
      raw_material: rawMaterial,
      variant_consumptions: variantConsumptions,
      notes: '',
      fabricUsage: defaultFabricUsage
    };

    setSelectedRawMaterials(prev => {
      const updated = [...prev, newRawMaterial];
      setCurrentMaterialIndex(updated.length - 1);
      return updated;
    });
  };

  const handleRemoveRawMaterial = (entryId: string) => {
    setSelectedRawMaterials(prev => {
      const removalIndex = prev.findIndex(rm => rm.entryId === entryId);
      const filtered = prev.filter(rm => rm.entryId !== entryId);
      if (filtered.length === 0) {
        setCurrentMaterialIndex(0);
      } else if (removalIndex !== -1) {
        setCurrentMaterialIndex(prevIndex => {
          if (prevIndex > removalIndex) {
            return Math.max(removalIndex, prevIndex - 1);
          }
          if (prevIndex >= filtered.length) {
            return filtered.length - 1;
          }
          return prevIndex;
        });
      }
      return filtered;
    });
  };

  const handleFabricUsageChange = (entryId: string, usage: FabricUsageOption | null) => {
    setSelectedRawMaterials(prev => prev.map(rm =>
      rm.entryId === entryId
        ? { ...rm, fabricUsage: usage }
        : rm
    ));
  };

  // Bulk application functions
  const applyQuantityToVariants = (entryId: string, quantity: number, targetType: 'all' | 'sizes' | 'colors', targetValues?: string[]) => {
    setSelectedRawMaterials(prev => prev.map(rm => {
      if (rm.entryId !== entryId) return rm;

      return {
        ...rm,
        variant_consumptions: rm.variant_consumptions.map(vc => {
          let shouldApply = false;
          
          if (targetType === 'all') {
            shouldApply = true;
          } else if (targetType === 'sizes' && targetValues) {
            shouldApply = targetValues.includes(vc.size || 'no-size');
          } else if (targetType === 'colors' && targetValues) {
            shouldApply = targetValues.includes(vc.color || 'no-color');
          }
          
          return shouldApply ? { ...vc, quantity } : vc;
        })
      };
    }));
  };

  const applyWasteToVariants = (entryId: string, waste: number, targetType: 'all' | 'sizes' | 'colors', targetValues?: string[]) => {
    setSelectedRawMaterials(prev => prev.map(rm => {
      if (rm.entryId !== entryId) return rm;

      return {
        ...rm,
        variant_consumptions: rm.variant_consumptions.map(vc => {
          let shouldApply = false;
          
          if (targetType === 'all') {
            shouldApply = true;
          } else if (targetType === 'sizes' && targetValues) {
            shouldApply = targetValues.includes(vc.size || 'no-size');
          } else if (targetType === 'colors' && targetValues) {
            shouldApply = targetValues.includes(vc.color || 'no-color');
          }
          
          return shouldApply ? { ...vc, waste_percentage: waste } : vc;
        })
      };
    }));
  };

  // Apply value from a specific variant to related variants
  const applyValueFromVariant = (
    entryId: string, 
    sourceVariantKey: string, 
    field: 'quantity' | 'waste_percentage',
    targetType: 'all' | 'sizes' | 'colors'
  ) => {
    setSelectedRawMaterials(prev => prev.map(rm => {
      if (rm.entryId !== entryId) return rm;

      // Find the source variant to get the value
      const sourceVariant = rm.variant_consumptions.find(vc => vc.variant_key === sourceVariantKey);
      if (!sourceVariant) return rm;

      const sourceValue = sourceVariant[field];

      return {
        ...rm,
        variant_consumptions: rm.variant_consumptions.map(vc => {
          let shouldApply = false;
          
          if (targetType === 'all') {
            shouldApply = true;
          } else if (targetType === 'sizes') {
            // Apply to variants with the same size as the source
            shouldApply = vc.size === sourceVariant.size;
          } else if (targetType === 'colors') {
            // Apply to variants with the same color as the source
            shouldApply = vc.color === sourceVariant.color;
          }
          
          return shouldApply ? { ...vc, [field]: sourceValue } : vc;
        })
      };
    }));
  };

  // Helper functions for category consumption management
  const updateCategoryConsumption = (
    categoryId: number,
    variantKey: string,
    field: 'quantity' | 'waste_percentage',
    value: number
  ) => {
    setCategoryConsumptions(prev => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] || {}),
        [variantKey]: {
          ...(prev[categoryId]?.[variantKey] || { quantity: 0, unit: 'units', waste_percentage: 0 }),
          [field]: value
        }
      }
    }));
  };

  const getCategoryConsumption = (categoryId: number, variantKey: string) => {
    return categoryConsumptions[categoryId]?.[variantKey] || { quantity: 0, unit: 'units', waste_percentage: 0 };
  };

  const updateCategoryNotes = (categoryId: number, notes: string) => {
    setCategoryNotes(prev => ({
      ...prev,
      [categoryId]: notes
    }));
  };

  const handleVariantConsumptionChange = (
    entryId: string, 
    variantKey: string, 
    field: 'quantity' | 'waste_percentage', 
    value: number
  ) => {
    setSelectedRawMaterials(prev => prev.map(rm => {
      if (rm.entryId !== entryId) return rm;

      return {
        ...rm,
        variant_consumptions: rm.variant_consumptions.map(vc => 
          vc.variant_key === variantKey 
            ? { ...vc, [field]: value }
            : vc
        )
      };
    }));
  };

  const handleCreateBOM = async () => {
    try {
      const hasSelectedItems = isCategoryWiseBOM ? selectedCategories.length > 0 : selectedRawMaterials.length > 0;
      
      if (!bomName || selectedProducts.length === 0 || !hasSelectedItems) {
        toast({
          title: 'Validation Error',
          description: `Please fill in all required fields and select products and ${isCategoryWiseBOM ? 'categories' : 'materials'}`,
          variant: 'destructive'
        });
        return;
      }

      if (!isCategoryWiseBOM) {
        const pendingFabricMaterials = selectedRawMaterials.filter(
          (rm) => isFabricMaterial(rm.raw_material) && !rm.fabricUsage
        );
        if (pendingFabricMaterials.length > 0) {
          toast({
            title: 'Fabric usage required',
            description: 'Please specify whether each fabric material is used for the body, gusset 1, or gusset 2 before creating the BOM.',
            variant: 'destructive'
          });
          return;
        }
      }

      setLoading(true);
      
      // Prepare raw materials data based on BOM type
      let rawMaterialsData;
      
      if (isCategoryWiseBOM) {
        // For category-wise BOMs, create category-level entries
        rawMaterialsData = [];
        
        for (const category of selectedCategories) {
          const consumptions = [];
          
          // Create consumptions for each product variant at category level
          for (const variant of productVariants) {
            const consumption = getCategoryConsumption(category.id, variant.variant_key);
            if (consumption.quantity > 0) {
              consumptions.push({
                attribute_type: 'category',
                attribute_value: variant.product.name || variant.variant_key,
                quantity: consumption.quantity,
                unit: consumption.unit,
                waste_percentage: consumption.waste_percentage,
                product_id: variant.product.id,
              });
            }
          }
          
          if (consumptions.length > 0) {
            // Use the category ID as a special raw_material_id (negative to distinguish from real materials)
            // This is a workaround since the schema expects raw_material_id
            rawMaterialsData.push({
              raw_material_id: -(category.id), // Negative ID to indicate category
              consumption_type: 'category_wise',
              consumptions,
              notes: `CATEGORY:${category.id}:${category.name}:${categoryNotes[category.id] || ''}`
            });
          }
        }
      } else {
        // For regular BOMs, use existing raw materials data
        rawMaterialsData = selectedRawMaterials.map(rm => ({
          raw_material_id: rm.raw_material_id,
          consumption_type: 'general',
          consumptions: rm.variant_consumptions.map(vc => ({
            attribute_type: 'general',
            attribute_value: vc.product_name || vc.variant_key,
            quantity: vc.quantity,
            unit: vc.unit,
            waste_percentage: vc.waste_percentage,
            product_id: vc.product_id,
          })),
          fabric_usage: isFabricMaterial(rm.raw_material) ? rm.fabricUsage : null,
          notes: rm.notes
        }));
      }

      const bomData: MultiProductBOMCreate = {
        name: bomName,
        version: bomVersion,
        quantity: bomQuantity,
        unit: bomUnit,
        description: bomDescription,
        product_ids: selectedProducts.map(p => p.id),
        is_category_wise: isCategoryWiseBOM,
        raw_materials: rawMaterialsData
      };

      await bomService.createMultiProductBOM(bomData);

      toast({
        title: 'Success',
        description: 'Multi-product BOM created successfully'
      });

      handleClose();
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create BOM',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedProducts([]);
    setSelectedRawMaterials([]);
    setSelectedCategories([]);
    setCategoryConsumptions({});
    setCategoryNotes({});
    setProductVariants([]);
    setBomName('');
    setBomVersion('1.0');
    setBomQuantity(1);
    setBomUnit('pieces');
    setBomDescription('');
    setIsCategoryWiseBOM(false);
    setUniqueColors([]);
    setUniqueSizes([]);
    setSearchTerm('');
    setBulkQuantity(0);
    setBulkWaste(0);
    setCurrentMaterialIndex(0);
    onClose();
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.default_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.colour?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.size?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRawMaterials = rawMaterials.filter(material =>
    material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    material.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get materials for a specific category
  const getMaterialsForCategory = (categoryId: number): RawMaterialWithInventory[] => {
    return filteredRawMaterials.filter(material => material.category_id === categoryId);
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      {/* BOM Header Information */}
      <Card className="bg-gradient-to-br from-orange-50/50 to-red-50/50 border-orange-200">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Factory className="h-5 w-5 text-orange-600" />
            <span>BOM Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bom_name" className="text-sm font-semibold">BOM Name *</Label>
              <Input
                id="bom_name"
                value={bomName}
                onChange={(e) => setBomName(e.target.value)}
                placeholder="Multi-Product T-Shirt BOM"
                className="bg-white border-orange-200 focus:border-orange-400"
              />
            </div>
            <div>
              <Label htmlFor="bom_version" className="text-sm font-semibold">Version</Label>
              <Input
                id="bom_version"
                value={bomVersion}
                onChange={(e) => setBomVersion(e.target.value)}
                placeholder="1.0"
                className="bg-white border-orange-200 focus:border-orange-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="bom_quantity" className="text-sm font-semibold">Quantity</Label>
              <Input
                id="bom_quantity"
                type="number"
                min="0.01"
                step="0.01"
                value={bomQuantity}
                onChange={(e) => setBomQuantity(parseFloat(e.target.value) || 1)}
                className="bg-white border-orange-200 focus:border-orange-400"
              />
            </div>
            <div>
              <Label htmlFor="bom_unit" className="text-sm font-semibold">Unit</Label>
              <Input
                id="bom_unit"
                value={bomUnit}
                onChange={(e) => setBomUnit(e.target.value)}
                placeholder="pieces"
                className="bg-white border-orange-200 focus:border-orange-400"
              />
            </div>
            <div>
              <Label htmlFor="bom_description" className="text-sm font-semibold">Description</Label>
              <Textarea
                id="bom_description"
                value={bomDescription}
                onChange={(e) => setBomDescription(e.target.value)}
                placeholder="BOM description..."
                className="bg-white border-orange-200 focus:border-orange-400 resize-none"
                rows={1}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-blue-600" />
              <span>Select Products ({selectedProducts.length} selected)</span>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardTitle>
          <CardDescription>
            Select multiple products for this BOM. You can mix different sizes and colors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Loading products...</p>
              </div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">
                {searchTerm ? 'No products found matching your search' : 'No products available'}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Total products loaded: {products.length}
              </p>
              <div className="flex justify-center space-x-2">
                {searchTerm && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setSearchTerm('')}
                    className="text-xs"
                  >
                    Clear search
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadInitialData}
                  className="text-xs"
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {filteredProducts.map((product) => {
              const isSelected = selectedProducts.some(p => p.id === product.id);
              return (
                <div
                  key={product.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-blue-50 border-blue-200 shadow-sm' 
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => handleProductToggle(product)}
                >
                  <Checkbox 
                    checked={isSelected}
                    onCheckedChange={() => handleProductToggle(product)}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-gray-500 flex items-center space-x-4">
                      <span>Code: {product.default_code || 'N/A'}</span>
                      {product.colour && (
                        <div className="flex items-center space-x-1">
                          <Palette className="h-3 w-3" />
                          <span>{product.colour}</span>
                        </div>
                      )}
                      {product.size && (
                        <div className="flex items-center space-x-1">
                          <Ruler className="h-3 w-3" />
                          <span>{product.size}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selection Summary */}
      {selectedProducts.length > 0 && (
        <Card className="bg-blue-50/30 border-blue-200">
          <CardHeader>
            <CardTitle className="text-sm">
              Selected Products Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Products:</strong> {selectedProducts.length}
                <div className="mt-1">
                  {selectedProducts.slice(0, 3).map(p => p.name).join(', ')}
                  {selectedProducts.length > 3 && ` and ${selectedProducts.length - 3} more...`}
                </div>
              </div>
              <div>
                <strong>Unique Colors:</strong> {uniqueColors.length}
                <div className="mt-1">{uniqueColors.join(', ') || 'None'}</div>
                <strong>Unique Sizes:</strong> {uniqueSizes.length}
                <div className="mt-1">{uniqueSizes.join(', ') || 'None'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Product Variants Overview */}
      <Card className="bg-blue-50/30 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Package className="h-5 w-5 text-blue-600" />
            <span>Selected Product Variants ({productVariants.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {productVariants.map((variant, index) => (
              <div key={variant.variant_key} className="bg-white p-3 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-700">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{variant.display_name}</div>
                    <div className="text-xs text-gray-500 flex items-center space-x-2 mt-1">
                      {variant.product.size && (
                        <div className="flex items-center space-x-1">
                          <Ruler className="h-3 w-3" />
                          <span>{variant.product.size}</span>
                        </div>
                      )}
                      {variant.product.colour && (
                        <div className="flex items-center space-x-1">
                          <Palette className="h-3 w-3" />
                          <span>{variant.product.colour}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Raw Materials Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShoppingCart className="h-5 w-5 text-purple-600" />
              <span>Raw Materials Selection</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="categoryWiseBOM"
                  checked={isCategoryWiseBOM}
                  onCheckedChange={(checked) => {
                    setIsCategoryWiseBOM(checked as boolean);
                    // Clear selections when switching modes
                    setSelectedRawMaterials([]);
                    setSelectedCategories([]);
                    setCategoryConsumptions({});
                    setCategoryNotes({});
                    setCurrentMaterialIndex(0);
                  }}
                />
                <Label htmlFor="categoryWiseBOM" className="text-sm font-medium cursor-pointer">
                  Category-based Consumption
                </Label>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search materials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasPendingFabricUsage && !isCategoryWiseBOM && (
            <Alert className="mb-4 bg-red-50 border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700 text-sm">
                Select the fabric usage (Body, Gusset 1, or Gusset 2) for the highlighted fabric material before adding another item.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Available Raw Materials */}
            <div>
              <h4 className="font-medium mb-3">
                {isCategoryWiseBOM ? 'Material Categories' : 'Available Raw Materials'}
              </h4>
              <div className="max-h-64 overflow-y-auto space-y-2 border rounded-lg p-3">
                {isCategoryWiseBOM ? (
                  // Show actual material categories for selection
                  materialCategories.map((category) => {
                    const isSelected = selectedCategories.some(c => c.id === category.id);
                    const materialsInCategory = getMaterialsForCategory(category.id);
                    return (
                      <div
                        key={category.id}
                        className={`flex items-center justify-between p-3 rounded border transition-all cursor-pointer ${
                          isSelected ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => handleCategoryToggle(category)}
                      >
                        <div className="flex items-center space-x-3">
                          <Checkbox 
                            checked={isSelected}
                            onCheckedChange={() => handleCategoryToggle(category)}
                          />
                          <div>
                            <div className="font-medium text-sm flex items-center space-x-2">
                              <span>{category.name}</span>
                              <div className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center text-xs font-medium text-purple-700">
                                {materialsInCategory.length}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {materialsInCategory.slice(0, 2).map(m => m.name).join(', ')}
                              {materialsInCategory.length > 2 && ` +${materialsInCategory.length - 2} more`}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  // Show individual materials
                  filteredRawMaterials.map((material) => {
                    const isSelected = selectedRawMaterials.some(rm => rm.raw_material_id === material.id);
                    const fabricMaterial = isFabricMaterial(material);
                    const disableAdd = !fabricMaterial && isSelected;
                    return (
                      <div
                        key={material.id}
                        className={`flex items-center justify-between p-3 rounded border transition-all ${
                          isSelected ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200'
                        } ${disableAdd ? 'cursor-not-allowed opacity-70' : 'hover:bg-gray-50 cursor-pointer'}`}
                        onClick={() => {
                          if (disableAdd) return;
                          handleAddRawMaterial(material);
                        }}
                      >
                        <div>
                          <div className="font-medium text-sm">{material.name}</div>
                          <div className="text-xs text-gray-500 flex items-center space-x-3">
                            <span>{material.code || 'No code'}</span>
                            <span className="flex items-center space-x-1">
                              <Package className="h-3 w-3" />
                              <span>{material.base_unit}</span>
                            </span>
                            {material.cost_per_unit && (
                              <span className="flex items-center space-x-1 text-green-600">
                                <DollarSign className="h-3 w-3" />
                                <span>LKR {material.cost_per_unit}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {!disableAdd && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddRawMaterial(material);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Selected Items */}
            <div>
              <h4 className="font-medium mb-3">
                {isCategoryWiseBOM ? `Selected Categories (${selectedCategories.length})` : `Selected Materials (${selectedRawMaterials.length})`}
              </h4>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {isCategoryWiseBOM ? (
                  // Show selected categories
                  selectedCategories.map((category, index) => {
                    const materialsInCategory = getMaterialsForCategory(category.id);
                    return (
                      <div 
                        key={category.id} 
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                          index === currentMaterialIndex 
                            ? 'bg-purple-100 border-purple-300 ring-2 ring-purple-200' 
                            : 'bg-purple-50 border-purple-200 hover:bg-purple-75'
                        }`}
                        onClick={() => setCurrentMaterialIndex(index)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm flex items-center space-x-2">
                              <span>{category.name}</span>
                              <div className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center text-xs font-medium text-purple-700">
                                {materialsInCategory.length}
                              </div>
                              {index === currentMaterialIndex && (
                                <Badge variant="secondary" className="text-xs">Current</Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {materialsInCategory.slice(0, 2).map(m => m.name).join(', ')}
                              {materialsInCategory.length > 2 && ` +${materialsInCategory.length - 2} more`}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategories(prev => {
                                const filtered = prev.filter(c => c.id !== category.id);
                                if (filtered.length === 0) {
                                  setCurrentMaterialIndex(0);
                                } else if (currentMaterialIndex >= filtered.length) {
                                  setCurrentMaterialIndex(filtered.length - 1);
                                }
                                return filtered;
                              });
                            }}
                            className="text-red-600 hover:bg-red-100"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  // Show selected materials
                  selectedRawMaterials.map((rm, index) => {
                    const fabricMaterial = isFabricMaterial(rm.raw_material);
                    const fabricUsageMissing = fabricMaterial && !rm.fabricUsage;
                    const usageLabel = rm.fabricUsage
                      ? FABRIC_USAGE_OPTIONS.find((opt) => opt.value === rm.fabricUsage)?.label || rm.fabricUsage
                      : null;
                    return (
                      <div 
                        key={rm.entryId} 
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                          index === currentMaterialIndex 
                            ? 'bg-purple-100 border-purple-300 ring-2 ring-purple-200' 
                            : 'bg-purple-50 border-purple-200 hover:bg-purple-75'
                        }`}
                        onClick={() => setCurrentMaterialIndex(index)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm flex items-center space-x-2">
                              <span>{rm.raw_material.name}</span>
                              {index === currentMaterialIndex && (
                                <Badge variant="secondary" className="text-xs">Current</Badge>
                              )}
                              {fabricMaterial && (
                                <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px] uppercase tracking-wide">
                                  Fabric
                                </Badge>
                              )}
                              {fabricMaterial && usageLabel && (
                                <Badge className="bg-orange-200 text-orange-900 border-orange-300 text-[10px] uppercase tracking-wide">
                                  {usageLabel}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 flex flex-wrap items-center gap-2 mt-1">
                              <span>{rm.raw_material.code || 'No code'}</span>
                              <span className="flex items-center space-x-1">
                                <Package className="h-3 w-3" />
                                <span>{rm.raw_material.base_unit}</span>
                              </span>
                              {rm.raw_material.cost_per_unit && (
                                <span className="flex items-center space-x-1 text-green-600">
                                  <DollarSign className="h-3 w-3" />
                                  <span>LKR {rm.raw_material.cost_per_unit}</span>
                                </span>
                              )}
                            </div>
                            {fabricUsageMissing && (
                              <div className="flex items-center space-x-1 text-[11px] text-red-700 mt-2">
                                <AlertTriangle className="h-3 w-3" />
                                <span>Usage required</span>
                              </div>
                            )}
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveRawMaterial(rm.entryId);
                            }}
                            className="text-red-600 hover:bg-red-100"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consumption Management */}
      {(isCategoryWiseBOM ? selectedCategories.length > 0 : selectedRawMaterials.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span>Consumption Configuration</span>
              {(isCategoryWiseBOM ? selectedCategories.length > 1 : selectedRawMaterials.length > 1) && (
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentMaterialIndex(Math.max(0, currentMaterialIndex - 1))}
                    disabled={currentMaterialIndex === 0}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-600">
                    {currentMaterialIndex + 1} of {isCategoryWiseBOM ? selectedCategories.length : selectedRawMaterials.length}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentMaterialIndex(Math.min((isCategoryWiseBOM ? selectedCategories.length : selectedRawMaterials.length) - 1, currentMaterialIndex + 1))}
                    disabled={currentMaterialIndex === (isCategoryWiseBOM ? selectedCategories.length : selectedRawMaterials.length) - 1}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardTitle>
            <CardDescription>
              {isCategoryWiseBOM 
                ? 'Set consumption quantities for each material category. Define how much of each category is needed per product variant.'
                : 'Set consumption quantities for each product variant. Use bulk apply to set multiple variants at once.'
              }
              {(isCategoryWiseBOM ? selectedCategories.length > 1 : selectedRawMaterials.length > 1) && " Use the navigation controls above to switch between items."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {isCategoryWiseBOM ? (
                // Category-based consumption
                selectedCategories.length > 0 && (() => {
                  const category = selectedCategories[currentMaterialIndex];
                  if (!category) return null;
                  const materialsInCategory = getMaterialsForCategory(category.id);
                  return (
                    <div key={category.id} className="border border-gray-200 rounded-xl p-6 bg-gray-50/30">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h4 className="font-semibold text-lg flex items-center space-x-2">
                            <div className="p-2 rounded-lg bg-purple-100">
                              <Package className="h-4 w-4 text-purple-600" />
                            </div>
                            <span>{category.name} Category</span>
                          </h4>
                          <p className="text-sm text-gray-500 mt-1">
                            {materialsInCategory.length} materials • Define consumption per product variant
                          </p>
                        </div>
                      </div>

                      {/* Category Consumption by Product Variants */}
                      <div className="space-y-3">
                        <h5 className="font-medium text-sm flex items-center space-x-2">
                          <Factory className="h-4 w-4 text-gray-600" />
                          <span>Consumption by Product Variant</span>
                        </h5>
                        <div className="grid gap-3">
                          {productVariants.map((variant) => (
                            <div key={variant.variant_key} className="bg-white p-4 rounded-lg border border-gray-200">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm">{variant.display_name}</div>
                                  <div className="text-xs text-gray-500 flex items-center space-x-3 mt-1">
                                    {variant.product.size && (
                                      <div className="flex items-center space-x-1">
                                        <Ruler className="h-3 w-3 text-blue-600" />
                                        <span>{variant.product.size}</span>
                                      </div>
                                    )}
                                    {variant.product.colour && (
                                      <div className="flex items-center space-x-1">
                                        <Palette className="h-3 w-3 text-purple-600" />
                                        <span>{variant.product.colour}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium text-gray-600">Category Quantity</Label>
                                  <div className="flex items-center space-x-2">
                                    <Input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={getCategoryConsumption(category.id, variant.variant_key).quantity || ''}
                                      onChange={(e) => updateCategoryConsumption(
                                        category.id,
                                        variant.variant_key,
                                        'quantity',
                                        parseFloat(e.target.value) || 0
                                      )}
                                      className="w-20 h-8 text-sm"
                                    />
                                    <span className="text-xs text-gray-500 min-w-fit">units</span>
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label className="text-xs font-medium text-gray-600">Waste %</Label>
                                  <div className="flex items-center space-x-2">
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                      placeholder="0"
                                      value={getCategoryConsumption(category.id, variant.variant_key).waste_percentage || ''}
                                      onChange={(e) => updateCategoryConsumption(
                                        category.id,
                                        variant.variant_key,
                                        'waste_percentage',
                                        parseFloat(e.target.value) || 0
                                      )}
                                      className="w-16 h-8 text-sm"
                                    />
                                    <span className="text-xs text-gray-500">%</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Category Notes */}
                      <div className="mt-4">
                        <Label className="text-sm font-medium">Category Notes</Label>
                        <Textarea
                          placeholder={`Notes for ${category.name} category consumption...`}
                          value={categoryNotes[category.id] || ''}
                          onChange={(e) => updateCategoryNotes(category.id, e.target.value)}
                          className="mt-1 resize-none text-sm bg-white"
                          rows={2}
                        />
                      </div>
                    </div>
                  );
                })()
              ) : (
                // Material-based consumption
              selectedRawMaterials.length > 0 && (() => {
                  const rm = selectedRawMaterials[currentMaterialIndex];
                  if (!rm) return null;
                  const fabricMaterial = isFabricMaterial(rm.raw_material);
                  const fabricUsageMissing = fabricMaterial && !rm.fabricUsage;
                  return (
                <div key={rm.entryId} className="border border-gray-200 rounded-xl p-6 bg-gray-50/30">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h4 className="font-semibold text-lg flex items-center space-x-2">
                        <div className="p-2 rounded-lg bg-purple-100">
                          <Package className="h-4 w-4 text-purple-600" />
                        </div>
                        <span>{rm.raw_material.name}</span>
                      </h4>
                      <p className="text-sm text-gray-500 mt-1">
                        Base unit: {rm.raw_material.base_unit} 
                        {rm.raw_material.cost_per_unit && ` • LKR ${rm.raw_material.cost_per_unit} per ${rm.raw_material.purchase_unit}`}
                      </p>
                    </div>
                  </div>

                  {fabricMaterial && (
                    <div className={`mb-5 rounded-xl border p-4 ${
                      fabricUsageMissing ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <Label className="text-sm font-semibold text-orange-800">Fabric Usage *</Label>
                          <Select
                            value={rm.fabricUsage ?? undefined}
                            onValueChange={(value) => handleFabricUsageChange(rm.entryId, value as FabricUsageOption)}
                          >
                            <SelectTrigger className="bg-white border-orange-200 focus:border-orange-400 focus:ring-orange-200 h-9">
                              <SelectValue placeholder="Select how this fabric is used" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-orange-200">
                              {FABRIC_USAGE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value} className="hover:bg-orange-50">
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-600">
                            Identify whether this fabric is used for the main body or one of the gussets.
                          </p>
                          {fabricUsageMissing && (
                            <div className="flex items-center space-x-2 text-xs text-red-700">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Required before you can add another material.</span>
                            </div>
                          )}
                        </div>
                        {rm.fabricUsage && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleFabricUsageChange(rm.entryId, null)}
                            className="h-8 text-xs text-orange-700 hover:text-orange-800"
                          >
                            <X className="h-3 w-3 mr-1" />
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bulk Application Controls */}
                  <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
                    <h5 className="font-medium mb-3 flex items-center space-x-2">
                      <Globe className="h-4 w-4 text-blue-600" />
                      <span>Bulk Apply Consumption</span>
                    </h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-xs font-medium">Quantity</Label>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={bulkQuantity}
                          onChange={(e) => {
                            const next = parseFloat(e.target.value);
                            setBulkQuantity(Number.isNaN(next) ? 0 : next);
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium">Waste %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={bulkWaste}
                          onChange={(e) => {
                            const next = parseFloat(e.target.value);
                            setBulkWaste(Number.isNaN(next) ? 0 : next);
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Apply To</Label>
                        <div className="flex space-x-1">
                          <Button 
                            type="button" 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              applyQuantityToVariants(rm.entryId, bulkQuantity, 'all');
                              applyWasteToVariants(rm.entryId, bulkWaste, 'all');
                            }}
                            className="h-8 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                          >
                            All
                          </Button>
                          {uniqueSizes.length > 0 && (
                            <Button 
                              type="button" 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                applyQuantityToVariants(rm.entryId, bulkQuantity, 'sizes', uniqueSizes);
                                applyWasteToVariants(rm.entryId, bulkWaste, 'sizes', uniqueSizes);
                              }}
                              className="h-8 text-xs bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                            >
                              Sizes
                            </Button>
                          )}
                          {uniqueColors.length > 0 && (
                            <Button 
                              type="button" 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                applyQuantityToVariants(rm.entryId, bulkQuantity, 'colors', uniqueColors);
                                applyWasteToVariants(rm.entryId, bulkWaste, 'colors', uniqueColors);
                              }}
                              className="h-8 text-xs bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                            >
                              Colors
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Individual Variant Consumptions */}
                  <div className="space-y-3">
                    <h5 className="font-medium text-sm flex items-center space-x-2">
                      <Factory className="h-4 w-4 text-gray-600" />
                      <span>Consumption by Variant</span>
                    </h5>
                    <div className="grid gap-3">
                      {rm.variant_consumptions.map((vc) => (
                        <div key={vc.variant_key} className="bg-white p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                          {/* Product Info */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{vc.product_name}</div>
                              <div className="text-xs text-gray-500 flex items-center space-x-3 mt-1">
                                {vc.size && (
                                  <div className="flex items-center space-x-1">
                                    <Ruler className="h-3 w-3 text-blue-600" />
                                    <span>{vc.size}</span>
                                  </div>
                                )}
                                {vc.color && (
                                  <div className="flex items-center space-x-1">
                                    <Palette className="h-3 w-3 text-purple-600" />
                                    <span>{vc.color}</span>
                                  </div>
                                )}
                                {!vc.size && !vc.color && (
                                  <div className="flex items-center space-x-1">
                                    <Globe className="h-3 w-3 text-green-600" />
                                    <span>Standard</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Quantity Section */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-gray-600">Quantity</Label>
                              <div className="flex items-center space-x-2">
                                <Input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={vc.quantity}
                                  onChange={(e) => handleVariantConsumptionChange(
                                    rm.entryId,
                                    vc.variant_key,
                                    'quantity',
                                    parseFloat(e.target.value) || 0
                                  )}
                                  className="w-20 h-8 text-sm"
                                  placeholder="Qty"
                                />
                                <span className="text-xs text-gray-500 min-w-fit">{vc.unit}</span>
                              </div>
                              <div className="flex space-x-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => applyValueFromVariant(rm.entryId, vc.variant_key, 'quantity', 'all')}
                                  className="h-6 px-2 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                  title="Apply this quantity to all variants"
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  All
                                </Button>
                                {vc.size && rm.variant_consumptions.some(v => v.size === vc.size && v.variant_key !== vc.variant_key) && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => applyValueFromVariant(rm.entryId, vc.variant_key, 'quantity', 'sizes')}
                                    className="h-6 px-2 text-xs bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                                    title={`Apply this quantity to all ${vc.size} size variants`}
                                  >
                                    <Copy className="h-3 w-3 mr-1" />
                                    Sizes
                                  </Button>
                                )}
                                {vc.color && rm.variant_consumptions.some(v => v.color === vc.color && v.variant_key !== vc.variant_key) && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => applyValueFromVariant(rm.entryId, vc.variant_key, 'quantity', 'colors')}
                                    className="h-6 px-2 text-xs bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                                    title={`Apply this quantity to all ${vc.color} color variants`}
                                  >
                                    <Copy className="h-3 w-3 mr-1" />
                                    Colors
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            {/* Waste Percentage Section */}
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-gray-600">Waste %</Label>
                              <div className="flex items-center space-x-2">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  value={vc.waste_percentage}
                                  onChange={(e) => handleVariantConsumptionChange(
                                    rm.entryId,
                                    vc.variant_key,
                                    'waste_percentage',
                                    parseFloat(e.target.value) || 0
                                  )}
                                  className="w-16 h-8 text-sm"
                                  placeholder="0"
                                />
                                <span className="text-xs text-gray-500">%</span>
                              </div>
                              <div className="flex space-x-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => applyValueFromVariant(rm.entryId, vc.variant_key, 'waste_percentage', 'all')}
                                  className="h-6 px-2 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                  title="Apply this waste % to all variants"
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  All
                                </Button>
                                {vc.size && rm.variant_consumptions.some(v => v.size === vc.size && v.variant_key !== vc.variant_key) && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => applyValueFromVariant(rm.entryId, vc.variant_key, 'waste_percentage', 'sizes')}
                                    className="h-6 px-2 text-xs bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                                    title={`Apply this waste % to all ${vc.size} size variants`}
                                  >
                                    <Copy className="h-3 w-3 mr-1" />
                                    Sizes
                                  </Button>
                                )}
                                {vc.color && rm.variant_consumptions.some(v => v.color === vc.color && v.variant_key !== vc.variant_key) && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => applyValueFromVariant(rm.entryId, vc.variant_key, 'waste_percentage', 'colors')}
                                    className="h-6 px-2 text-xs bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                                    title={`Apply this waste % to all ${vc.color} color variants`}
                                  >
                                    <Copy className="h-3 w-3 mr-1" />
                                    Colors
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="mt-4">
                    <Label htmlFor={`notes-${rm.entryId}`} className="text-sm font-medium">Notes</Label>
                    <Textarea
                      id={`notes-${rm.entryId}`}
                      value={rm.notes}
                      onChange={(e) => setSelectedRawMaterials(prev => prev.map(material => 
                        material.entryId === rm.entryId 
                          ? { ...material, notes: e.target.value }
                          : material
                      ))}
                      placeholder="Additional notes for this material..."
                      className="mt-1 resize-none text-sm bg-white"
                      rows={2}
                    />
                  </div>
                </div>
                );
                })()
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto bg-white/95 backdrop-blur-sm">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center space-x-2 text-xl">
            <Factory className="h-5 w-5 text-orange-600" />
            <span>Create Multi-Product BOM</span>
            <Badge variant="outline" className="ml-2">
              Step {step} of 2
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? 'Select products and define basic BOM information'
              : 'Allocate raw materials and define consumption patterns'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center space-x-4">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                step >= 1 ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {step > 1 ? <Check className="h-4 w-4" /> : '1'}
              </div>
              <div className={`w-16 h-1 ${step >= 2 ? 'bg-orange-600' : 'bg-gray-200'}`}></div>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                step >= 2 ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                2
              </div>
            </div>
          </div>

          {/* Step Content */}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex justify-between w-full">
            <div>
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              )}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              {step < 2 ? (
                <Button 
                  onClick={() => setStep(2)}
                  disabled={selectedProducts.length === 0 || !bomName}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                >
                  Next: Add Materials
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  onClick={handleCreateBOM}
                  disabled={loading || (isCategoryWiseBOM ? selectedCategories.length === 0 : selectedRawMaterials.length === 0)}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                >
                  {loading ? 'Creating...' : 'Create BOM'}
                  <Check className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

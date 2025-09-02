import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Edit, Trash2, Copy, Search, Package, DollarSign, AlertTriangle, FileText, Factory, ChevronLeft, ChevronRight, Users, Palette, Ruler } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { BOMService, BOMWithLines, BOMHeaderInsert, BOMLineInsert, MaterialRequirement } from '../../services/bomService';
import { RawMaterialsService, RawMaterialWithInventory } from '../../services/rawMaterialsService';
import { supabase } from '../../integrations/supabase/client';
import { ModernLayout } from '../layout/ModernLayout';
import { MultiProductBOMCreator } from './MultiProductBOMCreator';

const bomService = new BOMService();
const rawMaterialsService = new RawMaterialsService();

interface BOMFormProps {
  formData: Partial<BOMHeaderInsert>;
  products: Product[];
  onInputChange: (field: keyof BOMHeaderInsert, value: any) => void;
}

const BOMForm: React.FC<BOMFormProps> = React.memo(({
  formData,
  products,
  onInputChange
}) => (
  <div className="space-y-6 bg-gradient-to-br from-orange-50/30 to-red-50/30 p-6 rounded-xl border border-orange-100">
    <div className="space-y-2">
      <Label htmlFor="bom_name" className="text-sm font-semibold text-gray-700">BOM Name *</Label>
      <Input
        id="bom_name"
        name="bom_name"
        autoComplete="off"
        value={formData.name}
        onChange={(e) => onInputChange('name', e.target.value)}
        placeholder="e.g., Standard T-Shirt BOM, Premium Jacket BOM"
        className="bg-white/70 border-orange-200 focus:border-orange-400 focus:ring-orange-200 transition-all duration-200"
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="product" className="text-sm font-semibold text-gray-700">Product *</Label>
      <Select 
        value={formData.product_id?.toString()} 
        onValueChange={(value) => onInputChange('product_id', parseInt(value))}
      >
        <SelectTrigger id="product" className="bg-white/70 border-orange-200 focus:border-orange-400 focus:ring-orange-200">
          <SelectValue placeholder="Choose the product for this BOM" />
        </SelectTrigger>
        <SelectContent className="bg-white border-orange-200">
          {products.map(product => (
            <SelectItem key={product.id} value={product.id.toString()} className="hover:bg-orange-50">
              <div className="flex items-center space-x-2">
                <Package className="h-3 w-3 text-gray-500" />
                <span>{product.name} {product.default_code ? `(${product.default_code})` : ''}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label htmlFor="version" className="text-sm font-semibold text-gray-700">Version</Label>
        <Input
          id="version"
          name="version"
          autoComplete="off"
          value={formData.version}
          onChange={(e) => onInputChange('version', e.target.value)}
          placeholder="1.0"
          className="bg-white/70 border-orange-200 focus:border-orange-400 focus:ring-orange-200 transition-all duration-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quantity" className="text-sm font-semibold text-gray-700">Quantity</Label>
        <Input
          id="quantity"
          name="quantity"
          type="number"
          min="0.01"
          step="0.01"
          autoComplete="off"
          value={formData.quantity}
          onChange={(e) => onInputChange('quantity', parseFloat(e.target.value) || 1)}
          placeholder="1.0"
          className="bg-white/70 border-orange-200 focus:border-orange-400 focus:ring-orange-200 transition-all duration-200"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="unit" className="text-sm font-semibold text-gray-700">Unit</Label>
        <Input
          id="unit"
          name="unit"
          autoComplete="off"
          value={formData.unit}
          onChange={(e) => onInputChange('unit', e.target.value)}
          placeholder="pieces, kg, meters"
          className="bg-white/70 border-orange-200 focus:border-orange-400 focus:ring-orange-200 transition-all duration-200"
        />
      </div>
    </div>
  </div>
));

interface Product {
  id: number;
  name: string;
  default_code: string | null;
}

const BOMContent: React.FC = () => {
  const [boms, setBOMs] = useState<BOMWithLines[]>([]);
  const [filteredBOMs, setFilteredBOMs] = useState<BOMWithLines[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialWithInventory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedBOM, setSelectedBOM] = useState<BOMWithLines | null>(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showMultiCreateDialog, setShowMultiCreateDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [copySourceBOM, setCopySourceBOM] = useState<BOMWithLines | null>(null);
  const { toast } = useToast();

  const [bomFormData, setBOMFormData] = useState<Partial<BOMHeaderInsert>>(() => ({
    name: '',
    product_id: undefined,
    version: '1.0',
    quantity: 1,
    unit: 'pieces'
  }));

  const [copyFormData, setCopyFormData] = useState(() => ({
    targetProductId: '',
    newName: '',
    adjustQuantities: false
  }));

  const [newLineData, setNewLineData] = useState<Partial<BOMLineInsert>>(() => ({
    raw_material_id: undefined,
    quantity: 1,
    unit: '',
    waste_percentage: 0,
    notes: ''
  }));

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = boms.filter(bom =>
        bom.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bom.product?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bom.product?.default_code?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredBOMs(filtered);
    } else {
      setFilteredBOMs(boms);
    }
  }, [searchTerm, boms]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [bomsData, productsData, materialsData] = await Promise.all([
        bomService.getAllBOMs(),
        loadProducts(),
        rawMaterialsService.getRawMaterials()
      ]);
      
      setBOMs(bomsData);
      setFilteredBOMs(bomsData);
      setProducts(productsData);
      setRawMaterials(materialsData);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async (): Promise<Product[]> => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, default_code')
      .eq('active', true)
      .order('name');
    
    if (error) throw error;
    return data || [];
  };

  const handleCreateBOM = async () => {
    try {
      if (!bomFormData.name || !bomFormData.product_id) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields',
          variant: 'destructive'
        });
        return;
      }

      await bomService.createBOM(bomFormData as BOMHeaderInsert);
      
      toast({
        title: 'Success',
        description: 'BOM created successfully'
      });
      
      setShowCreateDialog(false);
      resetBOMForm();
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create BOM',
        variant: 'destructive'
      });
    }
  };

  const handleCopyBOM = async () => {
    try {
      if (!copySourceBOM || !copyFormData.targetProductId || !copyFormData.newName) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields',
          variant: 'destructive'
        });
        return;
      }

      await bomService.copyBOM(
        copySourceBOM.id,
        parseInt(copyFormData.targetProductId),
        copyFormData.newName
      );
      
      toast({
        title: 'Success',
        description: 'BOM copied successfully'
      });
      
      setShowCopyDialog(false);
      setCopySourceBOM(null);
      resetCopyForm();
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to copy BOM',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteBOM = async (bom: BOMWithLines) => {
    if (!confirm(`Are you sure you want to delete BOM "${bom.name}"?`)) {
      return;
    }

    try {
      await bomService.deleteBOM(bom.id);
      
      toast({
        title: 'Success',
        description: 'BOM deleted successfully'
      });
      
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete BOM',
        variant: 'destructive'
      });
    }
  };

  const openCopyDialog = (bom: BOMWithLines) => {
    setCopySourceBOM(bom);
    setCopyFormData({
      targetProductId: '',
      newName: `${bom.name} (Copy)`,
      adjustQuantities: false
    });
    setShowCopyDialog(true);
  };

  const openDetailsDialog = (bom: BOMWithLines) => {
    setSelectedBOM(bom);
    setCurrentProductIndex(0);
    setShowDetailsDialog(true);
  };

  const resetBOMForm = () => {
    setBOMFormData({
      name: '',
      product_id: undefined,
      version: '1.0',
      quantity: 1,
      unit: 'pieces'
    });
  };

  const resetCopyForm = () => {
    setCopyFormData({
      targetProductId: '',
      newName: '',
      adjustQuantities: false
    });
  };

  const calculateBOMCost = (bom: BOMWithLines): number => {
    return bom.lines.reduce((total, line) => {
      if (line.raw_material?.cost_per_unit) {
        const quantityWithWaste = line.quantity * (1 + line.waste_percentage / 100);
        return total + (quantityWithWaste * line.raw_material.cost_per_unit);
      }
      return total;
    }, 0);
  };

  const handleBOMInputChange = useCallback((field: keyof BOMHeaderInsert, value: any) => {
    setBOMFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleCopyInputChange = useCallback((field: string, value: any) => {
    setCopyFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleNewLineInputChange = useCallback((field: keyof BOMLineInsert, value: any) => {
    setNewLineData(prev => ({ ...prev, [field]: value }));
  }, []);


  const CopyForm = React.memo(() => (
    <div className="space-y-6 bg-gradient-to-br from-purple-50/30 to-blue-50/30 p-6 rounded-xl border border-purple-100">
      <Alert className="bg-purple-50 border-purple-200">
        <Copy className="h-4 w-4 text-purple-600" />
        <AlertDescription className="text-purple-800">
          <strong>Source BOM:</strong> {copySourceBOM?.name} → {copySourceBOM?.product?.name}
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="new_name" className="text-sm font-semibold text-gray-700">New BOM Name *</Label>
        <Input
          id="new_name"
          name="new_name"
          autoComplete="off"
          value={copyFormData.newName}
          onChange={(e) => handleCopyInputChange('newName', e.target.value)}
          placeholder="Enter descriptive name for the copied BOM"
          className="bg-white/70 border-purple-200 focus:border-purple-400 focus:ring-purple-200 transition-all duration-200"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="target_product" className="text-sm font-semibold text-gray-700">Target Product *</Label>
        <Select 
          value={copyFormData.targetProductId} 
          onValueChange={(value) => handleCopyInputChange('targetProductId', value)}
        >
          <SelectTrigger id="target_product" className="bg-white/70 border-purple-200 focus:border-purple-400 focus:ring-purple-200">
            <SelectValue placeholder="Choose the product for the copied BOM" />
          </SelectTrigger>
          <SelectContent className="bg-white border-purple-200">
            {products.filter(p => p.id !== copySourceBOM?.product_id).map(product => (
              <SelectItem key={product.id} value={product.id.toString()} className="hover:bg-purple-50">
                <div className="flex items-center space-x-2">
                  <Package className="h-3 w-3 text-gray-500" />
                  <span>{product.name} {product.default_code ? `(${product.default_code})` : ''}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {copySourceBOM && (
        <div className="mt-4 p-4 bg-white/60 rounded-xl border border-purple-200">
          <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
            <Factory className="h-4 w-4 text-purple-600" />
            <span>Source BOM Overview</span>
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Materials:</span>
                <span className="font-medium">{copySourceBOM.lines.length} items</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Version:</span>
                <span className="font-medium">{copySourceBOM.version}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Quantity:</span>
                <span className="font-medium">{copySourceBOM.quantity} {copySourceBOM.unit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Est. Cost:</span>
                <span className="font-semibold text-green-700">LKR {calculateBOMCost(copySourceBOM).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  ));

  const BOMDetails = ({ bom }: { bom: BOMWithLines }) => {
    // Check if this is a multi-product BOM based on multiple criteria:
    // 1. Has product_ids field (new structure)
    // 2. Has multiple products in name pattern like "(PRODUCT1, PRODUCT2 +X more)"
    // 3. Has variant consumption data in the notes field
    const hasProductIds = (bom as any).product_ids && (bom as any).product_ids.length > 0;
    const hasMultiProductName = bom.name.includes('(') && bom.name.includes('+') && bom.name.includes('more)');
    const hasVariantConsumptions = bom.lines.some(line => 
      line.notes && line.notes.includes('Variant consumptions:')
    );
    
    const isMultiProduct = hasProductIds || hasMultiProductName || hasVariantConsumptions || bom.is_category_wise;
    
    // For multi-product BOMs, extract products from various sources
    let products: any[] = [];
    if (hasProductIds) {
      products = (bom as any).products || [];
    } else if (bom.is_category_wise) {
      // For category-wise BOMs, we need to extract the actual products from variant consumption data
      // since the stored "products" are actually categories
      const productSet = new Set<string>();
      
      // Parse variant consumption data to extract actual products
      bom.lines.forEach(line => {
        if (line.notes && line.notes.includes('Variant consumptions:')) {
          try {
            const variantSection = line.notes.split('Variant consumptions:')[1];
            if (variantSection) {
              const variants = variantSection.split(';').map(v => v.trim());
              variants.forEach(variant => {
                const match = variant.match(/^([^:]+):/);
                if (match) {
                  const variantKey = match[1].trim();
                  productSet.add(variantKey);
                }
              });
            }
          } catch (error) {
            console.error('Error parsing variant data:', error);
          }
        }
      });
      
      // Convert to product objects with better parsing
      const uniqueProducts = Array.from(productSet);
      products = uniqueProducts.map((productKey, index) => {
        const parts = productKey.split('-');
        let size = null;
        let colour = null;
        let name = productKey;
        
        if (parts.length >= 2) {
          const lastPart = parts[parts.length - 1];
          const secondLastPart = parts[parts.length - 2];
          
          const colorWords = ['grey', 'gray', 'black', 'white', 'blue', 'red', 'green', 'yellow', 'beige', 'beigh'];
          const isColor = colorWords.some(color => lastPart.toLowerCase().includes(color));
          const isSize = /^\d+$/.test(secondLastPart) || /^(xs|s|m|l|xl|xxl)$/i.test(secondLastPart);
          
          if (isColor) {
            colour = lastPart;
            name = parts.slice(0, -1).join('-');
            if (isSize) {
              size = secondLastPart;
              name = parts.slice(0, -2).join('-');
            }
          } else if (isSize) {
            size = lastPart;
            name = parts.slice(0, -1).join('-');
          }
        }
        
        return {
          id: index + 1000, // Use high IDs to avoid conflicts
          name: name || productKey,
          default_code: productKey,
          colour: colour,
          size: size
        };
      });
    } else if (isMultiProduct) {
      // Extract products from variant consumption data in notes
      const productSet = new Set<string>();
      
      // Parse variant consumption data from all BOM lines to extract unique products
      bom.lines.forEach(line => {
        if (line.notes && line.notes.includes('Variant consumptions:')) {
          try {
            const variantSection = line.notes.split('Variant consumptions:')[1];
            if (variantSection) {
              const variants = variantSection.split(';').map(v => v.trim());
              variants.forEach(variant => {
                const match = variant.match(/^([^:]+):/);
                if (match) {
                  const variantKey = match[1].trim();
                  productSet.add(variantKey);
                }
              });
            }
          } catch (error) {
            console.error('Error parsing variant data:', error);
          }
        }
      });
      
      // Convert to product objects
      const uniqueProducts = Array.from(productSet);
      products = uniqueProducts.map((productKey, index) => {
        // Parse size and color from product key (e.g., "28-grey", "LUCID-BEIGH 38")
        const parts = productKey.split('-');
        let size = null;
        let colour = null;
        let name = productKey;
        
        if (parts.length >= 2) {
          // Try to detect if the last part is a color and the second-to-last is a size
          const lastPart = parts[parts.length - 1];
          const secondLastPart = parts[parts.length - 2];
          
          // Common color names and size patterns
          const colorWords = ['grey', 'gray', 'black', 'white', 'blue', 'red', 'green', 'yellow', 'beige', 'beigh'];
          const isColor = colorWords.some(color => lastPart.toLowerCase().includes(color));
          const isSize = /^\d+$/.test(secondLastPart) || /^(xs|s|m|l|xl|xxl)$/i.test(secondLastPart);
          
          if (isColor) {
            colour = lastPart;
            name = parts.slice(0, -1).join('-');
            if (isSize) {
              size = secondLastPart;
              name = parts.slice(0, -2).join('-');
            }
          } else if (isSize) {
            size = lastPart;
            name = parts.slice(0, -1).join('-');
          }
        }
        
        return {
          id: index + 1,
          name: name || productKey,
          default_code: productKey,
          colour: colour,
          size: size
        };
      });
      
      // If no products found from consumption data, fall back to name parsing
      if (products.length === 0 && hasMultiProductName) {
        const nameMatch = bom.name.match(/\(([^)]+)\)/);
        if (nameMatch) {
          const productNames = nameMatch[1].split(',').map(name => name.trim());
          const moreMatch = bom.name.match(/\+(\d+)\s+more/);
          const moreCount = moreMatch ? parseInt(moreMatch[1]) : 0;
          
          products = productNames.map((name, index) => ({
            id: index + 1,
            name: name,
            default_code: null,
            colour: null,
            size: null
          }));
          
          // Add placeholder products for the "+X more"
          for (let i = 0; i < moreCount; i++) {
            products.push({
              id: products.length + 1,
              name: `Product ${products.length + 1}`,
              default_code: null,
              colour: null,
              size: null
            });
          }
        }
      }
    } else {
      products = bom.product ? [bom.product] : [];
    }
    
    const currentProduct = products[currentProductIndex];
    
    // Parse consumption data from notes field for multi-product BOMs
    const getProductSpecificRequirements = (bomLines: any[], productIndex: number) => {
      if (!isMultiProduct || !currentProduct) return bomLines;
      
      return bomLines.map(line => {
        if (!line.notes || !line.notes.includes('Variant consumptions:')) {
          return {
            ...line,
            quantity: line.quantity,
            waste_percentage: line.waste_percentage,
            productSpecificNote: 'No specific consumption data available'
          };
        }
        
        // Parse variant consumption data from notes
        try {
          const variantSection = line.notes.split('Variant consumptions:')[1];
          if (!variantSection) return line;
          
          // Extract individual variant data
          const variants = variantSection.split(';').map(v => v.trim());
          
          // Find consumption for current product
          let productConsumption = null;
          for (const variant of variants) {
            // Match patterns like "28-grey: 0.3 kg (0% waste)" or "LUCID-BEIGH 38: 0.3 kg (0% waste)"
            const sizeColorMatch = variant.match(/^([^:]+):\s*([0-9.]+)\s*([^(]+)\s*\(([0-9.]+)%\s*waste\)/);
            if (sizeColorMatch) {
              const [, variantKey, quantity, unit, waste] = sizeColorMatch;
              
              // Check if this variant matches current product
              // For exact match with default_code or name
              const exactMatch = variantKey.trim() === currentProduct.default_code || 
                                variantKey.trim() === currentProduct.name;
              
              // For partial match based on components
              const matchesSize = !currentProduct.size || variantKey.includes(currentProduct.size);
              const matchesColor = !currentProduct.colour || variantKey.toLowerCase().includes(currentProduct.colour.toLowerCase());
              const matchesName = !currentProduct.name || variantKey.includes(currentProduct.name);
              
              if (exactMatch || (matchesName && matchesSize && matchesColor)) {
                productConsumption = {
                  quantity: parseFloat(quantity),
                  unit: unit.trim(),
                  waste_percentage: parseFloat(waste)
                };
                break;
              }
            }
          }
          
          if (productConsumption) {
            return {
              ...line,
              quantity: productConsumption.quantity,
              waste_percentage: productConsumption.waste_percentage,
              unit: productConsumption.unit,
              productSpecificNote: `Specific consumption for ${currentProduct.name}${currentProduct.size ? ` - ${currentProduct.size}` : ''}${currentProduct.colour ? ` - ${currentProduct.colour}` : ''}`
            };
          }
          
          return {
            ...line,
            productSpecificNote: `No specific data found for ${currentProduct.name}`
          };
          
        } catch (error) {
          console.error('Error parsing variant consumption data:', error);
          return {
            ...line,
            productSpecificNote: 'Error parsing consumption data'
          };
        }
      });
    };

    const productSpecificLines = getProductSpecificRequirements(bom.lines, currentProductIndex);
    
    // Calculate product-specific cost for multi-product BOMs
    const calculateProductSpecificCost = (lines: any[]): number => {
      return lines.reduce((total, line) => {
        if (line.raw_material?.cost_per_unit) {
          const quantityWithWaste = line.quantity * (1 + line.waste_percentage / 100);
          return total + (quantityWithWaste * line.raw_material.cost_per_unit);
        }
        return total;
      }, 0);
    };
    
    const displayCost = isMultiProduct ? calculateProductSpecificCost(productSpecificLines) : calculateBOMCost(bom);

    return (
      <div className="space-y-6">
        {/* Product Navigation for Multi-Product BOMs */}
        {isMultiProduct && products.length > 1 && (
          <div className="bg-gradient-to-r from-orange-50/50 to-red-50/50 p-4 rounded-xl border border-orange-200/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-500">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800">
                    {bom.is_category_wise ? 'Category-wise BOM Navigation' : 'Multi-Product BOM Navigation'}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {bom.is_category_wise 
                      ? 'Navigate through products to view category-based material requirements' 
                      : 'Select a specific product to view its BOM requirements'
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentProductIndex(Math.max(0, currentProductIndex - 1))}
                  disabled={currentProductIndex === 0}
                  className="h-8 px-3"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                
                {/* Product Selection Dropdown */}
                <div className="min-w-[250px]">
                  <Select 
                    value={currentProductIndex.toString()} 
                    onValueChange={(value) => setCurrentProductIndex(parseInt(value))}
                  >
                    <SelectTrigger className="h-8 bg-white/70 border-orange-200 focus:border-orange-400 focus:ring-orange-200">
                      <div className="flex items-center space-x-2 truncate">
                        <Package className="h-3 w-3 text-gray-500 flex-shrink-0" />
                        <div className="flex flex-col truncate">
                          <span className="font-medium truncate text-left">
                            {currentProduct ? currentProduct.name : 'Select product'}
                          </span>
                          {currentProduct && (
                            <span className="text-xs text-gray-500 truncate text-left">
                              {currentProduct.default_code || 'No code'}
                              {currentProduct.size && ` | ${currentProduct.size}`}
                              {currentProduct.colour && ` | ${currentProduct.colour}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-white border-orange-200 max-h-[300px] w-[350px]">
                      {products.map((product, index) => (
                        <SelectItem 
                          key={product.id} 
                          value={index.toString()} 
                          className="hover:bg-orange-50 cursor-pointer"
                        >
                          <div className="flex items-center space-x-2 w-full">
                            <Package className="h-3 w-3 text-gray-500 flex-shrink-0" />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-medium text-left">{product.name}</span>
                              <div className="text-xs text-gray-500 flex items-center space-x-1">
                                <span>{product.default_code || 'No code'}</span>
                                {product.size && (
                                  <>
                                    <span>•</span>
                                    <div className="flex items-center space-x-1">
                                      <Ruler className="h-2 w-2" />
                                      <span>{product.size}</span>
                                    </div>
                                  </>
                                )}
                                {product.colour && (
                                  <>
                                    <span>•</span>
                                    <div className="flex items-center space-x-1">
                                      <Palette className="h-2 w-2" />
                                      <span>{product.colour}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2 bg-white/70 px-3 py-1 rounded-lg border">
                  <span className="text-sm font-medium text-gray-700">
                    {currentProductIndex + 1} of {products.length}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentProductIndex(Math.min(products.length - 1, currentProductIndex + 1))}
                  disabled={currentProductIndex === products.length - 1}
                  className="h-8 px-3"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 p-4 rounded-xl border border-blue-200/30">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
              <Package className="h-4 w-4 text-blue-600" />
              <span>Product Information</span>
            </h4>
            <div className="text-sm space-y-3">
              {isMultiProduct ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">BOM Type:</span>
                    <Badge className={bom.is_category_wise ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-orange-100 text-orange-800 border-orange-200"}>
                      {bom.is_category_wise ? 'Category-wise Multi-Product' : 'Multi-Product'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Products:</span>
                    <span className="font-medium text-gray-900">{products.length}</span>
                  </div>
                  {currentProduct && (
                    <>
                      <div className="border-t pt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Current Product:</span>
                          <span className="font-medium text-gray-900">{currentProduct.name}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-gray-600">Code:</span>
                          <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{currentProduct.default_code || 'N/A'}</span>
                        </div>
                        {currentProduct.colour && (
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-gray-600">Color:</span>
                            <div className="flex items-center space-x-2">
                              <Palette className="h-3 w-3 text-purple-600" />
                              <span className="font-medium">{currentProduct.colour}</span>
                            </div>
                          </div>
                        )}
                        {currentProduct.size && (
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-gray-600">Size:</span>
                            <div className="flex items-center space-x-2">
                              <Ruler className="h-3 w-3 text-blue-600" />
                              <span className="font-medium">{currentProduct.size}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Product:</span>
                    <span className="font-medium text-gray-900">{bom.product?.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Code:</span>
                    <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{bom.product?.default_code || 'N/A'}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-600">BOM Version:</span>
                <span className="font-medium text-blue-700">{bom.version}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Produces:</span>
                <span className="font-medium text-gray-900">{bom.quantity} {bom.unit}</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-50/50 to-emerald-50/50 p-4 rounded-xl border border-green-200/30">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span>Cost Analysis</span>
            </h4>
            <div className="text-sm space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">{bom.is_category_wise ? 'Categories:' : 'Materials:'}</span>
                <span className="font-medium text-gray-900">{bom.lines.length} items</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">{isMultiProduct ? 'Product Cost:' : 'Total Cost:'}</span>
                <span className="font-semibold text-green-700">LKR {displayCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Cost per Unit:</span>
                <span className="font-semibold text-green-700">LKR {(displayCost / bom.quantity).toFixed(2)}</span>
              </div>
              {isMultiProduct && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total BOM Cost:</span>
                  <span className="font-semibold text-gray-600">LKR {calculateBOMCost(bom).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/60 rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-800 flex items-center space-x-2">
                <FileText className="h-4 w-4 text-gray-600" />
                <span>{bom.is_category_wise ? 'Category Requirements' : 'Material Requirements'}</span>
                {isMultiProduct && currentProduct && (
                  <div className="flex items-center space-x-2 ml-3">
                    <span className="text-sm text-gray-500">for</span>
                    <div className="flex items-center space-x-1 bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                      <Package className="h-3 w-3" />
                      <span className="text-sm font-medium">{currentProduct.name}</span>
                    </div>
                  </div>
                )}
              </h4>
              {isMultiProduct && currentProduct && (
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  {currentProduct.default_code && (
                    <span className="bg-gray-100 px-2 py-1 rounded">Code: {currentProduct.default_code}</span>
                  )}
                  {currentProduct.size && (
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded flex items-center space-x-1">
                      <Ruler className="h-2 w-2" />
                      <span>{currentProduct.size}</span>
                    </span>
                  )}
                  {currentProduct.colour && (
                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded flex items-center space-x-1">
                      <Palette className="h-2 w-2" />
                      <span>{currentProduct.colour}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="font-semibold text-gray-700">
                    {bom.is_category_wise ? 'Category Details' : 'Material Details'}
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700">Base Quantity</TableHead>
                  <TableHead className="font-semibold text-gray-700">Waste Factor</TableHead>
                  <TableHead className="font-semibold text-gray-700">Effective Quantity</TableHead>
                  <TableHead className="font-semibold text-gray-700">Line Cost</TableHead>
                  <TableHead className="font-semibold text-gray-700">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productSpecificLines.map((line, index) => {
                  const effectiveQty = line.quantity * (1 + line.waste_percentage / 100);
                  const lineCost = line.raw_material?.cost_per_unit ? effectiveQty * line.raw_material.cost_per_unit : 0;
                  
                  // Check if this is a category entry for category-wise BOMs
                  const isCategoryEntry = bom.is_category_wise && line.notes && line.notes.startsWith('CATEGORY:');
                  let categoryInfo = null;
                  
                  if (isCategoryEntry) {
                    // Parse category information from notes: "CATEGORY:id:name:notes"
                    const parts = line.notes.split(':');
                    if (parts.length >= 3) {
                      categoryInfo = {
                        id: parseInt(parts[1]),
                        name: parts[2],
                        notes: parts.slice(3).join(':') || ''
                      };
                    }
                  }
                  
                  return (
                    <TableRow key={line.id} className={`transition-colors hover:bg-gray-50/30 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'}`}>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-lg ${isCategoryEntry ? 'bg-gradient-to-r from-purple-100 to-pink-100' : 'bg-gradient-to-r from-purple-100 to-blue-100'}`}>
                            {isCategoryEntry ? (
                              <Factory className="h-3 w-3 text-purple-600" />
                            ) : (
                              <Package className="h-3 w-3 text-purple-600" />
                            )}
                          </div>
                          <div>
                            {isCategoryEntry ? (
                              <>
                                <div className="font-medium text-gray-900 flex items-center space-x-2">
                                  <span>{categoryInfo?.name || 'Category'}</span>
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                                    Category
                                  </Badge>
                                </div>
                                <div className="text-sm text-gray-500">Material category consumption</div>
                              </>
                            ) : (
                              <>
                                <div className="font-medium text-gray-900">{line.raw_material?.name}</div>
                                <div className="text-sm text-gray-500 font-mono">{line.raw_material?.code || 'No code'}</div>
                              </>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className="font-medium">{line.quantity} {line.unit}</span>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {line.waste_percentage > 0 ? (
                          <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                            {line.waste_percentage}%
                          </span>
                        ) : (
                          <span className="text-gray-400">0%</span>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className="font-semibold text-blue-700">{effectiveQty.toFixed(3)} {line.unit}</span>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className="font-semibold text-green-700">LKR {lineCost.toFixed(2)}</span>
                      </TableCell>
                      <TableCell className="px-6 py-4 max-w-xs">
                        <div className="text-sm">
                          {line.productSpecificNote && line.productSpecificNote.includes('Specific consumption for') ? (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                              <span className="text-green-700 font-medium">{line.productSpecificNote}</span>
                            </div>
                          ) : line.productSpecificNote && line.productSpecificNote.includes('No specific data found') ? (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0"></div>
                              <span className="text-yellow-700">{line.productSpecificNote}</span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                              <span className="text-gray-600">{line.productSpecificNote || 'General consumption data'}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <div className="flex items-center space-x-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent"></div>
          <span className="text-lg text-gray-600">Loading BOMs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500">
            <Factory className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Bill of Materials</h2>
            <p className="text-sm text-gray-500">{boms.length} BOMs managed</p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button 
                onClick={resetBOMForm}
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50 transition-all duration-300"
              >
                <Plus className="h-4 w-4 mr-2" />
                Single BOM
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl bg-white/95 backdrop-blur-sm border border-orange-200/50">
            <DialogHeader className="border-b border-orange-100 pb-4">
              <DialogTitle className="text-xl font-bold text-gray-900 flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-500">
                  <Factory className="h-4 w-4 text-white" />
                </div>
                <span>Create New BOM</span>
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Define material requirements and specifications for your product
              </DialogDescription>
            </DialogHeader>
            <BOMForm
              formData={bomFormData}
              products={products}
              onInputChange={handleBOMInputChange}
            />
            <DialogFooter className="border-t border-gray-100 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setShowCreateDialog(false)}
                className="hover:bg-gray-100 transition-colors"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateBOM}
                className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg transition-all duration-300"
              >
                Create BOM
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
          
          <Button 
            onClick={() => setShowMultiCreateDialog(true)}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 border-0"
          >
            <Factory className="h-4 w-4 mr-2" />
            Multi-Product BOM
          </Button>
        </div>
      </div>

      <Card className="bg-white/80 backdrop-blur-sm border border-white/20 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-orange-500/5 to-red-500/5 border-b border-orange-100">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-3 text-lg font-bold text-gray-900">
                <div className="p-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-500">
                  <FileText className="h-4 w-4 text-white" />
                </div>
                BOMs Overview
              </CardTitle>
              <CardDescription className="text-gray-600 mt-1">
                Manage {boms.length} bill of materials and their components
              </CardDescription>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                id="search-boms"
                name="search"
                autoComplete="off"
                placeholder="Search BOMs by name, product, or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white/70 border-gray-200 focus:border-orange-300 focus:ring-orange-200"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-200 bg-gray-50/50">
                  <TableHead className="font-semibold text-gray-700 px-6 py-4">BOM Details</TableHead>
                  <TableHead className="font-semibold text-gray-700 px-6 py-4">Product Information</TableHead>
                  <TableHead className="font-semibold text-gray-700 px-6 py-4">Specifications</TableHead>
                  <TableHead className="font-semibold text-gray-700 px-6 py-4">Cost Analysis</TableHead>
                  <TableHead className="font-semibold text-gray-700 px-6 py-4">Status</TableHead>
                  <TableHead className="font-semibold text-gray-700 px-6 py-4 text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBOMs.map((bom, index) => (
                  <TableRow key={bom.id} className={`transition-all duration-200 hover:bg-gradient-to-r hover:from-orange-50/30 hover:to-red-50/30 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <TableCell className="px-6 py-4">
                      <div className="flex items-start space-x-3">
                        <div className="p-2 rounded-lg bg-gradient-to-r from-orange-100 to-red-100">
                          <Factory className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">{bom.name}</div>
                          <div className="text-sm text-gray-500">Version {bom.version}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      {bom.product ? (
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900">{bom.product.name}</div>
                          <div className="text-sm text-gray-500 flex items-center space-x-2">
                            <Package className="h-3 w-3" />
                            <span>{bom.product.default_code || 'No product code'}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900 flex items-center space-x-2">
                            <Factory className="h-4 w-4 text-orange-600" />
                            <span>Multi-Product BOM</span>
                          </div>
                          <div className="text-sm text-gray-500">
                            {(bom as any).product_ids?.length || 0} products
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span className="text-sm font-medium">{bom.lines.length} materials</span>
                        </div>
                        <div className="text-sm text-gray-600">
                          Produces: <span className="font-medium">{bom.quantity} {bom.unit}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-green-700 font-semibold">
                          <DollarSign className="h-4 w-4" />
                          <span>{calculateBOMCost(bom).toFixed(2)}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          LKR {(calculateBOMCost(bom) / bom.quantity).toFixed(2)} per unit
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <Badge 
                        variant={bom.active ? 'default' : 'secondary'}
                        className={bom.active ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-600'}
                      >
                        {bom.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetailsDialog(bom)}
                          className="h-8 w-8 p-0 hover:bg-blue-100 hover:text-blue-700 transition-all duration-200"
                          title="View Details"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openCopyDialog(bom)}
                          className="h-8 w-8 p-0 hover:bg-purple-100 hover:text-purple-700 transition-all duration-200"
                          title="Copy BOM"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteBOM(bom)}
                          className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-700 transition-all duration-200"
                          title="Delete BOM"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredBOMs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center space-y-3 text-gray-500">
                        <Factory className="h-12 w-12 text-gray-300" />
                        <div className="text-lg font-medium">No BOMs found</div>
                        <div className="text-sm">{searchTerm ? 'Try adjusting your search criteria' : 'Create your first BOM to get started'}</div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Copy Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="max-w-2xl bg-white/95 backdrop-blur-sm border border-purple-200/50">
          <DialogHeader className="border-b border-purple-100 pb-4">
            <DialogTitle className="text-xl font-bold text-gray-900 flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500">
                <Copy className="h-4 w-4 text-white" />
              </div>
              <span>Copy BOM</span>
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Duplicate an existing BOM structure for a new product with identical material requirements
            </DialogDescription>
          </DialogHeader>
          <CopyForm />
          <DialogFooter className="border-t border-gray-100 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setShowCopyDialog(false)}
              className="hover:bg-gray-100 transition-colors"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCopyBOM}
              className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg transition-all duration-300"
            >
              Copy BOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-sm border border-blue-200/50">
          <DialogHeader className="border-b border-blue-100 pb-4 sticky top-0 bg-white/95 backdrop-blur-sm">
            <DialogTitle className="text-xl font-bold text-gray-900 flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <span>BOM Details</span>
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Comprehensive breakdown of material requirements and cost analysis
            </DialogDescription>
          </DialogHeader>
          {selectedBOM && <BOMDetails bom={selectedBOM} />}
          <DialogFooter className="border-t border-gray-100 pt-4 sticky bottom-0 bg-white/95 backdrop-blur-sm">
            <Button 
              onClick={() => setShowDetailsDialog(false)}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg transition-all duration-300"
            >
              Close Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Multi-Product BOM Creator */}
      <MultiProductBOMCreator
        open={showMultiCreateDialog}
        onClose={() => setShowMultiCreateDialog(false)}
        onSuccess={() => {
          setShowMultiCreateDialog(false);
          loadData();
        }}
      />
    </div>
  );
};

export const BOMManager: React.FC = () => {
  return (
    <ModernLayout
      title="Bill of Materials"
      description="Create and manage product BOMs with detailed material requirements and cost analysis"
      icon={Factory}
      gradient="bg-gradient-to-br from-orange-500 via-orange-600 to-red-700"
    >
      <BOMContent />
    </ModernLayout>
  );
};
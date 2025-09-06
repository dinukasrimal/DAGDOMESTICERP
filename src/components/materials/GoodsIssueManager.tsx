import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  AlertTriangle,
  Factory,
  Wrench,
  TestTube,
  Trash2,
  Settings
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  GoodsIssueService, 
  GoodsIssue, 
  CreateGoodsIssue, 
  CreateGoodsIssueLine 
} from '../../services/goodsIssueService';
import { RawMaterialsService, RawMaterialWithInventory } from '../../services/rawMaterialsService';
import { PurchaseOrderService, PurchaseOrder } from '../../services/purchaseOrderService';
import { supabase } from '@/integrations/supabase/client';
import { BOMService, BOMWithLines } from '../../services/bomService';
import { ModernLayout } from '../layout/ModernLayout';

const goodsIssueService = new GoodsIssueService();
const rawMaterialsService = new RawMaterialsService();
const purchaseOrderService = new PurchaseOrderService();
const bomService = new BOMService();

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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<GoodsIssue | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [issueMode, setIssueMode] = useState<'po' | 'general'>('po'); // New: Issue mode
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
  }[]>([]);
  const [showBOMSelection, setShowBOMSelection] = useState(false);
  const [categorySelections, setCategorySelections] = useState<{[categoryId: string]: {materialId: number, quantity: number}[]}>({});
  const { toast } = useToast();

  // Form states
  const [formData, setFormData] = useState<CreateGoodsIssue>({
    issue_date: new Date().toISOString().split('T')[0],
    issue_type: 'production',
    reference_number: '',
    notes: '',
    lines: []
  });

  const [currentLine, setCurrentLine] = useState<CreateGoodsIssueLine>({
    raw_material_id: '',
    quantity_issued: 0,
    batch_number: '',
    notes: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [issuesData, materialsData, purchaseOrdersData] = await Promise.all([
        goodsIssueService.getAllGoodsIssue(),
        rawMaterialsService.getRawMaterials(),
        loadPurchaseOrders()
      ]);
      setGoodsIssues(issuesData);
      setRawMaterials(materialsData);
      setPurchaseOrders(purchaseOrdersData);
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
                return ({
                  id: line.product_id || line.id,
                  name: line.product_name || line.name || 'Unknown Product',
                  quantity: Number(qty) || 0,
                  pending_qty: order.pending_qty || 0,
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
  const loadAvailableBOMs = async (purchaseOrder: any) => {
    try {
      console.log('🔍 Debug: Loading BOMs for PO:', purchaseOrder.po_number);
      console.log('📦 Debug: PO products:', purchaseOrder.products);
      
      const bomSet = new Set<string>();
      const boms: BOMWithLines[] = [];
      
      if (!purchaseOrder.products || purchaseOrder.products.length === 0) {
        console.log('❌ Debug: No products found in PO');
        setAvailableBOMs([]);
        return;
      }

      console.log(`📋 Debug: Processing ${purchaseOrder.products.length} products`);

      // Get BOMs for all products in the PO
      for (const product of purchaseOrder.products) {
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
            console.log(`📋 Debug: Total BOMs in system: ${allBOMs.length}`);
            
            for (const bom of allBOMs) {
              // More flexible matching - check both directions and word matches
              const productName = product.name?.toLowerCase() || '';
              const productCode = product.default_code?.toLowerCase() || '';
              const bomName = bom.name?.toLowerCase() || '';
              
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
      
      setAvailableBOMs(boms);
      if (boms.length > 0) {
        setShowBOMSelection(true);
        toast({
          title: 'BOMs Found',
          description: `Found ${boms.length} available BOMs for products in this purchase order. Please select a BOM to calculate material requirements.`
        });
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

  // Helper: fetch total issued quantity per material for a given PO
  const fetchIssuedSoFarForPO = async (poNumber: string): Promise<Map<string, number>> => {
    try {
      const { data: issues, error: issueErr } = await supabase
        .from('goods_issue')
        .select('id')
        .eq('reference_number', poNumber)
        .eq('status', 'issued');
      if (issueErr || !issues || issues.length === 0) return new Map();

      const issueIds = issues.map(i => i.id);
      const { data: lines, error: linesErr } = await supabase
        .from('goods_issue_lines')
        .select('raw_material_id, quantity_issued')
        .in('goods_issue_id', issueIds);
      if (linesErr || !lines) return new Map();

      const map = new Map<string, number>();
      for (const l of lines) {
        const key = l.raw_material_id?.toString();
        if (!key) continue;
        map.set(key, (map.get(key) || 0) + (Number(l.quantity_issued) || 0));
      }
      return map;
    } catch {
      return new Map();
    }
  };

  // Calculate material requirements based on selected BOM and PO quantities
  const calculateBOMBasedRequirements = async (bom: BOMWithLines, purchaseOrder: any) => {
    try {
      const materialRequirements: typeof bomMaterialRequirements = [];
      
      if (!bom.lines || bom.lines.length === 0) {
        setBomMaterialRequirements([]);
        return;
      }

      // Load issued quantities so far for this PO, grouped by material
      const issuedMap = purchaseOrder?.po_number
        ? await fetchIssuedSoFarForPO(purchaseOrder.po_number)
        : new Map<string, number>();

      // Check if this is a category-wise BOM
      // Helper to parse category info from legacy/hacky notes format: CATEGORY:{id}:{name}:[...]
      const parseCategoryFromNotes = (notes?: string): { id: number; name: string } | null => {
        if (!notes) return null;
        const match = notes.match(/CATEGORY:(\d+):([^:]+)(?::|$)/);
        if (!match) return null;
        return { id: Number(match[1]), name: match[2] };
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
          for (const product of purchaseOrder.products || []) {
            // Requirement reflects each item's quantity on the PO (with fallbacks)
            const productQty = (Number(product.quantity) || Number(product.pending_qty) || Number(product.outstanding_qty) || 0);
            const perUnitConsumption = (bomLine.quantity * (1 + (bomLine.waste_percentage || 0) / 100)) / bomBaseQty;
            totalRequired += perUnitConsumption * productQty;
          }

          // Get available inventory for this category
          const { data: categoryMaterials } = await supabase
            .from('raw_materials')
            .select('id, name, base_unit')
            .eq('category_id', categoryInfo.id)
            .eq('active', true);

          // Add category as a requirement entry
          materialRequirements.push({
            material_id: `category-${categoryInfo.id}`,
            material_name: `📁 ${categoryInfo.name} (Category)`,
            required_quantity: totalRequired,
            issued_so_far: 0, // TODO: Get actual issued quantities
            issuing_quantity: 0,
            unit: bomLine.unit,
            available_quantity: 999999, // Categories don't have stock limits
            category_id: categoryInfo.id,
            category_materials: categoryMaterials || []
          });
        }
      } else {
        // For regular BOMs, show specific materials
        for (const bomLine of bom.lines) {
          if (!bomLine.raw_material) continue;

          // Calculate total quantity needed based on PO quantities
          let totalRequired = 0;
          
          const bomBaseQty = bom.quantity && bom.quantity > 0 ? bom.quantity : 1;
          for (const product of purchaseOrder.products || []) {
            // Multiply per-unit consumption by each item's quantity on the PO (with fallbacks)
            const productQty = (Number(product.quantity) || Number(product.pending_qty) || Number(product.outstanding_qty) || 0);
            const perUnitConsumption = (bomLine.quantity * (1 + (bomLine.waste_percentage || 0) / 100)) / bomBaseQty;
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
              issuing_quantity: Math.max(0, totalRequired - issuedSoFar),
              unit: bomLine.raw_material.base_unit,
              available_quantity: availableQty
            });
          }
        }
      }

      setBomMaterialRequirements(materialRequirements);

      if (materialRequirements.length === 0) {
        toast({
          title: 'No Requirements Calculated',
          description: 'Could not derive quantities from PO items. Please verify PO line quantities and BOM base quantity.',
          variant: 'destructive'
        });
      }
      
      // Auto-populate form lines based on BOM requirements
      const autoLines: CreateGoodsIssueLine[] = materialRequirements.map(req => ({
        raw_material_id: req.material_id,
        quantity_issued: req.issuing_quantity,
        batch_number: '',
        notes: `BOM-based requirement for ${bom.name} • Total required: ${req.required_quantity} ${req.unit}`
      }));
      
      setFormData(prev => ({
        ...prev,
        lines: autoLines
      }));

    } catch (error) {
      console.error('Failed to calculate BOM-based requirements:', error);
      setBomMaterialRequirements([]);
    }
  };

  // Handle BOM selection
  const handleBOMSelection = async (bomId: string) => {
    const bom = availableBOMs.find(b => String(b.id) === String(bomId));
    if (bom && selectedPurchaseOrder) {
      setSelectedBOM(bom);
      await calculateBOMBasedRequirements(bom, selectedPurchaseOrder);
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
    setFormData(prev => ({
      ...prev,
      lines: prev.lines.map(line => 
        line.raw_material_id === materialId 
          ? { ...line, quantity_issued: Math.max(0, quantity) }
          : line
      )
    }));
  };

  const handlePOSelection = async (orderId: string) => {
    const order = purchaseOrders.find(o => o.id === orderId);
    if (order) {
      setSelectedPurchaseOrder(order);
      setFormData(prev => ({
        ...prev,
        reference_number: order.po_number,
        issue_type: 'production',
        lines: [] // Clear existing lines
      }));

      // Reset BOM selection states
      setSelectedBOM(null);
      setBomMaterialRequirements([]);
      setShowBOMSelection(false);

      // Load available BOMs for the products in this PO
      await loadAvailableBOMs(order);
    }
  };

  const handleCreateIssue = async () => {
    try {
      if (formData.lines.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please add at least one line item',
          variant: 'destructive'
        });
        return;
      }

      // For general issues, require approval
      if (issueMode === 'general') {
        const confirmed = confirm(
          'General goods issues require approval. Do you want to proceed?\n\n' +
          'This issue will be created in pending status and require supervisor approval before execution.'
        );
        if (!confirmed) return;
      }

      // Validate PO-based issues
      if (issueMode === 'po' && !selectedPurchaseOrder) {
        toast({
          title: 'Validation Error',
          description: 'Please select a Purchase Order for PO-based issues',
          variant: 'destructive'
        });
        return;
      }

      setLoading(true);
      const newIssue = await goodsIssueService.createGoodsIssue(formData);
      setGoodsIssues(prev => [newIssue, ...prev]);
      
      const successMessage = issueMode === 'po' 
        ? `Goods Issue ${newIssue.issue_number} created for Purchase Order ${selectedPurchaseOrder?.po_number}`
        : `Goods Issue ${newIssue.issue_number} created (pending approval)`;
      
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
      reference_number: '',
      notes: '',
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
            {/* Issue Mode Selection */}
            <Card className="bg-blue-50/30 border-blue-200">
              <CardHeader>
                <CardTitle className="text-sm">Issue Mode</CardTitle>
                <CardDescription>Select whether this is a Purchase Order-based issue or general issue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex space-x-4">
                  <Button
                    type="button"
                    variant={issueMode === 'po' ? 'default' : 'outline'}
                    onClick={() => {
                      setIssueMode('po');
                      setFormData(prev => ({ ...prev, issue_type: 'production' }));
                    }}
                    className="flex-1"
                  >
                    <Factory className="h-4 w-4 mr-2" />
                    Purchase Order Issue
                  </Button>
                  <Button
                    type="button"
                    variant={issueMode === 'general' ? 'default' : 'outline'}
                    onClick={() => {
                      setIssueMode('general');
                      setSelectedPO(null);
                      setSelectedProductionOrder(null);
                      setSelectedPurchaseOrder(null);
                      setBomRequirements({});
                      setFormData(prev => ({ ...prev, lines: [] }));
                    }}
                    className="flex-1"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    General Issue
                  </Button>
                </div>
                
                {/* Purchase Order Selection */}
                {issueMode === 'po' && (
                  <div className="mt-4">
                    <Label>Purchase Order *</Label>
                    <Select 
                      value={selectedPurchaseOrder?.id || ''} 
                      onValueChange={handlePOSelection}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Purchase Order" />
                      </SelectTrigger>
                      <SelectContent>
                        {purchaseOrders.map(order => {
                          const productCount = order.products?.length || 0;
                          const outstandingQty = order.outstanding_qty || order.pending_qty || 0;
                          return (
                            <SelectItem key={order.id} value={order.id}>
                              <div className="flex justify-between items-center w-full">
                                <span>{order.po_number}</span>
                                <span className="text-sm text-gray-500 ml-2">
                                  {productCount} products • Pending: {outstandingQty}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    
                    {selectedPurchaseOrder && (
                      <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-sm text-green-800">
                          <strong>Selected PO:</strong> {selectedPurchaseOrder.po_number} 
                          {selectedPurchaseOrder.supplier_name && ` • ${selectedPurchaseOrder.supplier_name}`}
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          Products: {selectedPurchaseOrder.products?.length || 0} • Pending Qty: {selectedPurchaseOrder.outstanding_qty || selectedPurchaseOrder.pending_qty || 0}
                        </p>
                      </div>
                    )}
                    
                    {/* BOM Selection */}
                    {showBOMSelection && availableBOMs.length > 0 && (
                      <div className="mt-4">
                        <Label>Select BOM for Material Requirements *</Label>
                        <Select 
                          value={selectedBOM?.id ? String(selectedBOM.id) : ''} 
                          onValueChange={handleBOMSelection}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select BOM to calculate material requirements" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableBOMs.map((bom) => (
                              <SelectItem key={bom.id} value={String(bom.id)}>
                                <div className="flex items-center space-x-2">
                                  <Package className="h-3 w-3 text-blue-600" />
                                  <div>
                                    <span className="font-medium">{bom.name}</span>
                                    <span className="text-xs text-gray-500 ml-2">
                                      v{bom.version} • {bom.lines?.length || 0} materials
                                    </span>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
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
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <span>Material Requirements - {selectedBOM.name}</span>
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
                          {bomMaterialRequirements.map((req, index) => {
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
                                            <Button 
                                              size="sm" 
                                              variant="outline" 
                                              className="mt-2 text-xs h-6"
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
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.001"
                                      value={req.issuing_quantity}
                                      onChange={(e) => updateIssuingQuantity(req.material_id, parseFloat(e.target.value) || 0)}
                                      className={`w-24 ${isOverIssuing ? 'border-yellow-400 bg-yellow-50' : ''} ${isInsufficientStock ? 'border-red-400 bg-red-50' : ''}`}
                                    />
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="text-gray-700">{remainingToIssue.toFixed(3)} {req.unit}</span>
                                </TableCell>
                                <TableCell>
                                  {isCategoryBased ? (
                                    <span className="text-sm text-gray-500 italic">Multiple materials</span>
                                  ) : (
                                    <span className={`font-medium ${req.available_quantity < req.issuing_quantity ? 'text-red-600' : 'text-gray-700'}`}>
                                      {req.available_quantity.toFixed(3)} {req.unit}
                                    </span>
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
                                        {req.category_materials?.map((material) => (
                                          <div key={material.id} className="flex items-center justify-between bg-white p-3 rounded border">
                                            <div className="flex items-center space-x-2">
                                              <Package className="h-4 w-4 text-gray-600" />
                                              <div>
                                                <div className="font-medium text-sm">{material.name}</div>
                                                <div className="text-xs text-gray-500">Unit: {material.base_unit}</div>
                                              </div>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                              <Input
                                                type="number"
                                                min="0"
                                                step="0.001"
                                                placeholder="Qty"
                                                className="w-20 h-8 text-sm"
                                                onChange={(e) => {
                                                  const qty = parseFloat(e.target.value) || 0;
                                                  const categoryKey = `category-${req.category_id}`;
                                                  setCategorySelections(prev => ({
                                                    ...prev,
                                                    [categoryKey]: prev[categoryKey]?.filter(item => item.materialId !== material.id)
                                                      .concat(qty > 0 ? [{materialId: material.id, quantity: qty}] : []) || 
                                                      (qty > 0 ? [{materialId: material.id, quantity: qty}] : [])
                                                  }));
                                                }}
                                              />
                                            </div>
                                          </div>
                                        ))}
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

                {/* General Issue Warning */}
                {issueMode === 'general' && (
                  <Alert className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      General issues require supervisor approval and will be created in pending status.
                    </AlertDescription>
                  </Alert>
                )}
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
                  onChange={(e) => setFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="reference_number">Reference Number</Label>
                <Input
                  value={formData.reference_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, reference_number: e.target.value }))}
                  placeholder="Production order, work order, etc."
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes for this goods issue..."
                rows={2}
              />
            </div>

            {/* Add Line Item */}
            <Card className="bg-red-50/30 border-red-200">
              <CardHeader>
                <CardTitle className="text-sm">Add Line Item</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label>Raw Material *</Label>
                    <Select
                      value={currentLine.raw_material_id}
                      onValueChange={(value) => setCurrentLine(prev => ({ ...prev, raw_material_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {rawMaterials.map(material => (
                          <SelectItem key={material.id} value={material.id.toString()}>
                            <div className="flex justify-between items-center w-full">
                              <span>{material.name} ({material.code})</span>
                              <span className="text-sm text-gray-500 ml-2">
                                Avail: {material.inventory_quantity || 0}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={getAvailableQuantity(currentLine.raw_material_id)}
                      value={currentLine.quantity_issued}
                      onChange={(e) => setCurrentLine(prev => ({ ...prev, quantity_issued: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                    {currentLine.raw_material_id && (
                      <p className="text-xs text-gray-500 mt-1">
                        Available: {getAvailableQuantity(currentLine.raw_material_id)}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Batch/Lot</Label>
                    <Input
                      value={currentLine.batch_number}
                      onChange={(e) => setCurrentLine(prev => ({ ...prev, batch_number: e.target.value }))}
                      placeholder="Batch number"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddLine} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line Items List */}
            {formData.lines.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Line Items ({formData.lines.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Batch/Lot</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formData.lines.map((line, index) => {
                        const material = rawMaterials.find(m => m.id.toString() === line.raw_material_id);
                        const available = getAvailableQuantity(line.raw_material_id);
                        const isOverAvailable = line.quantity_issued > available;
                        
                        return (
                          <TableRow key={index} className={isOverAvailable ? 'bg-red-50' : ''}>
                            <TableCell>{material?.name}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={available}
                                value={line.quantity_issued}
                                onChange={(e) => handleUpdateLineQuantity(index, parseFloat(e.target.value) || 0)}
                                className={`w-24 ${isOverAvailable ? 'border-red-300' : ''}`}
                              />
                            </TableCell>
                            <TableCell className={isOverAvailable ? 'text-red-600 font-medium' : ''}>
                              {available}
                              {isOverAvailable && (
                                <AlertTriangle className="h-4 w-4 inline ml-1" />
                              )}
                            </TableCell>
                            <TableCell>{line.batch_number || 'N/A'}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveLine(index)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Validation Alerts */}
            {formData.lines.some(line => line.quantity_issued > getAvailableQuantity(line.raw_material_id)) && (
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
              disabled={loading || 
                formData.lines.length === 0 || 
                (issueMode === 'po' && !selectedPurchaseOrder) ||
                (issueMode === 'po' && !selectedBOM) ||
                formData.lines.some(line => line.quantity_issued > getAvailableQuantity(line.raw_material_id))}
              className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
            >
              {loading ? 'Creating...' : 
               issueMode === 'po' ? 'Create Purchase Order Issue' : 'Create General Issue (Requires Approval)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Goods Issue Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Minus className="h-5 w-5 text-red-600" />
              <span>Goods Issue {selectedIssue?.issue_number}</span>
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

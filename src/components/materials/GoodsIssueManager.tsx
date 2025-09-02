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
              products = orderLines.map(line => ({
                id: line.product_id || line.id,
                name: line.product_name || line.name || 'Unknown Product',
                quantity: line.product_qty || line.qty || 0,
                pending_qty: order.pending_qty || 0
              }));
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
      let productsMap: {[key: string]: any} = {};
      
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

  const handlePOSelection = async (orderId: string) => {
    const order = purchaseOrders.find(o => o.id === orderId);
    if (order) {
      setSelectedPurchaseOrder(order);
      setFormData(prev => ({
        ...prev,
        reference_number: order.po_number,
        issue_type: 'production'
      }));

      // Calculate BOM requirements
      const requirements = await calculateBOMRequirements(order);
      setBomRequirements(requirements);

      // Auto-populate lines based on BOM requirements
      const autoLines: CreateGoodsIssueLine[] = [];
      Object.entries(requirements).forEach(([materialId, quantity]) => {
        if (quantity > 0) {
          autoLines.push({
            raw_material_id: materialId,
            quantity_issued: quantity,
            batch_number: '',
            notes: `Required for Purchase Order: ${order.po_number} (${order.products?.length || 0} products)`
          });
        }
      });

      setFormData(prev => ({ ...prev, lines: autoLines }));
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
    return material?.inventory_quantity || 0;
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
                          Material requirements calculated from BOMs for {selectedPurchaseOrder.products?.length || 0} products • Pending Qty: {selectedPurchaseOrder.outstanding_qty || selectedPurchaseOrder.pending_qty || 0}
                        </p>
                      </div>
                    )}
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
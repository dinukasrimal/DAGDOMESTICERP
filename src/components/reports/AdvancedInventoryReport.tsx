import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ChevronDown, 
  ChevronRight, 
  Package, 
  AlertTriangle, 
  Clock, 
  ShoppingCart,
  Truck,
  Calendar,
  RotateCcw
} from 'lucide-react';

interface InventoryData {
  id: string;
  product_name: string;
  product_category: string;
  quantity_on_hand: number;
  quantity_available: number;
  incoming_qty: number;
  outgoing_qty: number;
  virtual_available: number;
  reorder_min: number;
  reorder_max: number;
  cost: number;
  location: string;
}

interface PurchaseData {
  id: string;
  name: string;
  partner_name: string;
  date_order: string;
  amount_total: number;
  state: string;
  received_qty: number;
  pending_qty: number;
  expected_date: string;
  order_lines?: Array<{
    id: number;
    product_name: string;
    product_qty: number;
    qty_received: number;
    price_unit: number;
    price_subtotal: number;
  }>;
}

interface PurchaseHold {
  purchase_id: string;
  held_until: string;
}

interface CategoryAnalysis {
  category: string;
  products: InventoryData[];
  totalStock: number;
  totalIncoming: number;
  totalOutgoing: number;
  needsPlanning: number;
  expanded: boolean;
}

interface ExpandedPurchases {
  [key: string]: boolean;
}

export const AdvancedInventoryReport: React.FC = () => {
  const { toast } = useToast();
  const [selectedMonths, setSelectedMonths] = useState('3');
  const [inventoryData, setInventoryData] = useState<InventoryData[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseData[]>([]);
  const [purchaseHolds, setPurchaseHolds] = useState<PurchaseHold[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [categoryAnalysis, setCategoryAnalysis] = useState<CategoryAnalysis[]>([]);
  const [filteredPurchases, setFilteredPurchases] = useState<PurchaseData[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [expandedPurchases, setExpandedPurchases] = useState<ExpandedPurchases>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (inventoryData.length > 0 || salesData.length > 0) {
      analyzeCategories();
    }
  }, [inventoryData, salesData, selectedMonths, purchaseHolds]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      console.log('Loading inventory and sales data...');
      
      const [inventoryRes, purchaseRes, purchaseHoldsRes, salesRes] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('purchases').select('*').order('date_order', { ascending: false }),
        supabase.from('purchase_holds').select('*'),
        supabase.from('invoices').select('*').order('date_order', { ascending: false })
      ]);

      console.log('Data loaded:', {
        inventory: inventoryRes.data?.length || 0,
        purchases: purchaseRes.data?.length || 0,
        holds: purchaseHoldsRes.data?.length || 0,
        sales: salesRes.data?.length || 0
      });

      if (inventoryRes.error) {
        console.error('Inventory error:', inventoryRes.error);
        throw inventoryRes.error;
      }
      if (purchaseRes.error) {
        console.error('Purchase error:', purchaseRes.error);
        throw purchaseRes.error;
      }
      if (purchaseHoldsRes.error) {
        console.error('Purchase holds error:', purchaseHoldsRes.error);
        throw purchaseHoldsRes.error;
      }
      if (salesRes.error) {
        console.error('Sales error:', salesRes.error);
        throw salesRes.error;
      }

      // Transform the data to ensure proper types
      const transformedInventory = (inventoryRes.data || []).map(item => ({
        id: item.id,
        product_name: item.product_name || 'Unknown Product',
        product_category: item.product_category || 'Uncategorized',
        quantity_on_hand: Number(item.quantity_on_hand) || 0,
        quantity_available: Number(item.quantity_available) || 0,
        incoming_qty: Number(item.incoming_qty) || 0,
        outgoing_qty: Number(item.outgoing_qty) || 0,
        virtual_available: Number(item.virtual_available) || 0,
        reorder_min: Number(item.reorder_min) || 0,
        reorder_max: Number(item.reorder_max) || 0,
        cost: Number(item.cost) || 0,
        location: item.location || 'WH/Stock'
      }));

      const transformedPurchases = (purchaseRes.data || []).map(item => ({
        id: item.id,
        name: item.name || '',
        partner_name: item.partner_name || '',
        date_order: item.date_order || '',
        amount_total: Number(item.amount_total) || 0,
        state: item.state || '',
        received_qty: Number(item.received_qty) || 0,
        pending_qty: Number(item.pending_qty) || 0,
        expected_date: item.expected_date || '',
        order_lines: Array.isArray(item.order_lines) ? item.order_lines : []
      }));

      setInventoryData(transformedInventory);
      setPurchaseData(transformedPurchases);
      setPurchaseHolds(purchaseHoldsRes.data || []);
      setSalesData(salesRes.data || []);

      // If we have no inventory data, create some sample data to show structure
      if (transformedInventory.length === 0) {
        console.log('No inventory data found, creating sample data structure');
        const sampleData = [
          {
            id: 'sample-1',
            product_name: 'Sample Product A',
            product_category: 'Category 1',
            quantity_on_hand: 100,
            quantity_available: 80,
            incoming_qty: 50,
            outgoing_qty: 20,
            virtual_available: 130,
            reorder_min: 30,
            reorder_max: 200,
            cost: 15.50,
            location: 'WH/Stock'
          },
          {
            id: 'sample-2',
            product_name: 'Sample Product B',
            product_category: 'Category 1',
            quantity_on_hand: 75,
            quantity_available: 60,
            incoming_qty: 25,
            outgoing_qty: 15,
            virtual_available: 85,
            reorder_min: 20,
            reorder_max: 150,
            cost: 12.00,
            location: 'WH/Stock'
          },
          {
            id: 'sample-3',
            product_name: 'Sample Product C',
            product_category: 'Category 2',
            quantity_on_hand: 50,
            quantity_available: 40,
            incoming_qty: 0,
            outgoing_qty: 10,
            virtual_available: 40,
            reorder_min: 25,
            reorder_max: 100,
            cost: 8.75,
            location: 'WH/Stock'
          }
        ];
        setInventoryData(sampleData);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load inventory data: " + (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fixed sales forecast calculation - get previous year data for proper comparison
  const calculateSalesForecast = (productName: string, months: number): number => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); // 0-based
    
    // For planning, we want to look at last year's data for the same period
    // Example: if current is 2025/June and planning for 3 months, 
    // get 2024 July, August, September
    const previousYear = currentYear - 1;
    const startMonth = (currentMonth + 1) % 12; // Next month in previous year
    
    console.log(`Calculating forecast for ${productName}, months: ${months}, looking at year ${previousYear} starting from month ${startMonth + 1}`);

    const relevantSales = salesData.filter(invoice => {
      const invoiceDate = new Date(invoice.date_order);
      const invoiceYear = invoiceDate.getFullYear();
      const invoiceMonth = invoiceDate.getMonth();
      
      if (invoiceYear !== previousYear) return false;
      
      // Check if invoice month is within our target range
      for (let i = 0; i < months; i++) {
        const targetMonth = (startMonth + i) % 12;
        if (invoiceMonth === targetMonth) {
          return true;
        }
      }
      return false;
    });

    let totalQty = 0;
    relevantSales.forEach(invoice => {
      if (invoice.order_lines && Array.isArray(invoice.order_lines)) {
        invoice.order_lines.forEach((line: any) => {
          if (line.product_name && line.product_name.toLowerCase().includes(productName.toLowerCase())) {
            totalQty += line.qty_delivered || 0;
          }
        });
      }
    });

    console.log(`Found ${relevantSales.length} relevant invoices for ${productName}, total qty: ${totalQty}`);
    return totalQty;
  };

  const analyzeCategories = () => {
    console.log('Analyzing categories with data:', {
      inventoryItems: inventoryData.length,
      salesItems: salesData.length
    });

    const categoryMap: { [key: string]: InventoryData[] } = {};
    
    inventoryData.forEach(item => {
      const category = item.product_category || 'Uncategorized';
      if (!categoryMap[category]) {
        categoryMap[category] = [];
      }
      categoryMap[category].push(item);
    });

    const analysis: CategoryAnalysis[] = Object.keys(categoryMap).map(category => {
      const products = categoryMap[category];
      const totalStock = products.reduce((sum, p) => sum + p.quantity_on_hand, 0);
      const totalIncoming = products.reduce((sum, p) => sum + getAvailableIncoming(p.product_name), 0);
      const totalOutgoing = products.reduce((sum, p) => sum + p.outgoing_qty, 0);
      
      let needsPlanning = 0;
      products.forEach(product => {
        const forecast = calculateSalesForecast(product.product_name, parseInt(selectedMonths));
        const availableIncoming = getAvailableIncoming(product.product_name);
        const stockWithIncoming = product.quantity_on_hand + availableIncoming;
        if (forecast > stockWithIncoming) {
          needsPlanning += forecast - stockWithIncoming;
        }
      });

      return {
        category,
        products,
        totalStock,
        totalIncoming,
        totalOutgoing,
        needsPlanning,
        expanded: false
      };
    });

    console.log('Category analysis completed:', analysis.length, 'categories');
    setCategoryAnalysis(analysis.sort((a, b) => b.needsPlanning - a.needsPlanning));
  };

  const getAvailableIncoming = (productName: string): number => {
    const heldPurchaseIds = new Set(purchaseHolds.map(h => h.purchase_id));
    
    let totalIncoming = 0;
    purchaseData.forEach(purchase => {
      if (!heldPurchaseIds.has(purchase.id) && purchase.order_lines) {
        purchase.order_lines.forEach(line => {
          if (line.product_name.toLowerCase().includes(productName.toLowerCase())) {
            totalIncoming += Math.max(0, line.product_qty - line.qty_received);
          }
        });
      }
    });
    
    return totalIncoming;
  };

  const toggleCategoryExpansion = (categoryIndex: number) => {
    setCategoryAnalysis(prev => prev.map((cat, index) => 
      index === categoryIndex ? { ...cat, expanded: !cat.expanded } : cat
    ));
  };

  const togglePurchaseExpansion = (purchaseId: string) => {
    setExpandedPurchases(prev => ({
      ...prev,
      [purchaseId]: !prev[purchaseId]
    }));
  };

  const handlePurchaseHold = async (purchaseId: string) => {
    try {
      const isCurrentlyHeld = purchaseHolds.some(h => h.purchase_id === purchaseId);
      
      if (isCurrentlyHeld) {
        // Remove the hold
        const { error } = await supabase
          .from('purchase_holds')
          .delete()
          .eq('purchase_id', purchaseId);

        if (error) throw error;

        setPurchaseHolds(prev => prev.filter(h => h.purchase_id !== purchaseId));

        toast({
          title: "Hold Removed",
          description: "Purchase order is now active and will be considered in planning",
        });
      } else {
        // Add a hold
        const heldUntil = new Date();
        heldUntil.setMonth(heldUntil.getMonth() + 3);
        
        const { error } = await supabase
          .from('purchase_holds')
          .upsert({
            purchase_id: purchaseId,
            held_until: heldUntil.toISOString().split('T')[0]
          });

        if (error) throw error;

        setPurchaseHolds(prev => [
          ...prev.filter(h => h.purchase_id !== purchaseId),
          { purchase_id: purchaseId, held_until: heldUntil.toISOString().split('T')[0] }
        ]);

        toast({
          title: "Purchase Held",
          description: "Purchase order will not be considered in planning for 3 months",
        });
      }
    } catch (error) {
      console.error('Error toggling purchase hold:', error);
      toast({
        title: "Error",
        description: "Failed to update purchase order status",
        variant: "destructive",
      });
    }
  };

  const filterPurchasesByCategory = (category: string) => {
    setSelectedCategory(category);
    // Filter purchases that have products in the selected category
    const categoryPurchases = purchaseData.filter(purchase => 
      purchase.order_lines && purchase.order_lines.some(line => 
        inventoryData.some(inv => 
          inv.product_category === category && 
          inv.product_name.toLowerCase().includes(line.product_name.toLowerCase())
        )
      )
    );
    setFilteredPurchases(categoryPurchases);
  };

  const getNextMonthAnalysis = () => {
    return categoryAnalysis.map(cat => ({
      ...cat,
      nextMonthSale: cat.products.reduce((sum, p) => 
        sum + calculateSalesForecast(p.product_name, 1), 0
      ),
      stockWithoutIncoming: cat.products.reduce((sum, p) => 
        sum + p.quantity_on_hand, 0),
      urgentNeeds: cat.products.filter(p => {
        const nextMonthSale = calculateSalesForecast(p.product_name, 1);
        return p.quantity_on_hand < nextMonthSale;
      }).length
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading advanced inventory analysis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Advanced Inventory Planning</h2>
        <div className="flex items-center space-x-4">
          <Select value={selectedMonths} onValueChange={setSelectedMonths}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Month</SelectItem>
              <SelectItem value="3">3 Months</SelectItem>
              <SelectItem value="6">6 Months</SelectItem>
              <SelectItem value="12">12 Months</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={loadData} variant="outline" size="sm">
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Data Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{inventoryData.length}</div>
            <div className="text-sm text-muted-foreground">Products</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{categoryAnalysis.length}</div>
            <div className="text-sm text-muted-foreground">Categories</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{purchaseData.length}</div>
            <div className="text-sm text-muted-foreground">Purchase Orders</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{salesData.length}</div>
            <div className="text-sm text-muted-foreground">Sales Records</div>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Purchase Orders Table with Pivot Style */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Truck className="h-5 w-5" />
            <span>Supplier Purchase Orders</span>
            {selectedCategory && <Badge variant="outline">{selectedCategory}</Badge>}
          </CardTitle>
          <CardDescription>
            Click on PO to expand and see products. Hold/unhold orders to exclude/include them from planning calculations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">PO Number</th>
                  <th className="border p-2 text-left">Supplier</th>
                  <th className="border p-2 text-right">Total Amount</th>
                  <th className="border p-2 text-right">Received</th>
                  <th className="border p-2 text-right">Pending</th>
                  <th className="border p-2 text-center">Expected Date</th>
                  <th className="border p-2 text-center">Status</th>
                  <th className="border p-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(filteredPurchases.length > 0 ? filteredPurchases : purchaseData.slice(0, 20)).map((purchase) => {
                  const isHeld = purchaseHolds.some(h => h.purchase_id === purchase.id);
                  const isExpanded = expandedPurchases[purchase.id];
                  const hasLines = purchase.order_lines && purchase.order_lines.length > 0;
                  
                  return (
                    <React.Fragment key={purchase.id}>
                      <tr className={`hover:bg-gray-50 ${isHeld ? 'bg-red-50' : ''}`}>
                        <td className="border p-2">
                          <div className="flex items-center space-x-2">
                            {hasLines && (
                              <button
                                onClick={() => togglePurchaseExpansion(purchase.id)}
                                className="p-1 hover:bg-gray-200 rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <span>{purchase.name}</span>
                          </div>
                        </td>
                        <td className="border p-2">{purchase.partner_name}</td>
                        <td className="border p-2 text-right">{purchase.amount_total.toLocaleString()}</td>
                        <td className="border p-2 text-right">{purchase.received_qty || 0}</td>
                        <td className="border p-2 text-right">{purchase.pending_qty || 0}</td>
                        <td className="border p-2 text-center">{purchase.expected_date || 'TBD'}</td>
                        <td className="border p-2 text-center">
                          {isHeld ? (
                            <Badge variant="destructive">Held</Badge>
                          ) : (
                            <Badge variant="outline">Active</Badge>
                          )}
                        </td>
                        <td className="border p-2 text-center">
                          <Button
                            size="sm"
                            variant={isHeld ? "default" : "destructive"}
                            onClick={() => handlePurchaseHold(purchase.id)}
                            className="flex items-center space-x-1"
                          >
                            {isHeld ? (
                              <>
                                <RotateCcw className="h-3 w-3" />
                                <span>Activate</span>
                              </>
                            ) : (
                              <span>Hold</span>
                            )}
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && hasLines && purchase.order_lines!.map((line, lineIndex) => (
                        <tr key={`${purchase.id}-line-${lineIndex}`} className="bg-gray-50">
                          <td className="border p-2 pl-8 text-sm">└ {line.product_name}</td>
                          <td className="border p-2 text-sm">-</td>
                          <td className="border p-2 text-right text-sm">{line.price_subtotal.toLocaleString()}</td>
                          <td className="border p-2 text-right text-sm">{line.qty_received}</td>
                          <td className="border p-2 text-right text-sm">{Math.max(0, line.product_qty - line.qty_received)}</td>
                          <td className="border p-2 text-center text-sm">-</td>
                          <td className="border p-2 text-center text-sm">
                            <Badge variant="secondary" className="text-xs">
                              {line.product_qty} ordered
                            </Badge>
                          </td>
                          <td className="border p-2 text-center text-sm">-</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Month Planning Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>{selectedMonths} Month Planning Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">Category</th>
                  <th className="border p-2 text-right">Current Stock</th>
                  <th className="border p-2 text-right">Incoming</th>
                  <th className="border p-2 text-right">Stock + Incoming</th>
                  <th className="border p-2 text-right">{selectedMonths}M Forecast</th>
                  <th className="border p-2 text-right">Needs Planning</th>
                  <th className="border p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {categoryAnalysis.map((category, index) => (
                  <React.Fragment key={category.category}>
                    <tr 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleCategoryExpansion(index)}
                    >
                      <td className="border p-2 flex items-center space-x-2">
                        {category.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-medium">{category.category}</span>
                      </td>
                      <td className="border p-2 text-right">{category.totalStock}</td>
                      <td className="border p-2 text-right">{category.totalIncoming}</td>
                      <td className="border p-2 text-right">{category.totalStock + category.totalIncoming}</td>
                      <td className="border p-2 text-right">
                        {category.products.reduce((sum, p) => 
                          sum + calculateSalesForecast(p.product_name, parseInt(selectedMonths)), 0
                        )}
                      </td>
                      <td className="border p-2 text-right">
                        <span className={category.needsPlanning > 0 ? 'text-red-600 font-bold' : ''}>
                          {category.needsPlanning > 0 ? category.needsPlanning : 'OK'}
                        </span>
                      </td>
                      <td className="border p-2 text-center">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            filterPurchasesByCategory(category.category);
                          }}
                        >
                          View POs
                        </Button>
                      </td>
                    </tr>
                    {category.expanded && category.products.map((product) => {
                      const forecast = calculateSalesForecast(product.product_name, parseInt(selectedMonths));
                      const availableIncoming = getAvailableIncoming(product.product_name);
                      const stockWithIncoming = product.quantity_on_hand + availableIncoming;
                      const needsPlanning = Math.max(0, forecast - stockWithIncoming);
                      
                      return (
                        <tr key={product.id} className="bg-gray-50">
                          <td className="border p-2 pl-8 text-sm">{product.product_name}</td>
                          <td className="border p-2 text-right text-sm">{product.quantity_on_hand}</td>
                          <td className="border p-2 text-right text-sm">{availableIncoming}</td>
                          <td className="border p-2 text-right text-sm">{stockWithIncoming}</td>
                          <td className="border p-2 text-right text-sm">{forecast}</td>
                          <td className="border p-2 text-right text-sm">
                            <span className={needsPlanning > 0 ? 'text-red-600 font-bold' : ''}>
                              {needsPlanning > 0 ? needsPlanning : 'OK'}
                            </span>
                          </td>
                          <td className="border p-2 text-center text-sm">-</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Next Month Urgent Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span>Next Month Urgent Requirements</span>
          </CardTitle>
          <CardDescription>
            Items where stock without incoming is less than next month's sales forecast
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-red-700 text-white">
                  <th className="border p-2 text-left">Category</th>
                  <th className="border p-2 text-right">Stock (No Incoming)</th>
                  <th className="border p-2 text-right">Next Month Sale</th>
                  <th className="border p-2 text-right">Shortfall</th>
                  <th className="border p-2 text-center">Priority</th>
                </tr>
              </thead>
              <tbody>
                {getNextMonthAnalysis()
                  .filter(cat => cat.stockWithoutIncoming < cat.nextMonthSale)
                  .map((category) => (
                    <tr key={category.category} className="hover:bg-red-50">
                      <td className="border p-2 font-medium">{category.category}</td>
                      <td className="border p-2 text-right">{category.stockWithoutIncoming}</td>
                      <td className="border p-2 text-right">{category.nextMonthSale}</td>
                      <td className="border p-2 text-right text-red-600 font-bold">
                        {category.nextMonthSale - category.stockWithoutIncoming}
                      </td>
                      <td className="border p-2 text-center">
                        <Badge variant="destructive">URGENT</Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {getNextMonthAnalysis().filter(cat => cat.stockWithoutIncoming < cat.nextMonthSale).length === 0 && (
              <tr>
                <td colSpan={5} className="border p-4 text-center text-muted-foreground">
                  No urgent requirements for next month
                </td>
              </tr>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};


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
  Calendar
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
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (inventoryData.length > 0) {
      analyzeCategories();
    }
  }, [inventoryData, salesData, selectedMonths, purchaseHolds]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [inventoryRes, purchaseRes, purchaseHoldsRes, salesRes] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('purchases').select('*').order('date_order', { ascending: false }),
        supabase.from('purchase_holds').select('*'),
        supabase.from('invoices').select('*').order('date_order', { ascending: false })
      ]);

      if (inventoryRes.error) throw inventoryRes.error;
      if (purchaseRes.error) throw purchaseRes.error;
      if (purchaseHoldsRes.error) throw purchaseHoldsRes.error;
      if (salesRes.error) throw salesRes.error;

      setInventoryData(inventoryRes.data || []);
      setPurchaseData(purchaseRes.data || []);
      setPurchaseHolds(purchaseHoldsRes.data || []);
      setSalesData(salesRes.data || []);

    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load inventory data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateSalesForecast = (productName: string, months: number): number => {
    const currentDate = new Date();
    const futureDate = new Date();
    futureDate.setMonth(currentDate.getMonth() + months);

    const relevantSales = salesData.filter(invoice => {
      const invoiceDate = new Date(invoice.date_order);
      return invoiceDate >= currentDate && invoiceDate <= futureDate;
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

    return totalQty;
  };

  const analyzeCategories = () => {
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

    setCategoryAnalysis(analysis.sort((a, b) => b.needsPlanning - a.needsPlanning));
  };

  const getAvailableIncoming = (productName: string): number => {
    const heldPurchaseIds = new Set(purchaseHolds.map(h => h.purchase_id));
    
    let totalIncoming = 0;
    purchaseData.forEach(purchase => {
      if (!heldPurchaseIds.has(purchase.id) && purchase.pending_qty > 0) {
        // This is simplified - in real implementation, you'd check purchase lines
        // for products matching the productName
        totalIncoming += purchase.pending_qty || 0;
      }
    });
    
    return totalIncoming;
  };

  const toggleCategoryExpansion = (categoryIndex: number) => {
    setCategoryAnalysis(prev => prev.map((cat, index) => 
      index === categoryIndex ? { ...cat, expanded: !cat.expanded } : cat
    ));
  };

  const handlePurchaseHold = async (purchaseId: string) => {
    try {
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
    } catch (error) {
      console.error('Error holding purchase:', error);
      toast({
        title: "Error",
        description: "Failed to hold purchase order",
        variant: "destructive",
      });
    }
  };

  const filterPurchasesByCategory = (category: string) => {
    setSelectedCategory(category);
    // This would filter purchases based on category - simplified for demo
    setFilteredPurchases(purchaseData.slice(0, 10));
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

      {/* Supplier Purchase Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Truck className="h-5 w-5" />
            <span>Supplier Purchase Orders</span>
            {selectedCategory && <Badge variant="outline">{selectedCategory}</Badge>}
          </CardTitle>
          <CardDescription>
            Click and hold any PO to exclude it from planning calculations for 3 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">PO Number</th>
                  <th className="border p-2 text-left">Supplier</th>
                  <th className="border p-2 text-right">Total Qty</th>
                  <th className="border p-2 text-right">Received</th>
                  <th className="border p-2 text-right">Pending</th>
                  <th className="border p-2 text-center">Expected Date</th>
                  <th className="border p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {(filteredPurchases.length > 0 ? filteredPurchases : purchaseData.slice(0, 10)).map((purchase) => {
                  const isHeld = purchaseHolds.some(h => h.purchase_id === purchase.id);
                  return (
                    <tr 
                      key={purchase.id} 
                      className={`hover:bg-gray-50 cursor-pointer ${isHeld ? 'bg-red-50' : ''}`}
                      onMouseDown={() => handlePurchaseHold(purchase.id)}
                    >
                      <td className="border p-2">{purchase.name}</td>
                      <td className="border p-2">{purchase.partner_name}</td>
                      <td className="border p-2 text-right">{purchase.amount_total}</td>
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
                    </tr>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

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
  RotateCcw,
  Download,
  Filter
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadElementAsPdf } from '@/lib/pdfUtils';
import { Popover } from '@/components/ui/popover';
import * as XLSX from 'xlsx';

interface InventoryData {
  id: string;
  product_id?: string | number;
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

interface RawInventoryRow {
  id: string;
  product_id?: string | number;
  product_name?: string;
  product_category?: string;
  quantity_on_hand?: number;
  quantity_available?: number;
  incoming_qty?: number;
  outgoing_qty?: number;
  virtual_available?: number;
  reorder_min?: number;
  reorder_max?: number;
  cost?: number;
  location?: string;
  [key: string]: any;
}

function hasProductId(obj: any): obj is { product_id: string | number } {
  return obj && (typeof obj.product_id === 'string' || typeof obj.product_id === 'number');
}

function extractSize(productName: string): string | number | null {
  if (!productName) return null;
  const sizePattern = /(\b(2XL|3XL|4XL|XL|L|M|S)\b|\b(22|24|26|28|30|32|34|36|38|40|42)\b)$/i;
  const match = productName.match(sizePattern);
  if (match) {
    const size = match[0].toUpperCase();
    if (!isNaN(Number(size))) return Number(size);
    return size;
  }
  return null;
}

function extractBaseName(productName: string): string {
  if (!productName) return '';
  const sizePattern = /(\b(2XL|3XL|4XL|XL|L|M|S)\b|\b(22|24|26|28|30|32|34|36|38|40|42)\b)$/i;
  return productName.replace(sizePattern, '').trim().replace(/[-\s]+$/, '').toUpperCase();
}

function extractColor(productName: string): string {
  if (!productName) return 'Unknown Color';
  const sizePattern = /(\b(2XL|3XL|4XL|XL|L|M|S)\b|\b(22|24|26|28|30|32|34|36|38|40|42)\b)$/i;
  const nameWithoutSize = productName.replace(sizePattern, '').trim().replace(/[-\s]+$/, '');
  const parts = nameWithoutSize.split(/[-\s]+/);
  return parts.length > 1 ? parts.slice(0, -1).join('-').toUpperCase() : nameWithoutSize.toUpperCase();
}

const sizeOrder = [22,24,26,28,30,32,34,36,38,40,42,'S','M','L','XL','2XL','3XL','4XL'];
function getSizeSortValue(size: string | number | null): number {
  if (size === null) return 9999;
  const idx = sizeOrder.findIndex(s => String(s) === String(size));
  return idx === -1 ? 9999 : idx;
}

function sortProductsBySize(products: any[]): any[] {
  return [...products].sort((a, b) => {
    const baseA = extractBaseName(a.product_name);
    const baseB = extractBaseName(b.product_name);
    if (baseA < baseB) return -1;
    if (baseA > baseB) return 1;
    const sizeA = extractSize(a.product_name);
    const sizeB = extractSize(b.product_name);
    return getSizeSortValue(sizeA) - getSizeSortValue(sizeB);
  });
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
  const [productsData, setProductsData] = useState<any[]>([]);
  const [expandedIncoming, setExpandedIncoming] = useState<{ [productId: string]: boolean }>({});
  const [searchPO, setSearchPO] = useState('');
  const [viewCategoryDialog, setViewCategoryDialog] = useState<{ open: boolean, category: string | null }>({ open: false, category: null });
  const [showUrgentPdfDialog, setShowUrgentPdfDialog] = useState(false);
  const [salesQtyPercent, setSalesQtyPercent] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [hiddenCategories, setHiddenCategories] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('hiddenCategories');
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });
  const [showHideDropdown, setShowHideDropdown] = useState(false);
  const [selectedCategoryNextMonth, setSelectedCategoryNextMonth] = useState<string>('');
  const [selectedCategory3Month, setSelectedCategory3Month] = useState<string>('');
  const [selectedCategoryColor, setSelectedCategoryColor] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hiddenCategories', JSON.stringify(hiddenCategories));
    }
  }, [hiddenCategories]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (inventoryData.length > 0 || salesData.length > 0) {
      analyzeCategories();
    }
  }, [inventoryData, salesData, selectedMonths, purchaseHolds]);

  const syncAndLoadData = async () => {
    setIsSyncing(true);
    toast({ title: 'Syncing Odoo data...', description: 'Please wait while data is synced from Odoo.', variant: 'default' });
    try {
      const syncResults = await Promise.all([
        supabase.functions.invoke('odoo-purchases'),
        supabase.functions.invoke('odoo-invoices'),
        supabase.functions.invoke('odoo-inventory'),
        supabase.functions.invoke('odoo-products')
      ]);
      const allOk = syncResults.every(res => !res.error && res.data && res.data.success !== false);
      if (!allOk) {
        toast({ title: 'Sync Error', description: 'One or more syncs failed. Check logs.', variant: 'destructive' });
      } else {
        toast({ title: 'Sync Complete', description: 'Odoo data synced successfully.', variant: 'default' });
      }
      await loadData();
    } catch (err) {
      toast({ title: 'Sync Error', description: 'Failed to sync Odoo data: ' + (err as Error).message, variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      console.log('Loading inventory and sales data...');
      
      const [inventoryRes, purchaseRes, purchaseHoldsRes, salesRes, productsRes] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('purchases').select('*').order('date_order', { ascending: false }),
        supabase.from('purchase_holds').select('*'),
        supabase.from('invoices').select('*').order('date_order', { ascending: false }),
        ((supabase as any).from('products')).select('*')
      ]);

      console.log('Data loaded:', {
        inventory: inventoryRes.data?.length || 0,
        purchases: purchaseRes.data?.length || 0,
        holds: purchaseHoldsRes.data?.length || 0,
        sales: salesRes.data?.length || 0
      });

      if (inventoryRes.error) throw inventoryRes.error;
      if (purchaseRes.error) throw purchaseRes.error;
      if (purchaseHoldsRes.error) throw purchaseHoldsRes.error;
      if (salesRes.error) throw salesRes.error;

      const transformedInventory = ((inventoryRes.data as RawInventoryRow[] || []).map(item => ({
        id: item.id,
        product_id: typeof item.product_id === 'string' || typeof item.product_id === 'number' ? item.product_id : undefined,
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
      }) as InventoryData)) as InventoryData[];

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
        order_lines: Array.isArray(item.order_lines)
          ? item.order_lines.map((line: any) => ({
              id: Number(line.id),
              product_name: String(line.product_name),
              product_qty: Number(line.product_qty),
              qty_received: Number(line.qty_received),
              price_unit: Number(line.price_unit),
              price_subtotal: Number(line.price_subtotal)
            }))
          : []
      }));

      setInventoryData(transformedInventory);
      setPurchaseData(transformedPurchases);
      setPurchaseHolds(purchaseHoldsRes.data || []);
      setSalesData((salesRes.data || []).map(inv => ({
        ...inv,
        order_lines: Array.isArray(inv.order_lines)
          ? inv.order_lines.map((line: any) => {
              let normalizedProductId = undefined;
              if (Array.isArray(line.product_id)) {
                normalizedProductId = line.product_id[0];
              } else if (typeof line.product_id === 'string' || typeof line.product_id === 'number') {
                normalizedProductId = line.product_id;
              }
              return {
                ...line,
                product_id: normalizedProductId,
              };
            })
          : []
      })));
      setProductsData(productsRes.data || []);

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

  const calculateSalesForecast = (productName: string, months: number, productId?: string | number): number => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const previousYear = currentYear - 1;
    const startMonth = currentMonth;
    const targetMonths = Array.from({ length: months }, (_, i) => (startMonth + i) % 12);
    
    const relevantSales = salesData.filter(invoice => {
      const invoiceDate = new Date(invoice.date_order);
      const invoiceYear = invoiceDate.getFullYear();
      const invoiceMonth = invoiceDate.getMonth();
      if (invoiceYear !== previousYear) return false;
      return targetMonths.includes(invoiceMonth);
    });
    
    let totalQty = 0;
    relevantSales.forEach(invoice => {
      if (invoice.order_lines && Array.isArray(invoice.order_lines)) {
        invoice.order_lines.forEach((line: any) => {
          let match = false;
          if (productId && line.product_id && String(line.product_id) === String(productId)) {
            match = true;
          } else if (!productId && line.product_name && line.product_name.toLowerCase().includes(productName.toLowerCase())) {
            match = true;
          }
          if (match) {
            totalQty += line.qty_delivered || 0;
          }
        });
      }
    });
    
    return totalQty;
  };

  const analyzeCategories = () => {
    console.log('Analyzing categories with data:', {
      inventoryItems: inventoryData.length,
      salesItems: salesData.length,
      products: productsData.length
    });

    const productMap: { [id: string]: any } = {};
    productsData.forEach(prod => {
      if (prod.id) productMap[String(prod.id)] = prod;
    });

    const joinedInventory = inventoryData.map(inv => {
      let prod = undefined;
      if (inv.product_id && productMap[String(inv.product_id)]) {
        prod = productMap[String(inv.product_id)];
      } else if (inv.product_name) {
        prod = productsData.find(p => p.name && p.name.toLowerCase() === inv.product_name.toLowerCase());
      }
      return {
        ...inv,
        product_name: prod?.name || inv.product_name,
        product_category: prod?.product_category || inv.product_category,
        product_ref: prod,
      };
    });

    const categoryMap: { [key: string]: typeof joinedInventory } = {};
    joinedInventory.forEach(item => {
      const category = item.product_category || 'Uncategorized';
      if (!categoryMap[category]) {
        categoryMap[category] = [];
      }
      categoryMap[category].push(item);
    });

    const analysis: CategoryAnalysis[] = Object.keys(categoryMap).map(category => {
      const products = categoryMap[category];
      const totalStock = products.reduce((sum, p) => sum + p.quantity_on_hand, 0);
      const totalIncoming = products.reduce((sum, p) => sum + (p.incoming_qty || 0), 0);
      const totalOutgoing = products.reduce((sum, p) => sum + p.outgoing_qty, 0);
      let needsPlanning = 0;
      products.forEach(product => {
        const forecast = calculateSalesForecast(product.product_name, parseInt(selectedMonths), product.product_id);
        const availableIncoming = product.incoming_qty || 0;
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

  // Export to Excel function
  const exportToExcel = (data: any[], filename: string, sheetName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const getPendingIncomingForProduct = (product: InventoryData): number => {
    const heldPurchaseIds = new Set(purchaseHolds.map(h => h.purchase_id));
    let sum = 0;
    purchaseData.forEach(po => {
      if (!heldPurchaseIds.has(po.id) && po.order_lines) {
        po.order_lines.forEach(line => {
          const anyLine = line as any;
          let lineProductId = undefined;
          if (Array.isArray(anyLine.product_id)) {
            lineProductId = anyLine.product_id[0];
          } else if (typeof anyLine.product_id === 'string' || typeof anyLine.product_id === 'number') {
            lineProductId = anyLine.product_id;
          }
          let match = false;
          if (product.product_id && lineProductId && String(lineProductId) === String(product.product_id)) {
            match = true;
          } else if (
            (!product.product_id || !lineProductId) &&
            anyLine.product_name &&
            product.product_name &&
            anyLine.product_name.toLowerCase().includes(product.product_name.toLowerCase())
          ) {
            match = true;
          }
          const pending = Math.max(0, anyLine.product_qty - anyLine.qty_received);
          if (match && pending > 0) {
            sum += pending;
          }
        });
      }
    });
    return sum;
  };

  const getSalesQtyForProduct = (product: InventoryData, months: number): number => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const previousYear = currentYear - 1;
    const startMonth = (currentMonth + 1) % 12;
    const targetMonths = Array.from({ length: months }, (_, i) => (startMonth + i) % 12);
    let totalQty = 0;
    salesData.forEach(invoice => {
      const invoiceDate = new Date(invoice.date_order);
      const invoiceYear = invoiceDate.getFullYear();
      const invoiceMonth = invoiceDate.getMonth();
      if (invoiceYear !== previousYear) return;
      if (!targetMonths.includes(invoiceMonth)) return;
      if (invoice.order_lines && Array.isArray(invoice.order_lines)) {
        invoice.order_lines.forEach((line: any) => {
          const anyLine = line as any;
          let lineProductId = undefined;
          if (Array.isArray(anyLine.product_id)) {
            lineProductId = anyLine.product_id[0];
          } else if (typeof anyLine.product_id === 'string' || typeof anyLine.product_id === 'number') {
            lineProductId = anyLine.product_id;
          }
          let match = false;
          if (product.product_id && lineProductId && String(lineProductId) === String(product.product_id)) {
            match = true;
          } else if (
            (!product.product_id || !lineProductId) &&
            anyLine.product_name &&
            product.product_name &&
            anyLine.product_name.toLowerCase().includes(product.product_name.toLowerCase())
          ) {
            match = true;
          }
          if (match) {
            totalQty += anyLine.qty_delivered || 0;
          }
        });
      }
    });
    return totalQty;
  };

  const getNextMonthAnalysis = () => {
    return categoryAnalysis.map(cat => ({
      ...cat,
      nextMonthSale: cat.products.reduce((sum, p) => 
        sum + calculateSalesForecast(p.product_name, 1, hasProductId(p) ? p.product_id : undefined), 0
      ),
      stockWithoutIncoming: cat.products.reduce((sum, p) => 
        sum + p.quantity_on_hand, 0),
      urgentNeeds: cat.products.filter(p => {
        const nextMonthSale = calculateSalesForecast(p.product_name, 1, hasProductId(p) ? p.product_id : undefined);
        return p.quantity_on_hand < nextMonthSale;
      }).length
    }));
  };

  // Prepare data for Next Month Analysis Export
  const getNextMonthExportData = () => {
    const nextMonthAnalysis = getNextMonthAnalysis();
    const filteredData = selectedCategoryNextMonth && selectedCategoryNextMonth !== 'all' 
      ? nextMonthAnalysis.filter(cat => cat.category === selectedCategoryNextMonth)
      : nextMonthAnalysis;
    
    return filteredData.flatMap(cat => 
      cat.products.map(product => ({
        Category: cat.category,
        'Product Name': product.product_name,
        'Current Stock': product.quantity_on_hand,
        'Next Month Sale': getSalesQtyForProduct(product, 1),
        'Incoming Qty': getPendingIncomingForProduct(product),
        'Stock + Incoming': product.quantity_on_hand + getPendingIncomingForProduct(product),
        'Needs Planning': Math.max(0, getSalesQtyForProduct(product, 1) - (product.quantity_on_hand + getPendingIncomingForProduct(product))),
        'Reorder Min': product.reorder_min,
        'Reorder Max': product.reorder_max
      }))
    );
  };

  // Prepare data for 3 Month Analysis Export
  const get3MonthExportData = () => {
    const filteredData = selectedCategory3Month && selectedCategory3Month !== 'all' 
      ? categoryAnalysis.filter(cat => cat.category === selectedCategory3Month)
      : categoryAnalysis;
    
    return filteredData.flatMap(cat => 
      cat.products.map(product => {
        const salesQty = getSalesQtyForProduct(product, parseInt(selectedMonths));
        const adjustedSalesQty = salesQty * (1 + salesQtyPercent / 100);
        const incomingQty = getPendingIncomingForProduct(product);
        return {
          Category: cat.category,
          'Product Name': product.product_name,
          'Current Stock': product.quantity_on_hand,
          [`${selectedMonths} Month Sale`]: salesQty,
          'Sales Increase %': salesQtyPercent,
          'Adjusted Sales Qty': adjustedSalesQty,
          'Incoming Qty': incomingQty,
          'Stock + Incoming': product.quantity_on_hand + incomingQty,
          'Needs Planning': Math.max(0, adjustedSalesQty - (product.quantity_on_hand + incomingQty)),
          'Reorder Min': product.reorder_min,
          'Reorder Max': product.reorder_max
        };
      })
    );
  };

  // Get color-based analysis
  const getColorAnalysis = () => {
    const colorMap: { [color: string]: InventoryData[] } = {};
    
    const filteredInventory = selectedCategoryColor && selectedCategoryColor !== 'all' 
      ? inventoryData.filter(item => item.product_category === selectedCategoryColor)
      : inventoryData;
      
    filteredInventory.forEach(item => {
      const color = extractColor(item.product_name);
      if (!colorMap[color]) {
        colorMap[color] = [];
      }
      colorMap[color].push(item);
    });

    return Object.keys(colorMap).map(color => ({
      color,
      products: colorMap[color],
      totalStock: colorMap[color].reduce((sum, p) => sum + p.quantity_on_hand, 0),
      totalIncoming: colorMap[color].reduce((sum, p) => sum + getPendingIncomingForProduct(p), 0),
      nextMonthSale: colorMap[color].reduce((sum, p) => sum + getSalesQtyForProduct(p, 1), 0),
      needsPlanning: colorMap[color].reduce((sum, p) => {
        const salesQty = getSalesQtyForProduct(p, 1);
        const incomingQty = getPendingIncomingForProduct(p);
        return sum + Math.max(0, salesQty - (p.quantity_on_hand + incomingQty));
      }, 0),
      expanded: false
    })).sort((a, b) => b.needsPlanning - a.needsPlanning);
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
          <Button onClick={syncAndLoadData} variant="outline" size="sm" disabled={isSyncing}>
            {isSyncing ? 'Syncing...' : 'Refresh Data'}
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

      {/* Percentage input for planning */}
      <div className="flex items-center mb-2">
        <label className="mr-2 font-medium">Increase Sales Qty by (%)</label>
        <input
          type="number"
          min="0"
          max="100"
          value={salesQtyPercent}
          onChange={e => setSalesQtyPercent(Number(e.target.value))}
          className="border rounded px-2 py-1 w-20 text-right"
          style={{ minWidth: 60 }}
        />
      </div>

      {/* Next Month Planning Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Next Month Planning Analysis</span>
            </div>
            <div className="flex items-center space-x-2">
              <Select value={selectedCategoryNextMonth} onValueChange={setSelectedCategoryNextMonth}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by category..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Array.from(new Set(inventoryData.map(item => item.product_category))).map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => exportToExcel(getNextMonthExportData(), 'Next_Month_Planning_Analysis', 'Next Month Analysis')}
                variant="outline"
                size="sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Planning analysis for next month based on previous year's same month data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">Category</th>
                  <th className="border p-2 text-right">Products</th>
                  <th className="border p-2 text-right">Current Stock</th>
                  <th className="border p-2 text-right">Next Month Sale</th>
                  <th className="border p-2 text-right">Incoming</th>
                  <th className="border p-2 text-right">Needs Planning</th>
                  <th className="border p-2 text-right">Urgent Items</th>
                </tr>
              </thead>
              <tbody>
                {getNextMonthAnalysis()
                  .filter(cat => !selectedCategoryNextMonth || selectedCategoryNextMonth === 'all' || cat.category === selectedCategoryNextMonth)
                  .map((cat, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border p-2 font-medium">{cat.category}</td>
                      <td className="border p-2 text-right">{cat.products.length}</td>
                      <td className="border p-2 text-right">{cat.stockWithoutIncoming}</td>
                      <td className="border p-2 text-right">{cat.nextMonthSale}</td>
                      <td className="border p-2 text-right">{cat.totalIncoming}</td>
                      <td className="border p-2 text-right">
                        {cat.nextMonthSale - (cat.stockWithoutIncoming + cat.totalIncoming) > 0 ? (
                          <span className="text-red-600 font-bold">
                            {cat.nextMonthSale - (cat.stockWithoutIncoming + cat.totalIncoming)}
                          </span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </td>
                      <td className="border p-2 text-right">
                        {cat.urgentNeeds > 0 ? (
                          <span className="text-red-600 font-bold">{cat.urgentNeeds}</span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 3 Month Planning Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5" />
              <span>{selectedMonths} Month Planning Analysis</span>
            </div>
            <div className="flex items-center space-x-2">
              <Select value={selectedCategory3Month} onValueChange={setSelectedCategory3Month}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by category..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Array.from(new Set(inventoryData.map(item => item.product_category))).map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => exportToExcel(get3MonthExportData(), `${selectedMonths}_Month_Planning_Analysis`, `${selectedMonths} Month Analysis`)}
                variant="outline"
                size="sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Planning analysis for {selectedMonths} months with {salesQtyPercent}% increase
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">Category</th>
                  <th className="border p-2 text-right">Products</th>
                  <th className="border p-2 text-right">Current Stock</th>
                  <th className="border p-2 text-right">{selectedMonths}M Sale</th>
                  <th className="border p-2 text-right">Adjusted Sale</th>
                  <th className="border p-2 text-right">Incoming</th>
                  <th className="border p-2 text-right">Needs Planning</th>
                </tr>
              </thead>
              <tbody>
                {categoryAnalysis
                  .filter(cat => !selectedCategory3Month || selectedCategory3Month === 'all' || cat.category === selectedCategory3Month)
                  .map((cat, index) => {
                    const salesQty = cat.products.reduce((sum, p) => sum + getSalesQtyForProduct(p, parseInt(selectedMonths)), 0);
                    const adjustedSalesQty = salesQty * (1 + salesQtyPercent / 100);
                    const needsPlanning = Math.max(0, adjustedSalesQty - (cat.totalStock + cat.totalIncoming));
                    return (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="border p-2 font-medium">{cat.category}</td>
                        <td className="border p-2 text-right">{cat.products.length}</td>
                        <td className="border p-2 text-right">{cat.totalStock}</td>
                        <td className="border p-2 text-right">{salesQty}</td>
                        <td className="border p-2 text-right">{Math.round(adjustedSalesQty)}</td>
                        <td className="border p-2 text-right">{cat.totalIncoming}</td>
                        <td className="border p-2 text-right">
                          {needsPlanning > 0 ? (
                            <span className="text-red-600 font-bold">{Math.round(needsPlanning)}</span>
                          ) : (
                            <span className="text-green-600">0</span>
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

      {/* Color-Based Planning Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>Color-Based Planning Analysis</span>
            </div>
            <div className="flex items-center space-x-2">
              <Select value={selectedCategoryColor} onValueChange={setSelectedCategoryColor}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by category..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Array.from(new Set(inventoryData.map(item => item.product_category))).map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
          <CardDescription>
            Products grouped by color (extracted from product names like BRITNY-BLACK → britny-black)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">Color</th>
                  <th className="border p-2 text-right">Products</th>
                  <th className="border p-2 text-right">Current Stock</th>
                  <th className="border p-2 text-right">Next Month Sale</th>
                  <th className="border p-2 text-right">Incoming</th>
                  <th className="border p-2 text-right">Needs Planning</th>
                </tr>
              </thead>
              <tbody>
                {getColorAnalysis().map((colorGroup, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="border p-2 font-medium">{colorGroup.color}</td>
                    <td className="border p-2 text-right">{colorGroup.products.length}</td>
                    <td className="border p-2 text-right">{colorGroup.totalStock}</td>
                    <td className="border p-2 text-right">{colorGroup.nextMonthSale}</td>
                    <td className="border p-2 text-right">{colorGroup.totalIncoming}</td>
                    <td className="border p-2 text-right">
                      {colorGroup.needsPlanning > 0 ? (
                        <span className="text-red-600 font-bold">{colorGroup.needsPlanning}</span>
                      ) : (
                        <span className="text-green-600">0</span>
                      )}
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
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
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
  Brain,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Grid3X3,
  List
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadElementAsPdf, generatePlanningReportPdf } from '@/lib/pdfUtils';
import { AIInventoryPlanningReport } from './AIInventoryPlanningReport';

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
  is_on_hold?: boolean;
}

interface PurchaseHold {
  id: string;
  purchase_id: string;
  held_until: string;
  created_at: string | null;
}

interface CategoryAnalysis {
  category: string;
  products: InventoryData[];
  totalStock: number;
  totalIncoming: number;
  totalOutgoing: number;
  totalSalesQty: number;
  needsPlanning: number;
  expanded: boolean;
}

interface ExpandedPurchases {
  [key: string]: boolean;
}

// Define a type for raw inventory rows from Supabase, including product_id as optional
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

// Type guard for product_id
function hasProductId(obj: any): obj is { product_id: string | number } {
  return obj && (typeof obj.product_id === 'string' || typeof obj.product_id === 'number');
}

// Helper to extract size from product name
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

// Helper to extract base name (everything except the size at the end)
function extractBaseName(productName: string): string {
  if (!productName) return '';
  const sizePattern = /(\b(2XL|3XL|4XL|XL|L|M|S)\b|\b(22|24|26|28|30|32|34|36|38|40|42)\b)$/i;
  return productName.replace(sizePattern, '').trim().replace(/[-\s]+$/, '').toUpperCase();
}

// Custom sort order for sizes
const sizeOrder = [22,24,26,28,30,32,34,36,38,40,42,'S','M','L','XL','2XL','3XL','4XL'];
function getSizeSortValue(size: string | number | null): number {
  if (size === null) return 9999;
  const idx = sizeOrder.findIndex(s => String(s) === String(size));
  return idx === -1 ? 9999 : idx;
}

// Update sortProductsBySize to sort by base name, then size
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
  const [showAIReport, setShowAIReport] = useState(false);
  const [showUrgentPdfDialog, setShowUrgentPdfDialog] = useState(false);
  
  // Function to generate optimized PDF
  const generateOptimizedPdf = async () => {
    if (!categoryAnalysis || categoryAnalysis.length === 0) {
      toast({
        title: "No Data",
        description: "No data available for PDF generation.",
        variant: "destructive",
      });
      return;
    }

    // Prepare data for PDF generation
    const pdfData = categoryAnalysis
      .filter(categoryData => {
        const category = categoryData.category || 'Uncategorized';
        return globalCategoryFilter.length === 0 || globalCategoryFilter.includes(category);
      })
      .map(categoryData => {
        const products = categoryData.products.map(product => {
          const salesQty = Math.round(getSalesQtyForProduct(product, parseInt(selectedMonths)) * (1 + salesQtyPercent / 100));
          const availableIncoming = getPendingIncomingForProduct(product);
          const stockWithIncoming = product.quantity_on_hand + availableIncoming;
          const needsPlanning = Math.max(0, salesQty - stockWithIncoming);
          
          return {
            ...product,
            salesQty,
            availableIncoming,
            stockWithIncoming,
            needsPlanning
          };
        });

        return {
          category: categoryData.category || 'Uncategorized',
          products: products.sort((a, b) => b.needsPlanning - a.needsPlanning)
        };
      });

    try {
      await generatePlanningReportPdf(pdfData, selectedMonths, salesQtyPercent, globalCategoryFilter);
      
      toast({
        title: "PDF Generated",
        description: "Planning report PDF has been downloaded successfully.",
      });
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast({
        title: "PDF Generation Failed",
        description: "Failed to generate PDF. Please check the console for details.",
        variant: "destructive",
      });
    }
  };
  const [salesQtyPercent, setSalesQtyPercent] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [nextMonthSortColumn, setNextMonthSortColumn] = useState<string>('');
  const [nextMonthSortDirection, setNextMonthSortDirection] = useState<'asc' | 'desc'>('asc');
  const [secondarySortColumn, setSecondarySortColumn] = useState<string>('salesQty');
  const [showCategorized, setShowCategorized] = useState<boolean>(true);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('hiddenCategories');
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  });
  const [showHideDropdown, setShowHideDropdown] = useState(false);
  
  const defaultExcludedCategories = [
    'apex', 'cozifit', 'finished good', 'other', 
    'tween huger', 'raw materials', 'raw materials / deliveries', 
    'odel', 'other suppliers', 'other suppliers / lee vee',
    'cozi fit', 'other suppliers / fashion bug', 'semina junior', 'harmony fit'
  ];
  
  const [globalCategoryFilter, setGlobalCategoryFilter] = useState<string[]>([]);

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
  }, [inventoryData, salesData, selectedMonths]);

  // Initialize global category filter when category analysis changes
  useEffect(() => {
    if (categoryAnalysis.length > 0) {
      const allCategories = categoryAnalysis.map(cat => cat.category);
      const selectedCategories = allCategories.filter(cat => 
        !defaultExcludedCategories.includes(cat.toLowerCase())
      );
      
      if (globalCategoryFilter.length === 0) {
        setGlobalCategoryFilter(selectedCategories);
      }
    }
  }, [categoryAnalysis]);

  const syncAndLoadData = async () => {
    setIsSyncing(true);
    toast({ title: 'Syncing Odoo data...', description: 'Please wait while data is synced from Odoo.', variant: 'default' });
    try {
      // Call all edge functions in parallel
      const syncResults = await Promise.all([
        fetch('/functions/v1/odoo-purchases', { method: 'POST' }),
        fetch('/functions/v1/odoo-invoices', { method: 'POST' }),
        fetch('/functions/v1/odoo-inventory', { method: 'POST' }),
        fetch('/functions/v1/odoo-products', { method: 'POST' })
      ]);
      const allOk = syncResults.every(res => res.ok);
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
      
      const [inventoryRes, purchaseRes, salesRes, productsRes, holdsRes] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('purchases').select('*').order('date_order', { ascending: false }),
        supabase.from('invoices').select('*').order('date_order', { ascending: false }),
        ((supabase as any).from('products')).select('*'),
        supabase.from('purchase_holds').select('*')
      ]);

      console.log('Data loaded:', {
        inventory: inventoryRes.data?.length || 0,
        purchases: purchaseRes.data?.length || 0,
        sales: salesRes.data?.length || 0,
        holds: holdsRes.data?.length || 0
      });

      if (inventoryRes.error) {
        console.error('Inventory error:', inventoryRes.error);
        throw inventoryRes.error;
      }
      if (purchaseRes.error) {
        console.error('Purchase error:', purchaseRes.error);
        throw purchaseRes.error;
      }
      if (salesRes.error) {
        console.error('Sales error:', salesRes.error);
        throw salesRes.error;
      }

      // Transform the data to ensure proper types
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

      // Set purchase holds data
      setPurchaseHolds(holdsRes.data || []);
      
      // Mark purchases as on hold based on holds data
      const holdMap = new Map();
      console.log('Hold records from database:', holdsRes.data);
      
      (holdsRes.data || []).forEach((hold: any) => {
        console.log('Processing hold record:', hold);
        
        // Store the PO name/ID for matching (no expiration check)
        const purchaseId = hold.purchase_id;
        if (purchaseId) {
          holdMap.set(purchaseId, true);
          console.log(`Added to hold map: ${purchaseId}`);
        }
      });
      
      console.log('Hold map created:', Array.from(holdMap.keys()));
      
      const purchasesWithHoldStatus = transformedPurchases.map(purchase => {
        const isOnHold = holdMap.has(purchase.name);
        console.log(`Checking PO ${purchase.name}: isOnHold = ${isOnHold}`);
        return {
          ...purchase,
          is_on_hold: isOnHold
        };
      });

      setInventoryData(transformedInventory);
      setPurchaseData(purchasesWithHoldStatus);
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

      // If we have no inventory data, create some sample data to show structure
      if (transformedInventory.length === 0) {
        console.log('No inventory data found, not showing sample data.');
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
  const calculateSalesForecast = (productName: string, months: number, productId?: string | number): number => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const previousYear = currentYear - 1;
    const startMonth = currentMonth;
    const targetMonths = Array.from({ length: months }, (_, i) => (startMonth + i) % 12);
    const debugLines: string[] = [];
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
            debugLines.push(`Matched sale: invoice ${invoice.id || invoice.name}, line ${line.product_id || line.product_name}, qty: ${line.qty_delivered}`);
          }
        });
      }
    });
    console.log(`Forecast for ${productName} (${productId || 'no id'}), months: ${months}, year: ${previousYear}, months: ${targetMonths.map(m => m+1).join(', ')}. Found ${relevantSales.length} invoices, total qty: ${totalQty}`);
    debugLines.forEach(l => console.log(l));
    return totalQty;
  };

  const analyzeCategories = () => {
    console.log('Analyzing categories with data:', {
      inventoryItems: inventoryData.length,
      salesItems: salesData.length,
      products: productsData.length
    });

    // Build a map of product_id to product info
    const productMap: { [id: string]: any } = {};
    productsData.forEach(prod => {
      if (prod.id) productMap[String(prod.id)] = prod;
    });

    // Join inventory to products by product_id (fallback to product_name if missing)
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

    // Group by category from products table
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
      
      // Calculate total sales quantity for the category
      const totalSalesQty = products.reduce((sum, product) => {
        const salesQty = Math.round(getSalesQtyForProduct(product, parseInt(selectedMonths)) * (1 + salesQtyPercent / 100));
        return sum + salesQty;
      }, 0);
      
      // Calculate needs planning, excluding items that are 'OK' (have sufficient stock)
      let needsPlanning = 0;
      products.forEach(product => {
        const salesQty = Math.round(getSalesQtyForProduct(product, parseInt(selectedMonths)) * (1 + salesQtyPercent / 100));
        const availableIncoming = getPendingIncomingForProduct(product);
        const stockWithIncoming = product.quantity_on_hand + availableIncoming;
        const productNeedsPlanning = Math.max(0, salesQty - stockWithIncoming);
        if (productNeedsPlanning > 0) {
          needsPlanning += productNeedsPlanning;
        }
      });
      
      return {
        category,
        products,
        totalStock,
        totalIncoming,
        totalOutgoing,
        totalSalesQty,
        needsPlanning,
        expanded: false
      };
    });

    console.log('Category analysis completed:', analysis.length, 'categories');
    setCategoryAnalysis(analysis.sort((a, b) => b.needsPlanning - a.needsPlanning));
  };

  const getAvailableIncoming = (productName: string, productId?: string | number): number => {
    let totalIncoming = 0;
    purchaseData.forEach(purchase => {
      // Skip if PO is on hold
      if (purchase.is_on_hold) return;
      
      if (purchase.order_lines) {
        purchase.order_lines.forEach(line => {
          let match = false;
          if (productId && 'product_id' in line && line.product_id && String(line.product_id) === String(productId)) {
            match = true;
          } else if (!productId && line.product_name && line.product_name.toLowerCase().includes(productName.toLowerCase())) {
            match = true;
          }
          if (match) {
            totalIncoming += Math.max(0, line.product_qty - line.qty_received);
          }
        });
      }
    });
    
    return totalIncoming;
  };

  const toggleCategoryExpansion = (categoryName: string) => {
    setCategoryAnalysis(prev => prev.map((cat) => 
      cat.category === categoryName ? { ...cat, expanded: !cat.expanded } : cat
    ));
  };

  const togglePurchaseExpansion = (purchaseId: string) => {
    setExpandedPurchases(prev => ({
      ...prev,
      [purchaseId]: !prev[purchaseId]
    }));
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

  // Sorting functions
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleNextMonthSort = (column: string) => {
    if (nextMonthSortColumn === column) {
      setNextMonthSortDirection(nextMonthSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setNextMonthSortColumn(column);
      setNextMonthSortDirection('asc');
    }
  };

  const getSortIcon = (column: string, currentColumn: string, direction: 'asc' | 'desc') => {
    if (currentColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return direction === 'asc' ? 
      <ArrowUp className="h-4 w-4 text-white" /> : 
      <ArrowDown className="h-4 w-4 text-white" />;
  };

  const sortCategoryAnalysis = (categories: CategoryAnalysis[]) => {
    if (!sortColumn) return categories;
    
    return [...categories].sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortColumn) {
        case 'category':
          aValue = a.category.toLowerCase();
          bValue = b.category.toLowerCase();
          break;
        case 'totalStock':
          aValue = a.totalStock;
          bValue = b.totalStock;
          break;
        case 'totalIncoming':
          aValue = a.totalIncoming;
          bValue = b.totalIncoming;
          break;
        case 'needsPlanning':
          aValue = a.needsPlanning;
          bValue = b.needsPlanning;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const sortNextMonthProducts = (products: any[]) => {
    if (!nextMonthSortColumn) return products;
    
    return [...products].sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (nextMonthSortColumn) {
        case 'product':
          aValue = a.product_name.toLowerCase();
          bValue = b.product_name.toLowerCase();
          break;
        case 'category':
          aValue = a.product_category.toLowerCase();
          bValue = b.product_category.toLowerCase();
          break;
        case 'salesQty':
          aValue = getSalesQtyForProduct(a, 1);
          bValue = getSalesQtyForProduct(b, 1);
          break;
        case 'currentStock':
          aValue = a.quantity_on_hand;
          bValue = b.quantity_on_hand;
          break;
        case 'ratio':
          const aSalesQty = getSalesQtyForProduct(a, 1);
          const bSalesQty = getSalesQtyForProduct(b, 1);
          aValue = aSalesQty > 0 ? a.quantity_on_hand / aSalesQty : 999;
          bValue = bSalesQty > 0 ? b.quantity_on_hand / bSalesQty : 999;
          
          // If ratios are equal and we're sorting by ratio in ascending order in products-only view,
          // sort by secondary criteria
          if (aValue === bValue && nextMonthSortDirection === 'asc' && !showCategorized && secondarySortColumn) {
            let aSecondaryValue: any, bSecondaryValue: any;
            
            switch (secondarySortColumn) {
              case 'salesQty':
                aSecondaryValue = getSalesQtyForProduct(a, 1);
                bSecondaryValue = getSalesQtyForProduct(b, 1);
                return bSecondaryValue - aSecondaryValue; // Higher sales qty first
              case 'currentStock':
                aSecondaryValue = a.quantity_on_hand;
                bSecondaryValue = b.quantity_on_hand;
                return bSecondaryValue - aSecondaryValue; // Higher stock first
              case 'incoming':
                aSecondaryValue = getPendingIncomingForProduct(a);
                bSecondaryValue = getPendingIncomingForProduct(b);
                return bSecondaryValue - aSecondaryValue; // Higher incoming first
              case 'product':
                aSecondaryValue = a.product_name.toLowerCase();
                bSecondaryValue = b.product_name.toLowerCase();
                return aSecondaryValue < bSecondaryValue ? -1 : aSecondaryValue > bSecondaryValue ? 1 : 0; // Alphabetical
              default:
                return 0;
            }
          }
          break;
        case 'incoming':
          aValue = getPendingIncomingForProduct(a);
          bValue = getPendingIncomingForProduct(b);
          break;
        case 'urgent':
          const aUrgent = Math.max(0, getSalesQtyForProduct(a, 1) - a.quantity_on_hand);
          const bUrgent = Math.max(0, getSalesQtyForProduct(b, 1) - b.quantity_on_hand);
          aValue = aUrgent;
          bValue = bUrgent;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return nextMonthSortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return nextMonthSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };
  // Group purchases by supplier, only include POs with pending_qty > 0
  const supplierGroups = React.useMemo(() => {
    const groups: { [supplier: string]: PurchaseData[] } = {};
    const relevantPurchases = (filteredPurchases.length > 0 ? filteredPurchases : purchaseData).filter(p => (p.pending_qty || 0) > 0);
    relevantPurchases.forEach((purchase) => {
      const supplier = purchase.partner_name || 'Unknown Supplier';
      if (!groups[supplier]) groups[supplier] = [];
      groups[supplier].push(purchase);
    });
    return groups;
  }, [filteredPurchases, purchaseData, filteredPurchases.length]);

  const [expandedSuppliers, setExpandedSuppliers] = React.useState<{ [supplier: string]: boolean }>({});
  const toggleSupplierExpansion = (supplier: string) => {
    setExpandedSuppliers(prev => ({ ...prev, [supplier]: !prev[supplier] }));
  };

  // Function to toggle hold status
  const toggleHoldStatus = async (purchase: PurchaseData) => {
    try {
      const isCurrentlyOnHold = purchase.is_on_hold;
      
      if (isCurrentlyOnHold) {
        // Remove hold
        const { error } = await supabase
          .from('purchase_holds')
          .delete()
          .eq('purchase_id', purchase.name);
        
        if (error) throw error;
        
        toast({
          title: "Hold Removed",
          description: `PO ${purchase.name} is no longer on hold`,
        });
      } else {
        // Add hold (no expiration date needed)
        const { error } = await supabase
          .from('purchase_holds')
          .insert({
            purchase_id: purchase.name,
            held_until: '9999-12-31' // Far future date to satisfy NOT NULL constraint
          });
        
        if (error) throw error;
        
        toast({
          title: "Hold Applied",
          description: `PO ${purchase.name} has been put on hold`,
        });
      }
      
      // Reload data to update the UI
      await loadData();
    } catch (error) {
      console.error('Error toggling hold status:', error);
      toast({
        title: "Error",
        description: "Failed to toggle hold status: " + (error as Error).message,
        variant: "destructive",
      });
    }
  };

  // Helper to calculate sum of pending for a product (excluding held POs)
  function getPendingIncomingForProduct(product: InventoryData): number {
    let sum = 0;
    purchaseData.forEach(po => {
      // Skip if PO is on hold
      if (po.is_on_hold) return;
      
      if (po.order_lines) {
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
  }

  // Helper to calculate sales quantity (invoiced) for the same months in the previous year as the selected period
  function getSalesQtyForProduct(product: InventoryData, months: number): number {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); // 0-based
    // For planning, look at the same months in the previous year, but shifted forward by 1
    // Example: if today is 2025/05 and months=3, get 2024/06, 2024/07, 2024/08
    const previousYear = currentYear - 1;
    const startMonth = (currentMonth + 1) % 12; // Next month
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
  }

  // Add Collapse All button and PO search box above tables
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center space-x-2">
      <Button size="sm" variant="outline" onClick={() => {
        setCategoryAnalysis(prev => prev.map(cat => ({ ...cat, expanded: false })));
        setExpandedIncoming({});
      }}>
        Collapse All
      </Button>
    </div>
    <div className="flex items-center space-x-2">
      <input
        type="text"
        className="border rounded px-2 py-1 text-sm"
        placeholder="Find PO number..."
        value={searchPO}
        onChange={e => setSearchPO(e.target.value)}
        style={{ minWidth: 180 }}
      />
    </div>
  </div>

  // In Supplier Purchase Orders table, filter by searchPO
  const filteredSupplierGroups = React.useMemo(() => {
    if (!searchPO.trim()) return supplierGroups;
    const lower = searchPO.trim().toLowerCase();
    const filtered: typeof supplierGroups = {};
    Object.entries(supplierGroups).forEach(([supplier, purchases]) => {
      const filteredPurchases = purchases.filter(po => po.name && po.name.toLowerCase().includes(lower));
      if (filteredPurchases.length > 0) filtered[supplier] = filteredPurchases;
    });
    return filtered;
  }, [supplierGroups, searchPO]);

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

      {/* Percentage input for 3-month planning */}
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

      {/* Category Search Bar and Hide Dropdown */}
      <div className="flex items-center mb-4 space-x-4">
        <input
          type="text"
          className="border rounded px-2 py-1 text-sm"
          placeholder="Search product category..."
          value={categorySearch}
          onChange={e => setCategorySearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <div className="relative">
          <button
            className="border rounded px-2 py-1 text-sm bg-white"
            onClick={() => setShowHideDropdown(v => !v)}
            type="button"
          >
            Hide categories...
          </button>
          {showHideDropdown && (
            <div className="absolute z-10 bg-white border rounded shadow p-2 mt-1 min-w-[220px] max-h-60 overflow-y-auto" tabIndex={-1} onBlur={() => setShowHideDropdown(false)}>
              {categoryAnalysis.map(cat => (
                <label key={cat.category} className="flex items-center space-x-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hiddenCategories.includes(cat.category)}
                    onChange={e => {
                      if (e.target.checked) {
                        setHiddenCategories(prev => [...prev, cat.category]);
                      } else {
                        setHiddenCategories(prev => prev.filter(c => c !== cat.category));
                      }
                    }}
                  />
                  <span>{cat.category}</span>
                </label>
              ))}
            </div>
          )}
        </div>
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Button size="sm" variant="outline" onClick={() => {
                setCategoryAnalysis(prev => prev.map(cat => ({ ...cat, expanded: false })));
                setExpandedIncoming({});
              }}>
                Collapse All
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                className="border rounded px-2 py-1 text-sm"
                placeholder="Find PO number..."
                value={searchPO}
                onChange={e => setSearchPO(e.target.value)}
                style={{ minWidth: 180 }}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">Supplier</th>
                  <th className="border p-2 text-right"># POs</th>
                  <th className="border p-2 text-right">Total Quantity</th>
                  <th className="border p-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(filteredSupplierGroups).map(([supplier, purchases]) => {
                  const isSupplierExpanded = expandedSuppliers[supplier];
                  const totalQty = purchases.reduce((sum, p) => sum + (p.order_lines ? p.order_lines.reduce((s, l) => s + (l.product_qty || 0), 0) : 0), 0);
                  return (
                    <React.Fragment key={supplier}>
                      <tr className="hover:bg-gray-50 bg-slate-50 font-semibold">
                        <td className="border p-2">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => toggleSupplierExpansion(supplier)}
                              className="p-1 hover:bg-gray-200 rounded"
                            >
                              {isSupplierExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <span>{supplier}</span>
                          </div>
                        </td>
                        <td className="border p-2 text-right">{purchases.length}</td>
                        <td className="border p-2 text-right">{totalQty}</td>
                        <td className="border p-2 text-center">-</td>
                      </tr>
                      {isSupplierExpanded && (
                        <tr>
                          <td colSpan={6} className="border p-2">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-200">
                                  <th className="border p-1 text-left">PO Number</th>
                                  <th className="border p-1 text-right">Received</th>
                                  <th className="border p-1 text-right">Pending</th>
                                  <th className="border p-1 text-center">Expected Date</th>
                                  <th className="border p-1 text-center">Status</th>
                                  <th className="border p-1 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {purchases.map((purchase) => {
                                  const isExpanded = expandedPurchases[purchase.id];
                                  const hasLines = purchase.order_lines && purchase.order_lines.length > 0;
                                  const totalQty = hasLines ? purchase.order_lines.reduce((sum, l) => sum + (l.product_qty || 0), 0) : 0;
                                  return (
                                    <React.Fragment key={purchase.id}>
                                      <tr className={`hover:bg-gray-50 ${purchase.is_on_hold ? 'bg-red-50' : ''}`}>
                                        <td className="border p-1">
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
                                        <td className="border p-1 text-right">{purchase.received_qty || 0}</td>
                                        <td className="border p-1 text-right">
                                          <HoverCard>
                                            <HoverCardTrigger className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded">
                                              {purchase.pending_qty || 0}
                                            </HoverCardTrigger>
                                            <HoverCardContent className="w-80">
                                              <div className="space-y-2">
                                                <h4 className="font-semibold">Order Lines - Pending Quantities</h4>
                                                {hasLines ? (
                                                  <div className="space-y-1">
                                                    {purchase.order_lines.map((line, lineIndex) => {
                                                      const pendingQty = Math.max(0, line.product_qty - line.qty_received);
                                                      return pendingQty > 0 ? (
                                                        <div key={lineIndex} className="flex justify-between text-sm">
                                                          <span className="font-medium">{line.product_name}</span>
                                                          <span className="text-orange-600">{pendingQty}</span>
                                                        </div>
                                                      ) : null;
                                                    })}
                                                  </div>
                                                ) : (
                                                  <p className="text-sm text-gray-500">No pending quantities</p>
                                                )}
                                              </div>
                                            </HoverCardContent>
                                          </HoverCard>
                                        </td>
                                        <td className="border p-1 text-center">{purchase.expected_date || 'TBD'}</td>
                                        <td className="border p-1 text-center">
                                          <Badge variant={purchase.is_on_hold ? 'destructive' : (purchase.state === 'purchase' ? 'default' : 'secondary')}>
                                            {purchase.is_on_hold ? 'On Hold' : (purchase.state === 'purchase' ? 'Active' : purchase.state)}
                                          </Badge>
                                        </td>
                                        <td className="border p-1 text-center">
                                          <Button
                                            size="sm"
                                            variant={purchase.is_on_hold ? "outline" : "destructive"}
                                            onClick={() => toggleHoldStatus(purchase)}
                                          >
                                            {purchase.is_on_hold ? 'Unhold' : 'Hold'}
                                          </Button>
                                        </td>
                                      </tr>
                                      {isExpanded && hasLines && (
                                        <tr className="bg-gray-50">
                                          <td colSpan={6} className="border p-2 pl-8 text-sm">
                                            <div className="font-semibold mb-1">Order Lines (Total Quantity: {totalQty})</div>
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr>
                                                  <th className="border p-1 text-left">Product</th>
                                                  <th className="border p-1 text-right">Ordered Qty</th>
                                                  <th className="border p-1 text-right">Received</th>
                                                  <th className="border p-1 text-right">Pending</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {purchase.order_lines.map((line, lineIndex) => (
                                                  <tr key={`${purchase.id}-line-${lineIndex}`}> 
                                                    <td className="border p-1">{line.product_name}</td>
                                                    <td className="border p-1 text-right">{line.product_qty}</td>
                                                    <td className="border p-1 text-right">{line.qty_received}</td>
                                                    <td className="border p-1 text-right">{Math.max(0, line.product_qty - line.qty_received)}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>{selectedMonths} Month Planning Analysis</span>
            </CardTitle>
            <Button 
              variant="outline" 
              onClick={generateOptimizedPdf}
              className="ml-auto"
            >
              Download PDF
            </Button>
          </div>
          <div className="flex items-center space-x-4 mt-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">
                Filter by Category:
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-48 justify-start">
                    {globalCategoryFilter.length === 0 
                      ? "No categories selected" 
                      : globalCategoryFilter.length === categoryAnalysis.length
                      ? "All categories"
                      : `${globalCategoryFilter.length} categories selected`
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3">
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <div className="flex items-center space-x-2 pb-2 border-b">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const allCategories = categoryAnalysis.map(cat => cat.category);
                          setGlobalCategoryFilter(allCategories);
                        }}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGlobalCategoryFilter([])}
                      >
                        Clear All
                      </Button>
                    </div>
                    {Array.from(new Set(categoryAnalysis.map(cat => cat.category))).sort().map(category => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`three-month-${category}`}
                          checked={globalCategoryFilter.includes(category)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setGlobalCategoryFilter(prev => [...prev, category]);
                            } else {
                              setGlobalCategoryFilter(prev => prev.filter(c => c !== category));
                            }
                          }}
                        />
                        <label
                          htmlFor={`three-month-${category}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {category}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors"
                      onClick={() => handleSort('product')}
                    >
                      <span>Product</span>
                      {getSortIcon('product', sortColumn, sortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-left">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors"
                      onClick={() => handleSort('category')}
                    >
                      <span>Category</span>
                      {getSortIcon('category', sortColumn, sortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-right">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors ml-auto"
                      onClick={() => handleSort('salesQty')}
                    >
                      <span>Sales Quantity (Invoiced)</span>
                      {getSortIcon('salesQty', sortColumn, sortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-right">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors ml-auto"
                      onClick={() => handleSort('totalStock')}
                    >
                      <span>Current Stock</span>
                      {getSortIcon('totalStock', sortColumn, sortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-right">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors ml-auto"
                      onClick={() => handleSort('totalIncoming')}
                    >
                      <span>Incoming</span>
                      {getSortIcon('totalIncoming', sortColumn, sortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-right">Stock + Incoming</th>
                  <th className="border p-2 text-right">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors ml-auto"
                      onClick={() => handleSort('needsPlanning')}
                    >
                      <span>Needs Planning</span>
                      {getSortIcon('needsPlanning', sortColumn, sortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortCategoryAnalysis(categoryAnalysis)
                  .filter(category => category.products && category.products.length > 0)
                  .filter(category =>
                    (categorySearch.trim() === '' || category.category.toLowerCase().includes(categorySearch.trim().toLowerCase())) &&
                    !hiddenCategories.includes(category.category) &&
                    (globalCategoryFilter.length === 0 || globalCategoryFilter.includes(category.category))
                  )
                  .map((category, index) => (
                    <React.Fragment key={category.category}>
                      <tr 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleCategoryExpansion(category.category)}
                      >
                        <td className="border p-2 font-medium" colSpan={2}>
                          {category.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {category.category}
                        </td>
                        <td className="border p-2 text-right">{category.totalSalesQty}</td>
                        <td className="border p-2 text-right">{category.totalStock}</td>
                        <td className="border p-2 text-right">{category.totalIncoming}</td>
                        <td className="border p-2 text-right">{category.totalStock + category.totalIncoming}</td>
                        <td className="border p-2 text-right text-sm">
                          <span className={category.needsPlanning > 0 ? 'text-red-600 font-bold' : ''}>
                            {category.needsPlanning > 0 ? category.needsPlanning : 'OK'}
                          </span>
                        </td>
                        <td className="border p-2 text-center">
                          {!category.expanded && (
                            (() => {
                              // Check if any product in the category needs planning
                              const anyProductNeedsPlanning = category.products.some(product => {
                                const salesQty = getSalesQtyForProduct(product, parseInt(selectedMonths));
                                const availableIncoming = getPendingIncomingForProduct(product);
                                const stockWithIncoming = product.quantity_on_hand + availableIncoming;
                                const needsPlanning = Math.max(0, salesQty - stockWithIncoming);
                                return needsPlanning > 0;
                              });
                              return (
                                <Button
                                  size="sm"
                                  variant={anyProductNeedsPlanning ? "destructive" : "outline"}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setViewCategoryDialog({ open: true, category: category.category });
                                  }}
                                >
                                  View Product
                                </Button>
                              );
                            })()
                          )}
                        </td>
                      </tr>
                      {category.expanded && sortProductsBySize(category.products).map((product) => {
                        const salesQty = Math.round(getSalesQtyForProduct(product, parseInt(selectedMonths)) * (1 + salesQtyPercent / 100));
                        const availableIncoming = getPendingIncomingForProduct(product);
                        const stockWithIncoming = product.quantity_on_hand + availableIncoming;
                        const needsPlanning = Math.max(0, salesQty - stockWithIncoming);
                        const isIncomingExpanded = expandedIncoming[product.id];
                        // Find all purchase order lines (not on hold) for this product
                        const supplierIncomingMap: { [supplier: string]: any[] } = {};
                        purchaseData.forEach(po => {
                          // Skip if PO is on hold
                          if (po.is_on_hold) return;
                          
                          if (po.order_lines) {
                            po.order_lines.forEach(line => {
                              // Normalize product_id for robust matching
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
                                line.product_name &&
                                product.product_name &&
                                line.product_name.toLowerCase().includes(product.product_name.toLowerCase())
                              ) {
                                match = true;
                              }
                              if (match) {
                                const pending = Math.max(0, anyLine.product_qty - anyLine.qty_received);
                                if (pending > 0) {
                                  const supplier = po.partner_name || 'Unknown Supplier';
                                  if (!supplierIncomingMap[supplier]) supplierIncomingMap[supplier] = [];
                                  supplierIncomingMap[supplier].push({
                                    poNumber: po.name,
                                    supplier,
                                    ordered: anyLine.product_qty,
                                    received: anyLine.qty_received,
                                    pending
                                  });
                                }
                              }
                            });
                          }
                        });
                        return (
                          <React.Fragment key={product.id}>
                            <tr className="bg-gray-50">
                              <td className="border p-2 pl-8 text-sm">{product.product_name}</td>
                              <td className="border p-2 text-sm">{product.product_category}</td>
                              <td className="border p-2 text-right text-sm">{salesQty}</td>
                              <td className="border p-2 text-right text-sm">{product.quantity_on_hand}</td>
                              <td className="border p-2 text-right text-sm">
                                {availableIncoming}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="ml-2"
                                  onClick={() => setExpandedIncoming(prev => ({ ...prev, [product.id]: !prev[product.id] }))}
                                >
                                  {isIncomingExpanded ? 'Hide' : 'View'}
                                </Button>
                              </td>
                              <td className="border p-2 text-right text-sm">{stockWithIncoming}</td>
                              <td className="border p-2 text-right text-sm">
                                <span className={needsPlanning > 0 ? 'text-red-600 font-bold' : ''}>
                                  {needsPlanning > 0 ? needsPlanning : 'OK'}
                                </span>
                              </td>
                              <td className="border p-2 text-center text-sm">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setViewCategoryDialog({ open: true, category: category.category });
                                  }}
                                >
                                  View Product
                                </Button>
                              </td>
                            </tr>
                            {isIncomingExpanded && (
                              <tr className="bg-blue-50">
                                <td colSpan={9} className="border p-2 pl-12 text-xs">
                                  <div className="font-semibold mb-1">Incoming Breakdown for {product.product_name} (Supplier-wise):</div>
                                  {Object.entries(supplierIncomingMap)
                                    .filter(([_, lines]) => lines.length > 0)
                                    .map(([supplier, lines]) => (
                                      <div key={supplier} className="mb-2">
                                        <div className="font-semibold">Supplier: {supplier}</div>
                                        <table className="w-full text-xs mb-1">
                                          <thead>
                                            <tr>
                                              <th className="border p-1 text-left">PO Number</th>
                                              <th className="border p-1 text-right">Ordered Qty</th>
                                              <th className="border p-1 text-right">Received</th>
                                              <th className="border p-1 text-right">Pending</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {lines.map((line, idx) => (
                                              <tr key={idx}>
                                                <td className="border p-1">{line.poNumber}</td>
                                                <td className="border p-1 text-right">{line.ordered}</td>
                                                <td className="border p-1 text-right">{line.received}</td>
                                                <td className="border p-1 text-right">{line.pending}</td>
                                              </tr>
                                            ))}
                                            <tr className="font-bold bg-slate-100">
                                              <td className="border p-1 text-right" colSpan={3}>Supplier Total Pending</td>
                                              <td className="border p-1 text-right">{lines.reduce((sum, l) => sum + l.pending, 0)}</td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                    ))}
                                  {Object.values(supplierIncomingMap).flat().length === 0 && (
                                    <div>No incoming purchase orders (not on hold) for this product.</div>
                                  )}
                                  <div className="text-muted-foreground">* Only purchase orders not on hold are included in this calculation.</div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Move the urgent PDF button to just above the Next Month Planning Analysis table */}
      <div className="flex justify-end mb-2">
        <Button variant="destructive" onClick={() => setShowUrgentPdfDialog(true)}>
          View & Download Urgent Priorities PDF
        </Button>
      </div>

      {/* Next Month Planning Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span>Next Month Planning Analysis</span>
          </CardTitle>
          <CardDescription>
            Product-level planning for next month (using previous year's next month sales quantity)
          </CardDescription>
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center space-x-4">
               <div className="flex items-center space-x-2">
                 <label className="text-sm font-medium">
                   Filter by Category:
                 </label>
                 <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-48 justify-start">
                    {globalCategoryFilter.length === 0 
                      ? "No categories selected" 
                      : globalCategoryFilter.length === categoryAnalysis.length
                      ? "All categories"
                      : `${globalCategoryFilter.length} categories selected`
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3">
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <div className="flex items-center space-x-2 pb-2 border-b">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const allCategories = categoryAnalysis.map(cat => cat.category);
                          setGlobalCategoryFilter(allCategories);
                        }}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGlobalCategoryFilter([])}
                      >
                        Clear All
                      </Button>
                    </div>
                    {Array.from(new Set(categoryAnalysis.map(cat => cat.category))).sort().map(category => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`next-month-${category}`}
                          checked={globalCategoryFilter.includes(category)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setGlobalCategoryFilter(prev => [...prev, category]);
                            } else {
                              setGlobalCategoryFilter(prev => prev.filter(c => c !== category));
                            }
                          }}
                        />
                        <label
                          htmlFor={`next-month-${category}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {category}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
                 </Popover>
               </div>
             </div>
            <div className="flex items-center space-x-2">
              <Button
                variant={showCategorized ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCategorized(true)}
                className="flex items-center space-x-1"
              >
                <Grid3X3 className="h-4 w-4" />
                <span>Categorized</span>
              </Button>
              <Button
                variant={!showCategorized ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCategorized(false)}
                className="flex items-center space-x-1"
              >
                <List className="h-4 w-4" />
                <span>Products Only</span>
              </Button>
             </div>
             {!showCategorized && (
               <div className="flex items-center space-x-2 text-sm">
                 <span className="text-muted-foreground">Secondary sort:</span>
                 <Select value={secondarySortColumn} onValueChange={setSecondarySortColumn}>
                   <SelectTrigger className="w-40">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="salesQty">Sales Qty</SelectItem>
                     <SelectItem value="currentStock">Current Stock</SelectItem>
                     <SelectItem value="incoming">Incoming</SelectItem>
                     <SelectItem value="product">Product Name</SelectItem>
                   </SelectContent>
                 </Select>
                 <span className="text-xs text-muted-foreground">(when ties in primary sort)</span>
               </div>
             )}
           </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors"
                      onClick={() => handleNextMonthSort('product')}
                    >
                      <span>Product</span>
                      {getSortIcon('product', nextMonthSortColumn, nextMonthSortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-left">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors"
                      onClick={() => handleNextMonthSort('category')}
                    >
                      <span>Category</span>
                      {getSortIcon('category', nextMonthSortColumn, nextMonthSortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-right">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors ml-auto"
                      onClick={() => handleNextMonthSort('salesQty')}
                    >
                      <span>Sales Quantity (Invoiced)</span>
                      {getSortIcon('salesQty', nextMonthSortColumn, nextMonthSortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-right">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors ml-auto"
                      onClick={() => handleNextMonthSort('currentStock')}
                    >
                      <span>Current Stock</span>
                      {getSortIcon('currentStock', nextMonthSortColumn, nextMonthSortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-right">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors ml-auto"
                      onClick={() => handleNextMonthSort('ratio')}
                    >
                      <span>Stock/Sales Ratio</span>
                      {getSortIcon('ratio', nextMonthSortColumn, nextMonthSortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-right">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors ml-auto"
                      onClick={() => handleNextMonthSort('incoming')}
                    >
                      <span>Incoming</span>
                      {getSortIcon('incoming', nextMonthSortColumn, nextMonthSortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-right">Stock + Incoming</th>
                  <th className="border p-2 text-right">
                    <button 
                      className="flex items-center space-x-1 hover:bg-slate-600 px-2 py-1 rounded transition-colors ml-auto"
                      onClick={() => handleNextMonthSort('urgent')}
                    >
                      <span>Needs Urgent</span>
                      {getSortIcon('urgent', nextMonthSortColumn, nextMonthSortDirection)}
                    </button>
                  </th>
                  <th className="border p-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {showCategorized ? (
                  // Categorized view - show categories with expandable products
                  categoryAnalysis
                    .filter(category => category.products && category.products.length > 0)
                    .filter(category =>
                      (categorySearch.trim() === '' || category.category.toLowerCase().includes(categorySearch.trim().toLowerCase())) &&
                      !hiddenCategories.includes(category.category) &&
                      (globalCategoryFilter.length === 0 || globalCategoryFilter.includes(category.category))
                    )
                    .map((category, index) => (
                    <React.Fragment key={category.category}>
                      <tr 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleCategoryExpansion(category.category)}
                      >
                        <td className="border p-2 font-medium" colSpan={2}>
                          {category.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {category.category}
                        </td>
                        <td className="border p-2 text-right">
                          {category.products.reduce((sum, product) => {
                            const salesQty = getSalesQtyForProduct(product, 1);
                            return sum + salesQty;
                          }, 0)}
                        </td>
                        <td className="border p-2 text-right">{category.totalStock}</td>
                        <td className="border p-2 text-right">-</td>
                        <td className="border p-2 text-right">{category.totalIncoming}</td>
                        <td className="border p-2 text-right">{category.totalStock + category.totalIncoming}</td>
                        <td className="border p-2 text-right">
                          <span className={category.products.some(product => {
                            const salesQty = getSalesQtyForProduct(product, 1);
                            const urgentQty = Math.max(0, salesQty - product.quantity_on_hand);
                            return urgentQty > 0;
                          }) ? 'text-red-600 font-bold' : ''}>
                            {category.products.reduce((sum, product) => {
                              const salesQty = getSalesQtyForProduct(product, 1);
                              const urgentQty = Math.max(0, salesQty - product.quantity_on_hand);
                              return sum + urgentQty;
                            }, 0) > 0 ? category.products.reduce((sum, product) => {
                              const salesQty = getSalesQtyForProduct(product, 1);
                              const urgentQty = Math.max(0, salesQty - product.quantity_on_hand);
                              return sum + urgentQty;
                            }, 0) : 'OK'}
                          </span>
                        </td>
                        <td className="border p-2 text-center">
                          {!category.expanded && (
                            (() => {
                              // Check if any product in the category needs urgent planning
                              const anyProductUrgent = category.products.some(product => {
                                const salesQty = getSalesQtyForProduct(product, 1);
                                const urgentQty = Math.max(0, salesQty - product.quantity_on_hand);
                                return urgentQty > 0;
                              });
                              return (
                                <Button
                                  size="sm"
                                  variant={anyProductUrgent ? "destructive" : "outline"}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setViewCategoryDialog({ open: true, category: category.category });
                                  }}
                                >
                                  View Product
                                </Button>
                              );
                            })()
                          )}
                        </td>
                      </tr>
                      {category.expanded && sortNextMonthProducts(
                        sortProductsBySize(category.products.filter(product => {
                          const salesQty = getSalesQtyForProduct(product, 1);
                          return salesQty > 0 && product.quantity_on_hand < salesQty;
                        }))
                      ).map((product) => {
                        const salesQty = getSalesQtyForProduct(product, 1);
                        const availableIncoming = getPendingIncomingForProduct(product);
                        const stockWithIncoming = product.quantity_on_hand + availableIncoming;
                        const urgentQty = Math.max(0, salesQty - product.quantity_on_hand);
                        const isIncomingExpanded = expandedIncoming[product.id];
                        // Find all purchase order lines (not on hold) for this product
                        const supplierIncomingMap: { [supplier: string]: any[] } = {};
                        purchaseData.forEach(po => {
                          // Skip if PO is on hold
                          if (po.is_on_hold) return;
                          
                          if (po.order_lines) {
                            po.order_lines.forEach(line => {
                              // Normalize product_id for robust matching
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
                                line.product_name &&
                                product.product_name &&
                                line.product_name.toLowerCase().includes(product.product_name.toLowerCase())
                              ) {
                                match = true;
                              }
                              if (match) {
                                const pending = Math.max(0, anyLine.product_qty - anyLine.qty_received);
                                if (pending > 0) {
                                  const supplier = po.partner_name || 'Unknown Supplier';
                                  if (!supplierIncomingMap[supplier]) supplierIncomingMap[supplier] = [];
                                  supplierIncomingMap[supplier].push({
                                    poNumber: po.name,
                                    supplier,
                                    ordered: anyLine.product_qty,
                                    received: anyLine.qty_received,
                                    pending
                                  });
                                }
                              }
                            });
                          }
                        });
                        return (
                          <React.Fragment key={product.id}>
                            <tr className="bg-gray-50">
                              <td className="border p-2 pl-8 text-sm">{product.product_name}</td>
                              <td className="border p-2 text-sm">{product.product_category}</td>
                              <td className="border p-2 text-right text-sm">{salesQty}</td>
                              <td className="border p-2 text-right text-sm">{product.quantity_on_hand}</td>
                              <td className="border p-2 text-right text-sm">
                                <span className={`font-semibold ${salesQty > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                  {salesQty > 0 ? (product.quantity_on_hand / salesQty).toFixed(2) : 'N/A'}
                                </span>
                              </td>
                              <td className="border p-2 text-right text-sm">
                                {availableIncoming}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="ml-2"
                                  onClick={() => setExpandedIncoming(prev => ({ ...prev, [product.id]: !prev[product.id] }))}
                                >
                                  {isIncomingExpanded ? 'Hide' : 'View'}
                                </Button>
                              </td>
                              <td className="border p-2 text-right text-sm">{stockWithIncoming}</td>
                              <td className="border p-2 text-right text-sm">
                                <span className={urgentQty > 0 ? 'text-red-600 font-bold' : ''}>
                                  {urgentQty > 0 ? urgentQty : 'OK'}
                                </span>
                              </td>
                              <td className="border p-2 text-center text-sm">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setViewCategoryDialog({ open: true, category: category.category });
                                  }}
                                >
                                  View Product
                                </Button>
                              </td>
                            </tr>
                            {isIncomingExpanded && (
                              <tr className="bg-blue-50">
                                <td colSpan={10} className="border p-2 pl-12 text-xs">
                                  <div className="font-semibold mb-1">Incoming Breakdown for {product.product_name} (Supplier-wise):</div>
                                  {Object.entries(supplierIncomingMap)
                                    .filter(([_, lines]) => lines.length > 0)
                                    .map(([supplier, lines]) => (
                                      <div key={supplier} className="mb-2">
                                        <div className="font-semibold">Supplier: {supplier}</div>
                                        <table className="w-full text-xs mb-1">
                                          <thead>
                                            <tr>
                                              <th className="border p-1 text-left">PO Number</th>
                                              <th className="border p-1 text-right">Ordered Qty</th>
                                              <th className="border p-1 text-right">Received</th>
                                              <th className="border p-1 text-right">Pending</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {lines.map((line, idx) => (
                                              <tr key={idx}>
                                                <td className="border p-1">{line.poNumber}</td>
                                                <td className="border p-1 text-right">{line.ordered}</td>
                                                <td className="border p-1 text-right">{line.received}</td>
                                                <td className="border p-1 text-right">{line.pending}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ))}
                                  {Object.values(supplierIncomingMap).flat().length === 0 && (
                                    <div>No incoming purchase orders (not on hold) for this product.</div>
                                  )}
                                  <div className="text-muted-foreground">* Only purchase orders not on hold are included in this calculation.</div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  ))
                ) : (
                  // Uncategorized view - show all products directly
                  sortNextMonthProducts(
                    categoryAnalysis
                      .filter(category => category.products && category.products.length > 0)
                      .filter(category =>
                        (categorySearch.trim() === '' || category.category.toLowerCase().includes(categorySearch.trim().toLowerCase())) &&
                        !hiddenCategories.includes(category.category) &&
                        (globalCategoryFilter.length === 0 || globalCategoryFilter.includes(category.category))
                      )
                      .flatMap(category => 
                        category.products.filter(product => {
                          const salesQty = getSalesQtyForProduct(product, 1);
                          return salesQty > 0 && product.quantity_on_hand < salesQty;
                        })
                      )
                  ).map((product) => {
                    const salesQty = getSalesQtyForProduct(product, 1);
                    const availableIncoming = getPendingIncomingForProduct(product);
                    const stockWithIncoming = product.quantity_on_hand + availableIncoming;
                    const urgentQty = Math.max(0, salesQty - product.quantity_on_hand);

                    return (
                      <React.Fragment key={product.id}>
                        <tr className="bg-gray-50">
                          <td className="border p-2 text-sm">{product.product_name}</td>
                          <td className="border p-2 text-sm">{product.product_category}</td>
                          <td className="border p-2 text-right text-sm">{salesQty}</td>
                          <td className="border p-2 text-right text-sm">{product.quantity_on_hand}</td>
                          <td className="border p-2 text-right text-sm">
                            <span className={`font-semibold ${salesQty > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                              {salesQty > 0 ? (product.quantity_on_hand / salesQty).toFixed(2) : 'N/A'}
                            </span>
                          </td>
                          <td className="border p-2 text-right text-sm">
                            {availableIncoming}
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-2"
                              onClick={() => setExpandedIncoming(prev => ({ ...prev, [product.id]: !prev[product.id] }))}
                            >
                              {expandedIncoming[product.id] ? 'Hide' : 'View'}
                            </Button>
                          </td>
                          <td className="border p-2 text-right text-sm">{stockWithIncoming}</td>
                          <td className="border p-2 text-right text-sm">
                            <span className={urgentQty > 0 ? 'text-red-600 font-bold' : ''}>
                              {urgentQty > 0 ? urgentQty : 'OK'}
                            </span>
                          </td>
                          <td className="border p-2 text-center text-sm">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={e => {
                                e.stopPropagation();
                                setViewCategoryDialog({ open: true, category: product.product_category });
                              }}
                            >
                              View Product
                            </Button>
                          </td>
                        </tr>
                        {/* Add incoming details expansion for products-only view */}
                        {expandedIncoming[product.id] && (
                          <tr className="bg-blue-50">
                            <td colSpan={9} className="border p-2 pl-4 text-xs">
                              <div className="font-semibold mb-1">Incoming Breakdown for {product.product_name} (Supplier-wise):</div>
                              {(() => {
                                // Find all purchase order lines (not on hold) for this product
                                const supplierIncomingMap: { [supplier: string]: any[] } = {};
                                purchaseData.forEach(po => {
                                  // Skip if PO is on hold
                                  if (po.is_on_hold) return;
                                  
                                  if (po.order_lines) {
                                    po.order_lines.forEach(line => {
                                      // Normalize product_id for robust matching
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
                                        line.product_name &&
                                        product.product_name &&
                                        line.product_name.toLowerCase().includes(product.product_name.toLowerCase())
                                      ) {
                                        match = true;
                                      }
                                      if (match) {
                                        const pending = Math.max(0, anyLine.product_qty - anyLine.qty_received);
                                        if (pending > 0) {
                                          const supplier = po.partner_name || 'Unknown Supplier';
                                          if (!supplierIncomingMap[supplier]) supplierIncomingMap[supplier] = [];
                                          supplierIncomingMap[supplier].push({
                                            poNumber: po.name,
                                            supplier,
                                            ordered: anyLine.product_qty,
                                            received: anyLine.qty_received,
                                            pending
                                          });
                                        }
                                      }
                                    });
                                  }
                                });
                                return (
                                  <>
                                    {Object.entries(supplierIncomingMap)
                                      .filter(([_, lines]) => lines.length > 0)
                                      .map(([supplier, lines]) => (
                                        <div key={supplier} className="mb-2">
                                          <div className="font-semibold">Supplier: {supplier}</div>
                                          <table className="w-full text-xs mb-1">
                                            <thead>
                                              <tr>
                                                <th className="border p-1 text-left">PO Number</th>
                                                <th className="border p-1 text-right">Ordered Qty</th>
                                                <th className="border p-1 text-right">Received</th>
                                                <th className="border p-1 text-right">Pending</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {lines.map((line, idx) => (
                                                <tr key={idx}>
                                                  <td className="border p-1">{line.poNumber}</td>
                                                  <td className="border p-1 text-right">{line.ordered}</td>
                                                  <td className="border p-1 text-right">{line.received}</td>
                                                  <td className="border p-1 text-right">{line.pending}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ))}
                                    {Object.values(supplierIncomingMap).flat().length === 0 && (
                                      <div>No incoming purchase orders (not on hold) for this product.</div>
                                    )}
                                    <div className="text-muted-foreground">* Only purchase orders not on hold are included in this calculation.</div>
                                  </>
                                );
                              })()}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog for needs planning products in category */}
      <Dialog open={viewCategoryDialog.open} onOpenChange={open => setViewCategoryDialog(v => ({ ...v, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Needs Planning for {viewCategoryDialog.category}</DialogTitle>
          </DialogHeader>
          <div>
            {(() => {
              const cat = categoryAnalysis.find(c => c.category === viewCategoryDialog.category);
              if (!cat) return <div>No data found.</div>;
              const products = cat.products
                .map(product => {
                  const salesQty = getSalesQtyForProduct(product, parseInt(selectedMonths));
                  const availableIncoming = getPendingIncomingForProduct(product);
                  const stockWithIncoming = product.quantity_on_hand + availableIncoming;
                  const needsPlanning = Math.max(0, salesQty - stockWithIncoming);
                  return { ...product, needsPlanning };
                })
                .filter(p => p.needsPlanning > 0);
              if (products.length === 0) return <div>All products are OK in this category.</div>;
              return (
                <table className="w-full text-sm border mt-2">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border p-2 text-left">Product</th>
                      <th className="border p-2 text-right">Needs Planning Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => (
                      <tr key={product.id}>
                        <td className="border p-2">{product.product_name}</td>
                        <td className="border p-2 text-right text-red-600 font-bold">{product.needsPlanning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Dialog for Next Month Urgent Priorities */}
      <Dialog open={showUrgentPdfDialog} onOpenChange={setShowUrgentPdfDialog}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Next Month Urgent Priorities (PDF View)</DialogTitle>
          </DialogHeader>
          <div
            id="urgent-priorities-pdf"
            className="bg-white p-6"
            style={{
              maxWidth: '1200px',
              overflowX: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
          >
            <h2 className="text-2xl font-bold mb-4">Next Month Urgent Priorities</h2>
            {categoryAnalysis.filter(cat => cat.products.some(product => {
              const salesQty = getSalesQtyForProduct(product, 1);
              return salesQty > 0 && product.quantity_on_hand < salesQty;
            })).length === 0 && (
              <div className="text-muted-foreground">No urgent priorities for next month.</div>
            )}
            {categoryAnalysis.filter(cat => cat.products.some(product => {
              const salesQty = getSalesQtyForProduct(product, 1);
              return salesQty > 0 && product.quantity_on_hand < salesQty;
            })).map(cat => (
              <div key={cat.category} className="mb-8">
                <div className="font-bold text-lg mb-2 border-b pb-1">Category: {cat.category}</div>
                <div style={{ overflowX: 'auto' }}>
                  <table
                    className="w-full mb-4"
                    style={{
                      borderCollapse: 'collapse',
                      tableLayout: 'fixed',
                      minWidth: '900px',
                    }}
                  >
                    <thead>
                      <tr className="bg-slate-200">
                        <th className="border p-3 text-left font-bold" style={{ width: '200px' }}>Product Name</th>
                        <th className="border p-3 text-right font-bold" style={{ width: '120px' }}>Current Stock</th>
                        <th className="border p-3 text-right font-bold" style={{ width: '120px' }}>Next Month Sale</th>
                        <th className="border p-3 text-right font-bold" style={{ width: '120px' }}>Priority (Stock/Sale)</th>
                        <th className="border p-3 text-right font-bold" style={{ width: '340px' }}>Incoming Analysis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortProductsBySize(cat.products.filter(product => {
                        const salesQty = getSalesQtyForProduct(product, 1);
                        return salesQty > 0 && product.quantity_on_hand < salesQty;
                      })).map(product => {
                        const salesQty = getSalesQtyForProduct(product, 1);
                        const priority = product.quantity_on_hand / salesQty;
                        const availableIncoming = getPendingIncomingForProduct(product);
                        // Supplier breakdown
                        const supplierIncomingMap: { [supplier: string]: any[] } = {};
                        purchaseData.forEach(po => {
                          // Skip if PO is on hold
                          if (po.is_on_hold) return;
                          
                          if (po.order_lines) {
                            po.order_lines.forEach(line => {
                              // Normalize product_id for robust matching
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
                                line.product_name &&
                                product.product_name &&
                                line.product_name.toLowerCase().includes(product.product_name.toLowerCase())
                              ) {
                                match = true;
                              }
                              if (match) {
                                const pending = Math.max(0, anyLine.product_qty - anyLine.qty_received);
                                if (pending > 0) {
                                  const supplier = po.partner_name || 'Unknown Supplier';
                                  if (!supplierIncomingMap[supplier]) supplierIncomingMap[supplier] = [];
                                  supplierIncomingMap[supplier].push({
                                    poNumber: po.name,
                                    supplier,
                                    ordered: anyLine.product_qty,
                                    received: anyLine.qty_received,
                                    pending
                                  });
                                }
                              }
                            });
                          }
                        });
                        return (
                          <tr key={product.id}>
                            <td className="border p-3">{product.product_name}</td>
                            <td className="border p-3 text-right">{product.quantity_on_hand}</td>
                            <td className="border p-3 text-right">{salesQty}</td>
                            <td className={priority < 1 ? 'border p-3 text-right text-red-600 font-bold' : 'border p-3 text-right'}>
                              {priority.toFixed(2)}
                            </td>
                            <td className="border p-3 text-right">
                              {Object.entries(supplierIncomingMap).length > 0 ? (
                                <div>
                                  {Object.entries(supplierIncomingMap).map(([supplier, lines]) => (
                                    <div key={supplier} className="mb-1">
                                      <div className="font-semibold">{supplier}</div>
                                      <table className="w-full text-xs mb-1">
                                        <thead>
                                          <tr>
                                            <th className="border p-1 text-left">PO Number</th>
                                            <th className="border p-1 text-right">Ordered</th>
                                            <th className="border p-1 text-right">Received</th>
                                            <th className="border p-1 text-right">Pending</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {lines.map((line, idx) => (
                                            <tr key={idx}>
                                              <td className="border p-1">{line.poNumber}</td>
                                              <td className="border p-1 text-right">{line.ordered}</td>
                                              <td className="border p-1 text-right">{line.received}</td>
                                              <td className="border p-1 text-right">{line.pending}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span>No incoming POs</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => downloadElementAsPdf('urgent-priorities-pdf', 'Next_Month_Urgent_Priorities')}>Download PDF</Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* AI Planning Report Tab */}
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <Button 
            onClick={() => setShowAIReport(!showAIReport)}
            variant={showAIReport ? "default" : "outline"}
            className="flex items-center space-x-2"
          >
            <Brain className="h-4 w-4" />
            <span>{showAIReport ? 'Hide' : 'Show'} AI Planning Analysis</span>
          </Button>
        </div>
        
        {showAIReport && <AIInventoryPlanningReport />}
      </div>
    </div>
  );
};

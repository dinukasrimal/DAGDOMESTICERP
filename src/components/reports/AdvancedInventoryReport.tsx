
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Package, AlertTriangle, TrendingUp } from 'lucide-react';
import { supabaseBatchFetch } from '@/lib/utils';
import { InventoryTable } from './InventoryTable';
import { InventoryFilters } from './InventoryFilters';

interface InventoryItem {
  id: string;
  product_name: string;
  product_category: string;
  quantity_on_hand: number;
  quantity_available: number;
  virtual_available: number;
  reorder_min: number;
  reorder_max: number;
  cost: number;
  incoming_qty: number;
  outgoing_qty: number;
}

interface PurchaseItem {
  id: string;
  name: string;
  partner_name: string;
  date_order: string;
  amount_total: number;
  state: string;
  received_qty: number;
  pending_qty: number;
  expected_date: string;
  order_lines: Array<{
    product_name: string;
    qty_ordered: number;
    qty_received: number;
    price_unit: number;
    product_category: string;
  }>;
}

export const AdvancedInventoryReport: React.FC = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

  // Memoized filtered data
  const filteredInventoryData = useMemo(() => {
    return inventoryData.filter(item => {
      const matchesSearch = !searchTerm || 
        item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product_category?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = !selectedCategory || 
        item.product_category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [inventoryData, searchTerm, selectedCategory]);

  // Memoized categories
  const categories = useMemo(() => {
    const uniqueCategories = new Set(inventoryData.map(item => item.product_category).filter(Boolean));
    return Array.from(uniqueCategories).sort();
  }, [inventoryData]);

  // Memoized statistics
  const inventoryStats = useMemo(() => {
    const totalValue = filteredInventoryData.reduce((sum, item) => 
      sum + ((item.quantity_on_hand || 0) * (item.cost || 0)), 0
    );
    
    const lowStockItems = filteredInventoryData.filter(item => 
      (item.quantity_on_hand || 0) < (item.reorder_min || 0)
    ).length;

    const outOfStockItems = filteredInventoryData.filter(item => 
      (item.quantity_on_hand || 0) === 0
    ).length;

    const totalProducts = filteredInventoryData.length;

    return { totalValue, lowStockItems, outOfStockItems, totalProducts };
  }, [filteredInventoryData]);

  const fetchInventoryData = useCallback(async () => {
    try {
      console.log('Fetching inventory data...');
      const data = await supabaseBatchFetch('inventory', 'id', 1000);
      
      if (data && data.length > 0) {
        const transformedData: InventoryItem[] = data.map(item => ({
          id: item.id || '',
          product_name: item.product_name || '',
          product_category: item.product_category || 'Uncategorized',
          quantity_on_hand: Number(item.quantity_on_hand) || 0,
          quantity_available: Number(item.quantity_available) || 0,
          virtual_available: Number(item.virtual_available) || 0,
          reorder_min: Number(item.reorder_min) || 0,
          reorder_max: Number(item.reorder_max) || 0,
          cost: Number(item.cost) || 0,
          incoming_qty: Number(item.incoming_qty) || 0,
          outgoing_qty: Number(item.outgoing_qty) || 0,
        }));
        
        setInventoryData(transformedData);
        console.log(`Loaded ${transformedData.length} inventory items`);
      }
    } catch (error) {
      console.error('Error fetching inventory data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch inventory data",
        variant: "destructive",
      });
    }
  }, [toast]);

  const fetchPurchaseData = useCallback(async () => {
    try {
      console.log('Fetching purchase data...');
      const data = await supabaseBatchFetch('purchases', 'date_order', 1000);
      
      if (data && data.length > 0) {
        const transformedData: PurchaseItem[] = data.map(purchase => ({
          id: purchase.id || '',
          name: purchase.name || '',
          partner_name: purchase.partner_name || '',
          date_order: purchase.date_order || '',
          amount_total: Number(purchase.amount_total) || 0,
          state: purchase.state || '',
          received_qty: Number(purchase.received_qty) || 0,
          pending_qty: Number(purchase.pending_qty) || 0,
          expected_date: purchase.expected_date || '',
          order_lines: Array.isArray(purchase.order_lines) ? purchase.order_lines : []
        }));
        
        setPurchaseData(transformedData);
        console.log(`Loaded ${transformedData.length} purchase orders`);
      }
    } catch (error) {
      console.error('Error fetching purchase data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch purchase data",
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchInventoryData(), fetchPurchaseData()]);
      setIsLoading(false);
    };
    
    loadData();
  }, [fetchInventoryData, fetchPurchaseData]);

  // Optimized handlers with useCallback
  const handleToggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  }, []);

  const handleToggleVisibility = useCallback((category: string) => {
    setHiddenCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedCategories(new Set(categories));
  }, [categories]);

  const handleCollapseAll = useCallback(() => {
    setExpandedCategories(new Set());
  }, []);

  const handleShowAll = useCallback(() => {
    setHiddenCategories(new Set());
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        <span>Loading inventory data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Package className="mr-2 h-4 w-4" />
              Total Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inventoryStats.totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <TrendingUp className="mr-2 h-4 w-4" />
              Total Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">LKR {inventoryStats.totalValue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <AlertTriangle className="mr-2 h-4 w-4 text-orange-500" />
              Low Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{inventoryStats.lowStockItems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <AlertTriangle className="mr-2 h-4 w-4 text-red-500" />
              Out of Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{inventoryStats.outOfStockItems}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <InventoryFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categories}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onShowAll={handleShowAll}
      />

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Overview</CardTitle>
          <CardDescription>
            Detailed inventory analysis with supplier tracking and purchase planning
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InventoryTable
            data={filteredInventoryData}
            expandedCategories={expandedCategories}
            hiddenCategories={hiddenCategories}
            onToggleCategory={handleToggleCategory}
            onToggleVisibility={handleToggleVisibility}
          />
        </CardContent>
      </Card>
    </div>
  );
};

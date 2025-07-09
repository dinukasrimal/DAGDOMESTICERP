import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Brain, 
  AlertTriangle, 
  TrendingUp, 
  Package, 
  Phone,
  Calendar,
  Loader2
} from 'lucide-react';

interface InventoryData {
  id: string;
  product_name: string;
  product_category: string;
  quantity_on_hand: number;
  quantity_available: number;
  location: string;
}

interface SalesData {
  product_name: string;
  total_qty_sold: number;
  avg_monthly_sales: number;
}

interface PurchaseData {
  id: string;
  name: string;
  partner_name: string;
  state: string;
  expected_date: string;
  order_lines?: Array<{
    product_name: string;
    qty_ordered: number;
    qty_received: number;
  }>;
}

interface AIAnalysisResult {
  category: string;
  currentStock: number;
  monthlySales: number;
  priorityRatio: number;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  supplierInfo: {
    supplier: string;
    poNumber: string;
    expectedDate: string;
    status: string;
  }[];
  recommendation: string;
}

const EXCLUDED_CATEGORIES = [
  'apex', 'boxer junior', 'cozifit', 'finished good', 'other', 
  'tween huger', 'raw materials', 'raw materials / deliveries', 
  'odel', 'other suppliers', 'other suppliers / lee vee'
];

export const AIInventoryPlanningReport: React.FC = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [inventoryData, setInventoryData] = useState<InventoryData[]>([]);
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseData[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult[]>([]);

  const fetchInventoryData = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .not('product_category', 'in', `(${EXCLUDED_CATEGORIES.map(cat => `"${cat}"`).join(',')})`);
      
      if (error) throw error;
      
      const transformed = data?.map(item => ({
        id: item.id,
        product_name: item.product_name || '',
        product_category: item.product_category || '',
        quantity_on_hand: item.quantity_on_hand || 0,
        quantity_available: item.quantity_available || 0,
        location: item.location || ''
      })) || [];
      
      setInventoryData(transformed);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    }
  };

  const fetchSalesData = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('order_lines, date_order')
        .gte('date_order', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      
      if (error) throw error;
      
      const salesMap = new Map<string, { totalQty: number, months: Set<string> }>();
      
      data?.forEach(invoice => {
        if (invoice.order_lines && Array.isArray(invoice.order_lines)) {
          const month = new Date(invoice.date_order).toISOString().slice(0, 7);
          
          invoice.order_lines.forEach((line: any) => {
            if (line.product_name && line.qty_delivered) {
              const existing = salesMap.get(line.product_name) || { totalQty: 0, months: new Set() };
              existing.totalQty += line.qty_delivered;
              existing.months.add(month);
              salesMap.set(line.product_name, existing);
            }
          });
        }
      });
      
      const salesDataArray: SalesData[] = Array.from(salesMap.entries()).map(([productName, data]) => ({
        product_name: productName,
        total_qty_sold: data.totalQty,
        avg_monthly_sales: data.totalQty / Math.max(data.months.size, 1)
      }));
      
      setSalesData(salesDataArray);
    } catch (error) {
      console.error('Error fetching sales data:', error);
    }
  };

  const fetchPurchaseData = async () => {
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select('*');
      
      if (error) throw error;
      
      const transformed = data?.map(item => ({
        id: item.id,
        name: item.name || '',
        partner_name: item.partner_name || '',
        state: item.state || '',
        expected_date: item.expected_date || '',
        order_lines: item.order_lines as any[]
      })) || [];
      
      setPurchaseData(transformed);
    } catch (error) {
      console.error('Error fetching purchase data:', error);
    }
  };


  const generateAIAnalysis = async () => {
    setIsGenerating(true);
    
    try {
      // Group inventory by product category
      const categoryMap = new Map<string, InventoryData[]>();
      
      inventoryData.forEach(item => {
        const category = item.product_category || 'uncategorized';
        if (!categoryMap.has(category)) {
          categoryMap.set(category, []);
        }
        categoryMap.get(category)!.push(item);
      });

      const analysisResults: AIAnalysisResult[] = [];

      for (const [category, products] of categoryMap.entries()) {
        const totalStock = products.reduce((sum, p) => sum + p.quantity_available, 0);
        
        // Get sales data for products in this category
        const categorySales = salesData.filter(s => {
          // Find inventory item with same product name to get its category
          const inventoryItem = inventoryData.find(inv => inv.product_name === s.product_name);
          return inventoryItem?.product_category === category;
        });
        const avgMonthlySales = categorySales.reduce((sum, s) => sum + s.avg_monthly_sales, 0);
        
        // Calculate priority ratio: stock/sales (lower = higher priority)
        const priorityRatio = avgMonthlySales > 0 ? totalStock / avgMonthlySales : 999;
        
        // Find relevant purchase orders for this category
        const relevantPOs = purchaseData.filter(po => 
          po.order_lines?.some(line => {
            // Find inventory item with same product name to get its category
            const inventoryItem = inventoryData.find(inv => inv.product_name === line.product_name);
            return inventoryItem?.product_category === category;
          })
        );

        const supplierInfo = relevantPOs.map(po => ({
          supplier: po.partner_name,
          poNumber: po.name,
          expectedDate: po.expected_date,
          status: po.state
        }));

        let urgencyLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
        let recommendation = '';

        // Determine urgency based on priority ratio
        if (priorityRatio < 0.5) {
          urgencyLevel = 'critical';
          recommendation = `URGENT: Only ${Math.round(priorityRatio * 30)} days of stock remaining. Contact suppliers immediately.`;
        } else if (priorityRatio < 1) {
          urgencyLevel = 'high';
          recommendation = `High priority: Stock will run out within a month. Expedite production.`;
        } else if (priorityRatio < 2) {
          urgencyLevel = 'medium';
          recommendation = `Monitor closely. Plan additional orders within 2 weeks.`;
        } else {
          urgencyLevel = 'low';
          recommendation = `Stock levels adequate for ${Math.round(priorityRatio)} months.`;
        }

        analysisResults.push({
          category,
          currentStock: totalStock,
          monthlySales: Math.round(avgMonthlySales),
          priorityRatio: Math.round(priorityRatio * 100) / 100,
          urgencyLevel,
          supplierInfo,
          recommendation
        });
      }

      // Sort by priority ratio (lowest first = highest priority)
      analysisResults.sort((a, b) => a.priorityRatio - b.priorityRatio);

      setAiAnalysis(analysisResults);
      
      toast({
        title: "AI Analysis Complete",
        description: `Generated planning report for ${analysisResults.length} categories`,
      });
      
    } catch (error) {
      console.error('Error generating AI analysis:', error);
      toast({
        title: "Error",
        description: "Failed to generate AI analysis",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();
    fetchSalesData();
    fetchPurchaseData();
  }, []);

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getUrgencyIcon = (level: string) => {
    switch (level) {
      case 'critical': return <AlertTriangle className="h-4 w-4" />;
      case 'high': return <TrendingUp className="h-4 w-4" />;
      case 'medium': return <Calendar className="h-4 w-4" />;
      case 'low': return <Package className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Brain className="h-6 w-6 text-blue-600" />
            <span>AI-Powered Next Month Planning Analysis</span>
          </CardTitle>
          <CardDescription>
            Intelligent analysis of inventory needs vs. sales projections with supplier recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={generateAIAnalysis} 
            disabled={isGenerating}
            className="w-full sm:w-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Analysis...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                Generate AI Planning Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {aiAnalysis.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Planning Analysis Results</CardTitle>
            <CardDescription>
              Categories requiring immediate attention are listed first
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Monthly Sales</TableHead>
                    <TableHead>Priority Ratio</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Suppliers</TableHead>
                    <TableHead>Recommendation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiAnalysis.map((analysis, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {analysis.category}
                      </TableCell>
                      <TableCell>{analysis.currentStock}</TableCell>
                      <TableCell>{analysis.monthlySales}</TableCell>
                      <TableCell>
                        <span className={`font-semibold ${analysis.priorityRatio < 1 ? 'text-red-600' : analysis.priorityRatio < 2 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {analysis.priorityRatio}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getUrgencyColor(analysis.urgencyLevel)} flex items-center space-x-1`}>
                          {getUrgencyIcon(analysis.urgencyLevel)}
                          <span className="capitalize">{analysis.urgencyLevel}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {analysis.supplierInfo.length > 0 ? (
                            analysis.supplierInfo.map((supplier, idx) => (
                              <div key={idx} className="text-sm">
                                <div className="flex items-center space-x-1">
                                  <Phone className="h-3 w-3" />
                                  <span className="font-medium">{supplier.supplier}</span>
                                </div>
                                <div className="text-muted-foreground">
                                  PO: {supplier.poNumber}
                                </div>
                                <div className="text-muted-foreground">
                                  Due: {supplier.expectedDate || 'TBD'}
                                </div>
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground">No active POs</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="text-sm">
                          {analysis.recommendation}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
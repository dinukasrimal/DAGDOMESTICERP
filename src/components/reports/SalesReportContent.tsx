import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Package, X, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getTargetsForAnalytics, calculateTargetVsActual, TargetData } from '@/services/targetService';

interface SalesData {
  id: string;
  name: string;
  partner_name: string;
  date_order: string;
  amount_total: number;
  state: string;
  order_lines?: Array<{
    product_name: string;
    qty_delivered: number;
    price_unit: number;
    price_subtotal: number;
    product_category: string;
  }>;
}

interface SalesReportContentProps {
  salesData: SalesData[];
}

export const SalesReportContent: React.FC<SalesReportContentProps> = ({ salesData }) => {
  const [selectedYear, setSelectedYear] = useState('2025');
  const [selectedMonths, setSelectedMonths] = useState<string[]>(['all']);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>(['all']);
  const [showValues, setShowValues] = useState(false);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [targetData, setTargetData] = useState<TargetData[]>([]);
  const [showTargetComparison, setShowTargetComparison] = useState(false);
  const [targetMonths, setTargetMonths] = useState<string[]>(['all']);

  // Get available years from data
  const availableYears = [...new Set(salesData.map(item => 
    new Date(item.date_order).getFullYear().toString()
  ))].sort((a, b) => b.localeCompare(a));

  // Helper function to get quantity from invoice - FIXED to properly handle order_lines
  const getInvoiceQuantity = (invoice: SalesData): number => {
    if (invoice.order_lines && Array.isArray(invoice.order_lines) && invoice.order_lines.length > 0) {
      const total = invoice.order_lines.reduce((sum, line) => {
        // Make sure we're getting the quantity properly
        const qty = Number(line.qty_delivered) || 0;
        console.log(`Invoice ${invoice.name}: Line qty_delivered = ${line.qty_delivered}, parsed = ${qty}`);
        return sum + qty;
      }, 0);
      console.log(`Invoice ${invoice.name}: Total quantity = ${total}`);
      return total;
    }
    console.log(`Invoice ${invoice.name}: No order lines, defaulting to 1`);
    return 1; // Default to 1 if no order lines
  };

  // Helper to extract code in brackets from product_name
  function extractCodeFromBrackets(name: string): string | null {
    const match = name.match(/\[(.*?)\]/);
    return match ? match[1].trim() : null;
  }

  // Get unique product categories from products table based on codes in order lines
  const productCategories = ['all', ...Array.from(new Set(
    salesData.flatMap(item =>
      (item.order_lines || []).map(line => {
        if (!line.product_name) return 'Uncategorized';
        const code = extractCodeFromBrackets(line.product_name);
        const found = code && products.find(p => p.default_code === code);
        return found ? found.product_category || 'Uncategorized' : 'Uncategorized';
      })
    )
  )).sort()];

  // Filter data based on selections, including category
  const filteredData = salesData.filter(item => {
    const orderDate = new Date(item.date_order);
    const year = orderDate.getFullYear().toString();
    const month = orderDate.getMonth() + 1;
    if (selectedYear !== 'all' && year !== selectedYear) return false;
    if (!selectedMonths.includes('all') && !selectedMonths.includes(month.toString())) return false;
    if (!selectedCustomers.includes('all') && !selectedCustomers.includes(item.partner_name)) return false;
    if (selectedCategory !== 'all') {
      // Only include if at least one order line matches the selected category
      if (!item.order_lines || !item.order_lines.some(line => {
        if (!line.product_name) return false;
        const code = extractCodeFromBrackets(line.product_name);
        const found = code && products.find(p => p.default_code === code);
        return found ? (found.product_category || 'Uncategorized') === selectedCategory : 'Uncategorized' === selectedCategory;
      })) return false;
    }
    return true;
  });

  console.log(`Filtered data: ${filteredData.length} invoices for year ${selectedYear}, months ${selectedMonths.join(', ')}`);

  // Calculate total quantity and value
  const totalQuantity = filteredData.reduce((sum, item) => {
    const qty = getInvoiceQuantity(item);
    return sum + qty;
  }, 0);

  const totalValue = filteredData.reduce((sum, item) => sum + item.amount_total, 0);

  console.log(`Totals: Quantity = ${totalQuantity}, Value = ${totalValue}`);

  // Previous year comparison - FIXED calculation
  const previousYear = (parseInt(selectedYear) - 1).toString();
  const previousYearData = salesData.filter(item => {
    const orderDate = new Date(item.date_order);
    const year = orderDate.getFullYear().toString();
    const month = orderDate.getMonth() + 1;
    
    if (year !== previousYear) return false;
    if (!selectedMonths.includes('all') && !selectedMonths.includes(month.toString())) return false;
    if (!selectedCustomers.includes('all') && !selectedCustomers.includes(item.partner_name)) return false;
    
    return true;
  });

  console.log(`Previous year data: ${previousYearData.length} invoices for year ${previousYear}`);

  const previousYearQuantity = previousYearData.reduce((sum, item) => {
    return sum + getInvoiceQuantity(item);
  }, 0);

  const previousYearValue = previousYearData.reduce((sum, item) => sum + item.amount_total, 0);

  console.log(`Previous year totals: Quantity = ${previousYearQuantity}, Value = ${previousYearValue}`);

  const quantityGrowth = previousYearQuantity > 0 
    ? ((totalQuantity - previousYearQuantity) / previousYearQuantity * 100).toFixed(1)
    : totalQuantity > 0 ? '100' : '0';

  const valueGrowth = previousYearValue > 0 
    ? ((totalValue - previousYearValue) / previousYearValue * 100).toFixed(1)
    : totalValue > 0 ? '100' : '0';

  // Customer data aggregation with previous year
  const customerData = filteredData.reduce((acc, item) => {
    const customer = item.partner_name;
    if (!acc[customer]) {
      acc[customer] = { quantity: 0, value: 0 };
    }
    acc[customer].quantity += getInvoiceQuantity(item);
    acc[customer].value += item.amount_total;
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const customerPreviousData = previousYearData.reduce((acc, item) => {
    const customer = item.partner_name;
    if (!acc[customer]) {
      acc[customer] = { quantity: 0, value: 0 };
    }
    acc[customer].quantity += getInvoiceQuantity(item);
    acc[customer].value += item.amount_total;
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const customerChartData = Object.entries(customerData)
    .map(([customer, data]) => ({
      customer: customer.length > 15 ? customer.substring(0, 15) + '...' : customer,
      current: showValues ? data.value : data.quantity,
      previous: showValues ? (customerPreviousData[customer]?.value || 0) : (customerPreviousData[customer]?.quantity || 0),
      avgPrice: data.quantity > 0 ? Math.round(data.value / data.quantity) : 0
    }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 10);

  // Monthly data aggregation - FIXED
  const monthlyData = filteredData.reduce((acc, item) => {
    const date = new Date(item.date_order);
    const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
    if (!acc[monthKey]) {
      acc[monthKey] = { quantity: 0, value: 0 };
    }
    acc[monthKey].quantity += getInvoiceQuantity(item);
    acc[monthKey].value += item.amount_total;
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const monthlyPreviousData = previousYearData.reduce((acc, item) => {
    const date = new Date(item.date_order);
    const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
    if (!acc[monthKey]) {
      acc[monthKey] = { quantity: 0, value: 0 };
    }
    acc[monthKey].quantity += getInvoiceQuantity(item);
    acc[monthKey].value += item.amount_total;
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const monthlyChartData = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    .map(month => ({
      month,
      current: showValues ? (monthlyData[month]?.value || 0) : (monthlyData[month]?.quantity || 0),
      previous: showValues ? (monthlyPreviousData[month]?.value || 0) : (monthlyPreviousData[month]?.quantity || 0),
      variance: 0
    }));

  // Get unique customers for filter
  const customers = [...new Set(salesData.map(item => item.partner_name))].sort();

  const chartConfig = {
    current: {
      label: `Current Year (${selectedYear})`,
      color: "hsl(var(--chart-1))",
    },
    previous: {
      label: `Previous Year (${previousYear})`,
      color: "hsl(var(--chart-2))",
    }
  };

  // Fetch products table on mount
  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await (supabase as any).from('products').select('*');
      if (error) {
        console.error('Failed to fetch products:', error);
      } else {
        setProducts(data || []);
      }
    };
    fetchProducts();
  }, []);

  // Fetch target data when filters change
  useEffect(() => {
    const fetchTargets = async () => {
      const targets = await getTargetsForAnalytics(
        selectedYear === 'all' ? undefined : selectedYear,
        targetMonths.includes('all') ? undefined : targetMonths
      );
      setTargetData(targets);
    };

    if (selectedYear !== 'all' || !targetMonths.includes('all')) {
      fetchTargets();
    } else {
      setTargetData([]);
    }
  }, [selectedYear, targetMonths]);

  // Build a map of product_id to product info for fast lookup
  const productMap: Record<string, any> = {};
  products.forEach(prod => {
    if (prod.id) productMap[String(prod.id)] = prod;
  });

  // --- Product Category Sales Aggregation ---
  // Build a map: category -> { current: qty, previous: qty } for the selected month only
  const productCategoryMap: Record<string, { current: number; previous: number }> = {};
  salesData.forEach(item => {
    if (item.order_lines && Array.isArray(item.order_lines)) {
      const orderDate = new Date(item.date_order);
      const year = orderDate.getFullYear().toString();
      const month = orderDate.getMonth() + 1;
      if (selectedMonths.includes('all')) return;
      if (!selectedMonths.includes(month.toString())) return;
      item.order_lines.forEach(line => {
        let category = 'Uncategorized';
        if (line.product_name) {
          const code = extractCodeFromBrackets(line.product_name);
          const found = code && products.find(p => p.default_code === code);
          if (found) category = found.product_category || 'Uncategorized';
        }
        const qty = Number(line.qty_delivered) || 0;
        if (!productCategoryMap[category]) productCategoryMap[category] = { current: 0, previous: 0 };
        if (year === selectedYear) productCategoryMap[category].current += qty;
        if (year === previousYear) productCategoryMap[category].previous += qty;
      });
    }
  });
  // Get all categories that had sales in either year for the selected month
  const allCategories = Object.keys(productCategoryMap);
  // Top 10 by current year sales (for selected month)
  const top10 = allCategories
    .sort((a, b) => (productCategoryMap[b].current - productCategoryMap[a].current))
    .slice(0, 10);
  // Chart data: always show both years for each top 10 category
  const productCategoryChartData = top10.map(cat => {
    const current = productCategoryMap[cat]?.current || 0;
    const previous = productCategoryMap[cat]?.previous || 0;
    console.log(`[ProductCategoryChart] ${cat}: current=${current}, previous=${previous}, months=${selectedMonths.join(', ')}`);
    return {
      category: cat,
      current,
      previous
    };
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter:</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Month</label>
              <div className="space-y-2">
                <Select value="" onValueChange={(value) => {
                  if (value === 'all') {
                    setSelectedMonths(['all']);
                  } else {
                    setSelectedMonths(prev => {
                      const filtered = prev.filter(m => m !== 'all');
                      return filtered.includes(value) ? filtered.filter(m => m !== value) : [...filtered, value];
                    });
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select months..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    {Array.from({length: 12}, (_, i) => (
                      <SelectItem key={i+1} value={(i+1).toString()}>
                        {new Date(2000, i).toLocaleDateString('en-US', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedMonths.length > 0 && !selectedMonths.includes('all') && (
                  <div className="flex flex-wrap gap-1">
                    {selectedMonths.map(month => (
                      <Badge key={month} variant="secondary" className="text-xs">
                        {new Date(2000, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short' })}
                        <X 
                          className="h-3 w-3 ml-1 cursor-pointer" 
                          onClick={() => setSelectedMonths(prev => prev.filter(m => m !== month))}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Customer</label>
              <div className="space-y-2">
                <Select value="" onValueChange={(value) => {
                  if (value === 'all') {
                    setSelectedCustomers(['all']);
                  } else {
                    setSelectedCustomers(prev => {
                      const filtered = prev.filter(c => c !== 'all');
                      return filtered.includes(value) ? filtered.filter(c => c !== value) : [...filtered, value];
                    });
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customers..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.map(customer => (
                      <SelectItem key={customer} value={customer}>{customer}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCustomers.length > 0 && !selectedCustomers.includes('all') && (
                  <div className="flex flex-wrap gap-1">
                    {selectedCustomers.map(customer => (
                      <Badge key={customer} variant="secondary" className="text-xs">
                        {customer.length > 20 ? customer.substring(0, 20) + '...' : customer}
                        <X 
                          className="h-3 w-3 ml-1 cursor-pointer" 
                          onClick={() => setSelectedCustomers(prev => prev.filter(c => c !== customer))}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Target Months</label>
              <div className="space-y-2">
                <Select value="" onValueChange={(value) => {
                  if (value === 'all') {
                    setTargetMonths(['all']);
                  } else {
                    setTargetMonths(prev => {
                      const filtered = prev.filter(m => m !== 'all');
                      return filtered.includes(value) ? filtered.filter(m => m !== value) : [...filtered, value];
                    });
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target months..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    {Array.from({length: 12}, (_, i) => (
                      <SelectItem key={i+1} value={(i+1).toString()}>
                        {new Date(2000, i).toLocaleDateString('en-US', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {targetMonths.length > 0 && !targetMonths.includes('all') && (
                  <div className="flex flex-wrap gap-1">
                    {targetMonths.map(month => (
                      <Badge key={month} variant="secondary" className="text-xs">
                        {new Date(2000, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short' })}
                        <X 
                          className="h-3 w-3 ml-1 cursor-pointer" 
                          onClick={() => setTargetMonths(prev => prev.filter(m => m !== month))}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Display</label>
              <Button 
                onClick={() => setShowValues(!showValues)}
                variant={showValues ? "default" : "outline"}
                className="w-full"
              >
                {showValues ? "Values (LKR)" : "Quantity"}
              </Button>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {productCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Target Comparison Toggle */}
          {targetData.length > 0 && (
            <div className="pt-4 border-t">
              <Button 
                onClick={() => setShowTargetComparison(!showTargetComparison)}
                variant={showTargetComparison ? "default" : "outline"}
                className="flex items-center gap-2"
              >
                <Target className="h-4 w-4" />
                {showTargetComparison ? "Hide" : "Show"} Target Comparison
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Target vs Actual Comparison */}
      {showTargetComparison && targetData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Actual vs Target Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const comparison = calculateTargetVsActual(
                filteredData,
                targetData,
                selectedYear === 'all' ? undefined : selectedYear,
                targetMonths.includes('all') ? undefined : targetMonths
              );

              if (comparison.length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No target data available for the selected filters.</p>
                  </div>
                );
              }

              const totalActualQty = comparison.reduce((sum, item) => sum + item.actualQty, 0);
              const totalActualValue = comparison.reduce((sum, item) => sum + item.actualValue, 0);
              const totalTargetQty = comparison.reduce((sum, item) => sum + item.targetQty, 0);
              const totalTargetValue = comparison.reduce((sum, item) => sum + item.targetValue, 0);

              return (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-blue-600">
                          {totalActualQty.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">Actual Quantity</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-green-600">
                          {totalTargetQty.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">Target Quantity</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-blue-600">
                          LKR {Math.round(totalActualValue).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">Actual Value</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-green-600">
                          LKR {Math.round(totalTargetValue).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">Target Value</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detailed Comparison Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-700 text-white">
                          <th className="border p-2 text-left">Customer</th>
                          <th className="border p-2 text-right">Actual Qty</th>
                          <th className="border p-2 text-right">Target Qty</th>
                          <th className="border p-2 text-right">Qty Variance</th>
                          <th className="border p-2 text-right">Qty Achievement</th>
                          <th className="border p-2 text-right">Actual Value</th>
                          <th className="border p-2 text-right">Target Value</th>
                          <th className="border p-2 text-right">Value Variance</th>
                          <th className="border p-2 text-right">Value Achievement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.map((item, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="border p-2 font-medium">{item.customer}</td>
                            <td className="border p-2 text-right">{item.actualQty.toLocaleString()}</td>
                            <td className="border p-2 text-right">{item.targetQty.toLocaleString()}</td>
                            <td className={`border p-2 text-right ${item.qtyVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {item.qtyVariance >= 0 ? '+' : ''}{item.qtyVariance.toLocaleString()}
                            </td>
                            <td className={`border p-2 text-right font-medium ${item.qtyPercentage >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                              {item.qtyPercentage.toFixed(1)}%
                            </td>
                            <td className="border p-2 text-right">LKR {Math.round(item.actualValue).toLocaleString()}</td>
                            <td className="border p-2 text-right">LKR {Math.round(item.targetValue).toLocaleString()}</td>
                            <td className={`border p-2 text-right ${item.valueVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {item.valueVariance >= 0 ? '+' : ''}LKR {Math.round(item.valueVariance).toLocaleString()}
                            </td>
                            <td className={`border p-2 text-right font-medium ${item.valuePercentage >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                              {item.valuePercentage.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 font-bold">
                          <td className="border p-2">Total</td>
                          <td className="border p-2 text-right">{totalActualQty.toLocaleString()}</td>
                          <td className="border p-2 text-right">{totalTargetQty.toLocaleString()}</td>
                          <td className={`border p-2 text-right ${(totalActualQty - totalTargetQty) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {(totalActualQty - totalTargetQty) >= 0 ? '+' : ''}{(totalActualQty - totalTargetQty).toLocaleString()}
                          </td>
                          <td className={`border p-2 text-right ${totalTargetQty > 0 ? (totalActualQty / totalTargetQty * 100 >= 100 ? 'text-green-600' : 'text-red-600') : ''}`}>
                            {totalTargetQty > 0 ? (totalActualQty / totalTargetQty * 100).toFixed(1) : '0.0'}%
                          </td>
                          <td className="border p-2 text-right">LKR {Math.round(totalActualValue).toLocaleString()}</td>
                          <td className="border p-2 text-right">LKR {Math.round(totalTargetValue).toLocaleString()}</td>
                          <td className={`border p-2 text-right ${(totalActualValue - totalTargetValue) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {(totalActualValue - totalTargetValue) >= 0 ? '+' : ''}LKR {Math.round(totalActualValue - totalTargetValue).toLocaleString()}
                          </td>
                          <td className={`border p-2 text-right ${totalTargetValue > 0 ? (totalActualValue / totalTargetValue * 100 >= 100 ? 'text-green-600' : 'text-red-600') : ''}`}>
                            {totalTargetValue > 0 ? (totalActualValue / totalTargetValue * 100).toFixed(1) : '0.0'}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Summary Card */}
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold">
            Sales Report By {showValues ? "Value" : "Quantity"}
          </CardTitle>
          <div className="flex justify-center items-center space-x-8 mt-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{selectedYear}</div>
              <div className="text-sm text-muted-foreground">vs</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{previousYear}</div>
            </div>
          </div>
          <div className="text-center mt-4">
            <div className="text-4xl font-bold text-blue-600">
              {showValues ? `LKR ${totalValue.toLocaleString()}` : `${totalQuantity.toLocaleString()}`}
            </div>
            <div className="flex items-center justify-center mt-2">
              <span className="text-sm mr-2">
                Previous Year: {showValues ? `LKR ${previousYearValue.toLocaleString()}` : `${previousYearQuantity.toLocaleString()}`}
              </span>
              <div className="flex items-center">
                {parseFloat(showValues ? valueGrowth : quantityGrowth) > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                )}
                <span className={`text-sm font-medium ${
                  parseFloat(showValues ? valueGrowth : quantityGrowth) > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {showValues ? valueGrowth : quantityGrowth}%
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{showValues ? "Value" : "Qty"} by Customer</CardTitle>
            <Badge variant="outline">{selectedYear}</Badge>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={customerChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="customer" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="current" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Year over Year Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Current vs Previous Year {showValues ? "Value" : "Quantity"} By Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={customerChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="customer" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="current" fill="#2563eb" />
                  <Bar dataKey="previous" fill="#cbd5e1" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Monthly Trends */}
        <Card>
          <CardHeader>
            <CardTitle>{showValues ? "Value" : "Qty"} by Month</CardTitle>
            <Badge variant="outline">{selectedYear}</Badge>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="current" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Monthly Comparison with Previous Year */}
        <Card>
          <CardHeader>
            <CardTitle>Current vs Previous Year {showValues ? "Value" : "Quantity"} By Month</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="current" fill="#2563eb" />
                  <Bar dataKey="previous" fill="#cbd5e1" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* --- Product Category Sales Comparison Chart --- */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Product Categories: Current vs Previous Year Sales</CardTitle>
            <Badge variant="outline">{selectedYear} vs {previousYear} ({!selectedMonths.includes('all') && selectedMonths.length === 1 ? new Date(2000, Number(selectedMonths[0]) - 1).toLocaleString('en-US', { month: 'long' }) : selectedMonths.includes('all') ? 'All Months' : 'Multiple Months'})</Badge>
          </CardHeader>
          <CardContent>
            {selectedMonths.includes('all') ? (
              <div className="text-muted-foreground">Select specific months to view product category comparison.</div>
            ) : (
              <ChartContainer config={chartConfig} className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productCategoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" angle={-45} textAnchor="end" height={80} fontSize={12} />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="current" fill="#2563eb" />
                    <Bar dataKey="previous" fill="#cbd5e1" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="border p-2 text-left">Year</th>
                  <th className="border p-2 text-left">Month</th>
                  <th className="border p-2 text-left">Customer</th>
                  <th className="border p-2 text-right">Quantity</th>
                  <th className="border p-2 text-right">Value (LKR)</th>
                  <th className="border p-2 text-right">Order Lines</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => {
                  const date = new Date(item.date_order);
                  const quantity = getInvoiceQuantity(item);
                  const orderLinesCount = item.order_lines ? item.order_lines.length : 0;
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border p-2">{date.getFullYear()}</td>
                      <td className="border p-2">{date.toLocaleDateString('en-US', { month: 'short' })}</td>
                      <td className="border p-2">{item.partner_name}</td>
                      <td className="border p-2 text-right">{quantity}</td>
                      <td className="border p-2 text-right">LKR {item.amount_total.toLocaleString()}</td>
                      <td className="border p-2 text-right">{orderLinesCount}</td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-100 font-bold">
                  <td className="border p-2" colSpan={3}>Total</td>
                  <td className="border p-2 text-right">{totalQuantity.toLocaleString()}</td>
                  <td className="border p-2 text-right">LKR {totalValue.toLocaleString()}</td>
                  <td className="border p-2 text-right">
                    {filteredData.reduce((sum, item) => sum + (item.order_lines ? item.order_lines.length : 0), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

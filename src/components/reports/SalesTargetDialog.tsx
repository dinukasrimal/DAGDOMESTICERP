import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X, Target, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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

interface SalesTargetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  salesData: SalesData[];
}

interface MonthData {
  value: string;
  label: string;
}

interface TargetItem {
  product_name: string;
  product_category: string;
  quantity: number;
  value: number;
}

const months: MonthData[] = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export const SalesTargetDialog: React.FC<SalesTargetDialogProps> = ({
  isOpen,
  onClose,
  salesData,
}) => {
  const { toast } = useToast();
  const [selectedTargetYear, setSelectedTargetYear] = useState<string>('');
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [historicalData, setHistoricalData] = useState<TargetItem[]>([]);
  const [targetData, setTargetData] = useState<TargetItem[]>([]);
  const [percentageIncrease, setPercentageIncrease] = useState<string>('');
  const [showYearSelection, setShowYearSelection] = useState(false);
  const [showTargetData, setShowTargetData] = useState(false);
  const [products, setProducts] = useState<Array<{ name: string; product_category: string }>>([]);

  // Get unique customers
  const customers = Array.from(new Set(salesData.map(item => item.partner_name))).filter(Boolean);

  // Get target years (current and next 2 years) and historical years (last 3 years)
  const currentYear = new Date().getFullYear();
  const targetYears = [currentYear, currentYear + 1, currentYear + 2].map(year => year.toString());
  const years = [currentYear - 3, currentYear - 2, currentYear - 1].map(year => year.toString());

  // Fetch products data on component mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('name, product_category')
          .not('product_category', 'is', null);
        
        if (error) {
          console.error('Error fetching products:', error);
          return;
        }

        console.log('Fetched products:', data);
        setProducts(data || []);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    };

    if (isOpen) {
      fetchProducts();
    }
  }, [isOpen]);

  // Helper function to get correct product category from products table
  const getCorrectCategory = (productName: string, fallbackCategory: string): string => {
    if (!products.length) return fallbackCategory;
    
    // First try exact match
    let product = products.find(p => p.name === productName);
    
    // If no exact match, try case-insensitive match
    if (!product) {
      product = products.find(p => p.name.toLowerCase() === productName.toLowerCase());
    }
    
    // If no match, try partial match (contains)
    if (!product) {
      product = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()) || productName.toLowerCase().includes(p.name.toLowerCase()));
    }
    
    console.log(`Product: "${productName}" | Found match: ${product ? `"${product.name}" -> "${product.product_category}"` : 'None'} | Fallback: "${fallbackCategory}"`);
    
    return product?.product_category || fallbackCategory;
  };

  const handleMonthToggle = (monthValue: string) => {
    setSelectedMonths(prev => 
      prev.includes(monthValue) 
        ? prev.filter(m => m !== monthValue)
        : [...prev, monthValue]
    );
  };

  const removeMonth = (monthValue: string) => {
    setSelectedMonths(prev => prev.filter(m => m !== monthValue));
  };

  const removeCustomer = () => {
    setSelectedCustomer('');
    setShowYearSelection(false);
    setShowTargetData(false);
  };

  const getHistoricalData = () => {
    if (!selectedCustomer || selectedMonths.length === 0) return;

    // Filter sales data for selected customer and months from last 3 years
    const filteredData = salesData.filter(item => {
      if (item.partner_name !== selectedCustomer) return false;
      if (!item.date_order) return false;
      
      const orderDate = new Date(item.date_order);
      const orderMonth = String(orderDate.getMonth() + 1).padStart(2, '0');
      const orderYear = orderDate.getFullYear();
      
      return selectedMonths.includes(orderMonth) && years.includes(orderYear.toString());
    });

    // Group by year and product
    const yearlyData: { [year: string]: { [product: string]: TargetItem } } = {};
    
    filteredData.forEach(item => {
      const orderDate = new Date(item.date_order!);
      const year = orderDate.getFullYear().toString();
      
      if (!yearlyData[year]) yearlyData[year] = {};
      
      if (item.order_lines) {
        item.order_lines.forEach(line => {
          const correctCategory = getCorrectCategory(line.product_name, line.product_category);
          const key = `${line.product_name}_${correctCategory}`;
          if (!yearlyData[year][key]) {
            yearlyData[year][key] = {
              product_name: line.product_name,
              product_category: correctCategory,
              quantity: 0,
              value: 0,
            };
          }
          yearlyData[year][key].quantity += line.qty_delivered;
          yearlyData[year][key].value += line.price_subtotal;
        });
      }
    });

    // Flatten the yearly data into a single array
    const allHistoricalData: TargetItem[] = [];
    Object.values(yearlyData).forEach(yearData => {
      allHistoricalData.push(...Object.values(yearData));
    });
    setHistoricalData(allHistoricalData);
    setShowYearSelection(true);
  };

  const handleYearSelection = (year: string) => {
    setSelectedYear(year);
    
    // Filter historical data for selected year
    const yearData = salesData.filter(item => {
      if (item.partner_name !== selectedCustomer) return false;
      if (!item.date_order) return false;
      
      const orderDate = new Date(item.date_order);
      const orderMonth = String(orderDate.getMonth() + 1).padStart(2, '0');
      const orderYear = orderDate.getFullYear().toString();
      
      return selectedMonths.includes(orderMonth) && orderYear === year;
    });

    // Process year data
    const productData: { [key: string]: TargetItem } = {};
    
    yearData.forEach(item => {
      if (item.order_lines) {
        item.order_lines.forEach(line => {
          const correctCategory = getCorrectCategory(line.product_name, line.product_category);
          const key = `${line.product_name}_${correctCategory}`;
          if (!productData[key]) {
            productData[key] = {
              product_name: line.product_name,
              product_category: correctCategory,
              quantity: 0,
              value: 0,
            };
          }
          productData[key].quantity += line.qty_delivered;
          productData[key].value += line.price_subtotal;
        });
      }
    });

    const processedData = Object.values(productData).map(item => ({
      ...item,
      quantity: Math.ceil(item.quantity) // Round up to nearest whole number
    }));

    setTargetData(processedData);
    setShowTargetData(true);
  };

  const handleQuantityChange = (index: number, value: string) => {
    const quantity = Math.ceil(parseFloat(value) || 0);
    setTargetData(prev => prev.map((item, i) => {
      if (i === index) {
        // Calculate unit price from original data and update value
        const unitPrice = item.quantity > 0 ? item.value / item.quantity : 0;
        const newValue = quantity * unitPrice;
        return { ...item, quantity, value: newValue };
      }
      return item;
    }));
  };

  const applyPercentageIncrease = () => {
    const percentage = parseFloat(percentageIncrease);
    if (isNaN(percentage)) {
      toast({
        title: "Invalid Percentage",
        description: "Please enter a valid percentage value",
        variant: "destructive",
      });
      return;
    }

    setTargetData(prev => prev.map(item => ({
      ...item,
      quantity: Math.ceil(item.quantity * (1 + percentage / 100))
    })));

    toast({
      title: "Targets Updated",
      description: `Applied ${percentage}% increase to all quantities`,
    });
  };

  const handleSaveTargets = () => {
    // Here you would typically save to database
    toast({
      title: "Targets Saved",
      description: `Sales targets saved for ${selectedCustomer} for selected months`,
    });
    onClose();
  };

  const handleClose = () => {
    // Reset all state
    setSelectedTargetYear('');
    setSelectedMonths([]);
    setSelectedCustomer('');
    setSelectedYear('');
    setHistoricalData([]);
    setTargetData([]);
    setPercentageIncrease('');
    setShowYearSelection(false);
    setShowTargetData(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-6 w-6" />
            Set Sales Targets
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Target Year Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Target Year</Label>
            <Select value={selectedTargetYear} onValueChange={setSelectedTargetYear}>
              <SelectTrigger>
                <SelectValue placeholder="Choose target year..." />
              </SelectTrigger>
              <SelectContent>
                {targetYears.map(year => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month Selection - Only enabled after target year is selected */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Target Months</Label>
            <div className="grid grid-cols-3 gap-2">
              {months.map(month => (
                <div key={month.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={month.value}
                    checked={selectedMonths.includes(month.value)}
                    onCheckedChange={() => handleMonthToggle(month.value)}
                    disabled={!selectedTargetYear}
                  />
                  <Label 
                    htmlFor={month.value} 
                    className={`text-sm ${!selectedTargetYear ? 'text-muted-foreground' : ''}`}
                  >
                    {month.label}
                  </Label>
                </div>
              ))}
            </div>
            {selectedMonths.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedMonths.map(monthValue => {
                  const month = months.find(m => m.value === monthValue);
                  return (
                    <Badge key={monthValue} variant="secondary" className="flex items-center gap-1">
                      {month?.label}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => removeMonth(monthValue)}
                      />
                    </Badge>
                  );
                })}
              </div>
            )}
            {!selectedTargetYear && (
              <p className="text-sm text-muted-foreground">Please select a target year first</p>
            )}
          </div>

          {/* Customer Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Customer</Label>
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger>
                <SelectValue placeholder="Choose customer..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map(customer => (
                  <SelectItem key={customer} value={customer}>
                    {customer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCustomer && (
              <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                {selectedCustomer}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={removeCustomer}
                />
              </Badge>
            )}
          </div>

          {/* Get Historical Data Button */}
          {selectedTargetYear && selectedMonths.length > 0 && selectedCustomer && (
            <Button onClick={getHistoricalData} className="w-full">
              Get Historical Sales Data (Last 3 Years)
            </Button>
          )}

          {/* Year Selection */}
          {showYearSelection && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Base Year for Targets</Label>
              <div className="grid grid-cols-3 gap-2">
                {years.map(year => (
                  <Button
                    key={year}
                    variant={selectedYear === year ? "default" : "outline"}
                    onClick={() => handleYearSelection(year)}
                    className="w-full"
                  >
                    {year}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Target Data Display and Editing */}
          {showTargetData && targetData.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Target Data for {selectedYear} (Selected Months)
                </Label>
              </div>

              {/* Total Summary */}
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Total Target Qty: </span>
                    <span className="text-primary font-semibold">
                      {targetData.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Total Base Value: </span>
                    <span className="text-primary font-semibold">
                      LKR {targetData.reduce((sum, item) => sum + item.value, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="% increase"
                    value={percentageIncrease}
                    onChange={(e) => setPercentageIncrease(e.target.value)}
                    className="w-20"
                  />
                  <Button onClick={applyPercentageIncrease} size="sm">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Apply %
                  </Button>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted p-2 grid grid-cols-4 gap-4 font-medium text-sm">
                  <div>Product Name</div>
                  <div>Category</div>
                  <div>Target Quantity</div>
                  <div>Base Value (LKR)</div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {targetData.map((item, index) => (
                    <div key={index} className="p-2 grid grid-cols-4 gap-4 border-t text-sm">
                      <div className="truncate">{item.product_name}</div>
                      <div className="truncate">{item.product_category}</div>
                      <div>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleQuantityChange(index, e.target.value)}
                          className="w-full"
                          min="0"
                          step="1"
                        />
                      </div>
                      <div>LKR {item.value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSaveTargets} className="flex-1">
                  Save Targets
                </Button>
                <Button onClick={handleClose} variant="outline">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {showTargetData && targetData.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No sales data found for the selected customer, months, and year.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
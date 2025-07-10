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
  product_category: string;
  quantity: number;
  value: number;
  initial_quantity: number;
  initial_value: number;
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
  const [products, setProducts] = useState<Array<{ name: string; product_category: string; sub_category?: string }>>([]);
  const [existingTargets, setExistingTargets] = useState<any[]>([]);
  const [lockedMonths, setLockedMonths] = useState<string[]>([]);
  const [editingTarget, setEditingTarget] = useState<any>(null);

  // Get unique customers
  const customers = Array.from(new Set(salesData.map(item => item.partner_name))).filter(Boolean);

  // Get target years (current and next 2 years) and historical years (last 3 years)
  const currentYear = new Date().getFullYear();
  const targetYears = [currentYear, currentYear + 1, currentYear + 2].map(year => year.toString());
  const years = [currentYear - 3, currentYear - 2, currentYear - 1].map(year => year.toString());

  // Fetch products data and check for existing targets on component mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('name, product_category, sub_category');
        
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

  // Check for existing targets when customer and year are selected
  useEffect(() => {
    const checkExistingTargets = async () => {
      if (!selectedCustomer || !selectedTargetYear) {
        setLockedMonths([]);
        setExistingTargets([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('sales_targets')
          .select('*')
          .eq('customer_name', selectedCustomer)
          .eq('target_year', selectedTargetYear);

        if (error) {
          console.error('Error fetching existing targets:', error);
          return;
        }

        setExistingTargets(data || []);
        
        // Extract locked months from existing targets
        const locked: string[] = [];
        data?.forEach(target => {
          locked.push(...target.target_months);
        });
        setLockedMonths([...new Set(locked)]); // Remove duplicates
        
      } catch (error) {
        console.error('Error checking existing targets:', error);
      }
    };

    checkExistingTargets();
  }, [selectedCustomer, selectedTargetYear]);

  // Helper function to clean product names for matching
  const cleanProductName = (name: string): string => {
    // Remove brackets and their contents, trim, and normalize spaces
    return name.replace(/\[.*?\]/g, '').trim().replace(/\s+/g, ' ');
  };

  // Helper function to get correct product category from products table
  const getCorrectCategory = (productName: string, fallbackCategory: string): string => {
    if (!products.length) return fallbackCategory;
    
    const cleanedProductName = cleanProductName(productName);
    
    // First try exact match with cleaned name
    let product = products.find(p => cleanProductName(p.name) === cleanedProductName);
    
    // If no exact match, try case-insensitive match with cleaned names
    if (!product) {
      product = products.find(p => cleanProductName(p.name).toLowerCase() === cleanedProductName.toLowerCase());
    }
    
    // If no match, try partial match (contains) with cleaned names
    if (!product) {
      product = products.find(p => {
        const cleanedDbName = cleanProductName(p.name).toLowerCase();
        const cleanedInputName = cleanedProductName.toLowerCase();
        return cleanedDbName.includes(cleanedInputName) || cleanedInputName.includes(cleanedDbName);
      });
    }
    
    // If still no match, try original matching logic as fallback
    if (!product) {
      product = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()) || productName.toLowerCase().includes(p.name.toLowerCase()));
    }
    
    console.log(`Product: "${productName}" | Cleaned: "${cleanedProductName}" | Found match: ${product ? `"${product.name}" -> "${product.sub_category || product.product_category}"` : 'None'} | Fallback: "${fallbackCategory}"`);
    
    return product?.sub_category || product?.product_category || fallbackCategory;
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

    // Group by year and category (not product)
    const yearlyData: { [year: string]: { [category: string]: TargetItem } } = {};
    
    filteredData.forEach(item => {
      const orderDate = new Date(item.date_order!);
      const year = orderDate.getFullYear().toString();
      
      if (!yearlyData[year]) yearlyData[year] = {};
      
      if (item.order_lines) {
        item.order_lines.forEach(line => {
          const correctCategory = getCorrectCategory(line.product_name, line.product_category);
          if (!yearlyData[year][correctCategory]) {
            yearlyData[year][correctCategory] = {
              product_category: correctCategory,
              quantity: 0,
              value: 0,
              initial_quantity: 0,
              initial_value: 0,
            };
          }
          yearlyData[year][correctCategory].quantity += line.qty_delivered;
          yearlyData[year][correctCategory].value += line.price_subtotal;
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

    // Process year data by category only
    const categoryData: { [category: string]: TargetItem } = {};
    
    yearData.forEach(item => {
      if (item.order_lines) {
        item.order_lines.forEach(line => {
          const correctCategory = getCorrectCategory(line.product_name, line.product_category);
          if (!categoryData[correctCategory]) {
            categoryData[correctCategory] = {
              product_category: correctCategory,
              quantity: 0,
              value: 0,
              initial_quantity: 0,
              initial_value: 0,
            };
          }
          categoryData[correctCategory].quantity += line.qty_delivered;
          categoryData[correctCategory].value += line.price_subtotal;
        });
      }
    });

    const processedData = Object.values(categoryData).map(item => ({
      ...item,
      quantity: Math.ceil(item.quantity), // Round up to nearest whole number
      initial_quantity: Math.ceil(item.quantity), // Store original quantity
      initial_value: item.value // Store original value
    }));

    setTargetData(processedData);
    setShowTargetData(true);
  };

  const handleQuantityChange = (index: number, value: string) => {
    const quantity = Math.ceil(parseFloat(value) || 0);
    setTargetData(prev => prev.map((item, i) => {
      if (i === index) {
        // Calculate unit price from initial data and update value
        const unitPrice = item.initial_quantity > 0 ? item.initial_value / item.initial_quantity : 0;
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

    setTargetData(prev => prev.map(item => {
      const newQuantity = Math.ceil(item.initial_quantity * (1 + percentage / 100));
      // Calculate unit price from initial data and update value based on new quantity
      const unitPrice = item.initial_quantity > 0 ? item.initial_value / item.initial_quantity : 0;
      const newValue = newQuantity * unitPrice;
      
      return {
        ...item,
        quantity: newQuantity,
        value: newValue
      };
    }));

    toast({
      title: "Targets Updated",
      description: `Applied ${percentage}% increase to quantities and recalculated values`,
    });
  };

  const handleSaveTargets = async () => {
    if (!selectedCustomer || !selectedTargetYear || !selectedYear || targetData.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please complete all required fields before saving",
        variant: "destructive",
      });
      return;
    }

    try {
      const initialTotalQty = targetData.reduce((sum, item) => sum + item.initial_quantity, 0);
      const initialTotalValue = targetData.reduce((sum, item) => sum + item.initial_value, 0);
      const adjustedTotalQty = targetData.reduce((sum, item) => sum + item.quantity, 0);
      const adjustedTotalValue = targetData.reduce((sum, item) => sum + item.value, 0);
      const percentageInc = initialTotalQty > 0 ? ((adjustedTotalQty - initialTotalQty) / initialTotalQty * 100) : 0;

      const { data: { user } } = await supabase.auth.getUser();
      
      const targetRecord = {
        customer_name: selectedCustomer,
        target_year: selectedTargetYear,
        target_months: selectedMonths,
        base_year: selectedYear,
        target_data: targetData as any,
        initial_total_qty: initialTotalQty,
        initial_total_value: initialTotalValue,
        adjusted_total_qty: adjustedTotalQty,
        adjusted_total_value: adjustedTotalValue,
        percentage_increase: percentageInc,
        created_by: user?.id
      };

      const { error } = await supabase
        .from('sales_targets')
        .insert([targetRecord]);

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          toast({
            title: "Targets Already Exist",
            description: "Targets for these months already exist. Please edit or delete existing targets first.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: "Targets Saved",
        description: `Sales targets saved successfully for ${selectedCustomer}`,
      });
      
      // Refresh locked months after saving
      const { data } = await supabase
        .from('sales_targets')
        .select('target_months')
        .eq('customer_name', selectedCustomer)
        .eq('target_year', selectedTargetYear);
      
      const locked: string[] = [];
      data?.forEach(target => {
        locked.push(...target.target_months);
      });
      setLockedMonths([...new Set(locked)]);
      
      // Reset form
      setSelectedMonths([]);
      setTargetData([]);
      setShowTargetData(false);
      setShowYearSelection(false);
      
    } catch (error) {
      console.error('Error saving targets:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save targets. Please try again.",
        variant: "destructive",
      });
    }
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

          {/* Customer Selection - Moved between year and months */}
          {selectedTargetYear && (
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
          )}

          {/* Month Selection - Only enabled after customer is selected */}
          {selectedCustomer && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Target Months</Label>
              <div className="grid grid-cols-3 gap-2">
                {months.map(month => {
                  const isLocked = lockedMonths.includes(month.value);
                  return (
                    <div key={month.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={month.value}
                        checked={selectedMonths.includes(month.value)}
                        onCheckedChange={() => handleMonthToggle(month.value)}
                        disabled={isLocked}
                      />
                      <Label 
                        htmlFor={month.value} 
                        className={`text-sm ${isLocked ? 'text-red-500 line-through' : ''}`}
                      >
                        {month.label} {isLocked && '(Locked)'}
                      </Label>
                    </div>
                  );
                })}
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
              
              {/* Show existing targets warning */}
              {lockedMonths.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">
                    Some months are locked because targets already exist for this customer and year. 
                    You need to edit or delete existing targets to modify them.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {/* TODO: Show existing targets for editing */}}
                    >
                      View/Edit Existing Targets
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                  Target Data for {selectedYear} (Selected Months) - By Category
                </Label>
              </div>

              {/* Initial vs Adjusted Summary */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <h4 className="font-medium text-sm">Summary</h4>
                
                {/* Initial Totals */}
                <div className="grid grid-cols-2 gap-4 text-sm border-b pb-2">
                  <div>
                    <span className="font-medium">Initial Total Qty: </span>
                    <span className="text-primary font-semibold">
                      {targetData.reduce((sum, item) => sum + item.initial_quantity, 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Initial Total Value: </span>
                    <span className="text-primary font-semibold">
                      LKR {targetData.reduce((sum, item) => sum + item.initial_value, 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Adjusted Totals */}
                <div className="grid grid-cols-2 gap-4 text-sm border-b pb-2">
                  <div>
                    <span className="font-medium">Adjusted Target Qty: </span>
                    <span className="text-accent-foreground font-semibold">
                      {targetData.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Adjusted Base Value: </span>
                    <span className="text-accent-foreground font-semibold">
                      LKR {targetData.reduce((sum, item) => sum + item.value, 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Percentage Increase */}
                <div className="text-sm">
                  <span className="font-medium">Percentage Increase: </span>
                  <span className="text-green-600 font-semibold">
                    {(() => {
                      const initialQty = targetData.reduce((sum, item) => sum + item.initial_quantity, 0);
                      const adjustedQty = targetData.reduce((sum, item) => sum + item.quantity, 0);
                      const percentageIncrease = initialQty > 0 ? ((adjustedQty - initialQty) / initialQty * 100) : 0;
                      return `${percentageIncrease.toFixed(1)}%`;
                    })()}
                  </span>
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
                <div className="bg-muted p-2 grid grid-cols-3 gap-4 font-medium text-sm">
                  <div>Category</div>
                  <div>Target Quantity</div>
                  <div>Base Value (LKR)</div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {targetData.map((item, index) => (
                    <div key={index} className="p-2 grid grid-cols-3 gap-4 border-t text-sm">
                      <div className="truncate font-medium">{item.product_category}</div>
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
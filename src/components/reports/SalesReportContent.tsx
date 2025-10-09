import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Package, X, Target, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getTargetsForAnalytics, calculateTargetVsActual, TargetData } from '@/services/targetService';
import { useToast } from '@/hooks/use-toast';
import {
  fetchCustomerMergeData,
  ensureMergeGroup,
  addCustomerMergeMembers,
  upsertInvoiceMerges,
  deleteInvoiceMerge,
  deactivateMergeGroup,
} from '@/services/customerMergeService';

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
  const [mergedCustomerGroups, setMergedCustomerGroups] = useState<Record<string, string[]>>({});
  const [customerMergeSelection, setCustomerMergeSelection] = useState<string[]>([]);
  const [primaryCustomer, setPrimaryCustomer] = useState<string>('');
  const [invoiceMergeMode, setInvoiceMergeMode] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [invoiceAssignments, setInvoiceAssignments] = useState<Record<string, string>>({});
  const [customerMergeGroupIds, setCustomerMergeGroupIds] = useState<Record<string, string>>({});
  const [invoiceMergeGroupIds, setInvoiceMergeGroupIds] = useState<Record<string, string>>({});
  const [isLoadingMergeData, setIsLoadingMergeData] = useState(false);
  const [isApplyingMerge, setIsApplyingMerge] = useState(false);
  const { toast } = useToast();
  
  const mergedCustomerLookup = useMemo(() => {
    const lookup: Record<string, string> = {};
    Object.entries(mergedCustomerGroups).forEach(([alias, members]) => {
      lookup[alias] = alias;
      members.forEach(member => {
        lookup[member] = alias;
      });
    });
    return lookup;
  }, [mergedCustomerGroups]);

  const getMergedCustomerName = useCallback((name: string) => {
    return mergedCustomerLookup[name] || name;
  }, [mergedCustomerLookup]);

  const getCustomerMembers = useCallback((name: string) => {
    if (!name) return [];
    if (mergedCustomerGroups[name]) {
      return mergedCustomerGroups[name];
    }
    return [name];
  }, [mergedCustomerGroups]);

  const mergedSalesData = useMemo(() => {
    return salesData.map(item => {
      const assignedPrimary = invoiceAssignments[item.id];
      const normalizedName = assignedPrimary || getMergedCustomerName(item.partner_name);
      return {
        ...item,
        partner_name: normalizedName
      };
    });
  }, [salesData, getMergedCustomerName, invoiceAssignments]);

  const mergeOptions = useMemo(() => {
    const names = new Set<string>();
    salesData.forEach(item => names.add(item.partner_name));
    Object.keys(mergedCustomerGroups).forEach(alias => names.add(alias));
    Object.values(invoiceAssignments).forEach(alias => names.add(alias));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [salesData, mergedCustomerGroups, invoiceAssignments]);

  const resolveMergeSelection = useCallback((entries: string[]) => {
    const resolved = new Set<string>();
    entries.forEach(entry => {
      getCustomerMembers(entry).forEach(member => resolved.add(member));
    });
    return Array.from(resolved);
  }, [getCustomerMembers]);

  const uniqueList = useCallback((items: string[]) => Array.from(new Set(items)), []);

  const resolvedMergeMembers = useMemo(
    () => resolveMergeSelection(customerMergeSelection),
    [customerMergeSelection, resolveMergeSelection]
  );

  const invoiceCandidateCustomers = useMemo(() => {
    return new Set(resolvedMergeMembers);
  }, [resolvedMergeMembers]);

  const availableInvoiceOptions = useMemo(() => {
    if (!invoiceMergeMode || !primaryCustomer) return [];
    if (invoiceCandidateCustomers.size === 0) return [];
    return salesData
      .filter(invoice => invoiceCandidateCustomers.has(invoice.partner_name))
      .filter(invoice => !invoiceAssignments[invoice.id] || invoiceAssignments[invoice.id] === primaryCustomer)
      .map(invoice => ({
        id: invoice.id,
        name: invoice.name || invoice.id,
        customer: invoice.partner_name,
        amount: invoice.amount_total,
        date: invoice.date_order
      }))
      .sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      });
  }, [invoiceMergeMode, primaryCustomer, invoiceCandidateCustomers, salesData, invoiceAssignments]);

  const availableInvoiceOptionIds = useMemo(
    () => new Set(availableInvoiceOptions.map(option => option.id)),
    [availableInvoiceOptions]
  );

  const assignedInvoicesByPrimary = useMemo(() => {
    const map: Record<string, SalesData[]> = {};
    salesData.forEach(invoice => {
      const assigned = invoiceAssignments[invoice.id];
      if (!assigned) return;
      if (!map[assigned]) map[assigned] = [];
      map[assigned].push(invoice);
    });
    Object.values(map).forEach(list => {
      list.sort((a, b) => {
        const aTime = a.date_order ? new Date(a.date_order).getTime() : 0;
        const bTime = b.date_order ? new Date(b.date_order).getTime() : 0;
        return bTime - aTime;
      });
    });
    return map;
  }, [invoiceAssignments, salesData]);

  const loadMergeData = useCallback(async () => {
    setIsLoadingMergeData(true);
    try {
      const { groups } = await fetchCustomerMergeData();
      const customerGroupMap: Record<string, string[]> = {};
      const customerGroupIdMap: Record<string, string> = {};
      const invoiceGroupIdMap: Record<string, string> = {};
      const invoiceAssignmentMap: Record<string, string> = {};

      groups.forEach(group => {
        if (!group || group.is_active === false) return;
        if (group.merge_type === 'customer') {
          customerGroupIdMap[group.primary_customer] = group.id;
          const members = (group.customer_merge_members || [])
            .map(member => member.merged_customer)
            .filter(Boolean);
          if (members.length > 0) {
            customerGroupMap[group.primary_customer] = members;
          }
        } else if (group.merge_type === 'invoice') {
          invoiceGroupIdMap[group.primary_customer] = group.id;
          (group.customer_invoice_merges || []).forEach(entry => {
            if (entry.invoice_id) {
              invoiceAssignmentMap[entry.invoice_id] = group.primary_customer;
            }
          });
        }
      });

      setMergedCustomerGroups(customerGroupMap);
      setCustomerMergeGroupIds(customerGroupIdMap);
      setInvoiceMergeGroupIds(invoiceGroupIdMap);
      setInvoiceAssignments(invoiceAssignmentMap);
    } catch (error) {
      console.error('Failed to load merge data:', error);
      toast({
        title: 'Merge sync failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMergeData(false);
    }
  }, [toast]);

  useEffect(() => {
    loadMergeData();
  }, [loadMergeData]);

  useEffect(() => {
    if (primaryCustomer && !mergeOptions.includes(primaryCustomer)) {
      setPrimaryCustomer('');
    }
  }, [mergeOptions, primaryCustomer]);

  useEffect(() => {
    if (primaryCustomer && primaryCustomer !== 'all' && (selectedCustomers.includes('all') || selectedCustomers.includes(primaryCustomer))) {
      return;
    }
    const candidate = selectedCustomers.find(name => name !== 'all');
    if (!primaryCustomer && candidate) {
      setPrimaryCustomer(candidate);
    } else if (primaryCustomer && !selectedCustomers.includes('all') && !selectedCustomers.includes(primaryCustomer)) {
      setPrimaryCustomer(candidate || '');
    }
  }, [selectedCustomers, primaryCustomer]);

  useEffect(() => {
    if (!invoiceMergeMode) {
      setSelectedInvoiceIds([]);
      return;
    }
    setSelectedInvoiceIds(prev => prev.filter(id => availableInvoiceOptionIds.has(id)));
  }, [invoiceMergeMode, availableInvoiceOptionIds]);

  // Sorting state for Target vs Actual table
  const [sortField, setSortField] = useState<string>('customer');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Handle sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort comparison data
  const sortComparisonData = (data: any[]) => {
    return [...data].sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];
      
      // Handle string comparison for customer names
      if (sortField === 'customer') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  const handleMergeSelectionAdd = (value: string) => {
    if (!value || value === 'all' || value === primaryCustomer) return;
    setCustomerMergeSelection(prev => prev.includes(value) ? prev : [...prev, value]);
  };

  const handleMergeSelectionRemove = (value: string) => {
    setCustomerMergeSelection(prev => prev.filter(item => item !== value));
  };

  const handleInvoiceSelectionToggle = (invoiceId: string, checked: boolean) => {
    setSelectedInvoiceIds(prev => {
      if (checked) {
        if (prev.includes(invoiceId)) return prev;
        return [...prev, invoiceId];
      }
      return prev.filter(id => id !== invoiceId);
    });
  };

  const handleUnassignInvoice = async (invoiceId: string) => {
    setIsApplyingMerge(true);
    try {
      await deleteInvoiceMerge(invoiceId);
      setInvoiceAssignments(prev => {
        if (!prev[invoiceId]) return prev;
        const updated = { ...prev };
        delete updated[invoiceId];
        return updated;
      });
      setSelectedInvoiceIds(prev => prev.filter(id => id !== invoiceId));
      await loadMergeData();
      toast({
        title: 'Invoice unassigned',
        description: `Invoice ${invoiceId} removed from merge.`,
      });
    } catch (error) {
      console.error('Failed to unassign invoice:', error);
      toast({
        title: 'Unassign failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsApplyingMerge(false);
    }
  };

  const handleMergeCustomers = async () => {
    if (!primaryCustomer) return;
    setIsApplyingMerge(true);
    try {
      if (invoiceMergeMode) {
        if (selectedInvoiceIds.length === 0) {
          setIsApplyingMerge(false);
          return;
        }
        const groupId =
          invoiceMergeGroupIds[primaryCustomer] ||
          (await ensureMergeGroup(primaryCustomer, 'invoice'));

        const invoicePayload = selectedInvoiceIds
          .map(id => {
            const originalInvoice = salesData.find(inv => inv.id === id);
            if (!originalInvoice) return null;
            return {
              invoice_id: id,
              primary_customer: primaryCustomer,
              merged_from_customer: originalInvoice.partner_name,
            };
          })
          .filter((entry): entry is { invoice_id: string; primary_customer: string; merged_from_customer: string } => !!entry);

        await upsertInvoiceMerges(groupId, invoicePayload);

        setInvoiceMergeGroupIds(prev => ({ ...prev, [primaryCustomer]: groupId }));
        setInvoiceAssignments(prev => {
          const updated = { ...prev };
          invoicePayload.forEach(entry => {
            updated[entry.invoice_id] = primaryCustomer;
          });
          return updated;
        });
        setSelectedInvoiceIds([]);
        setCustomerMergeSelection([]);
        await loadMergeData();
        toast({
          title: 'Invoices merged',
          description: `${invoicePayload.length} invoice(s) assigned to ${primaryCustomer}.`,
        });
        return;
      }

      const resolvedNames = resolveMergeSelection(customerMergeSelection).filter(name => name !== primaryCustomer);
      if (resolvedNames.length === 0) {
        return;
      }

      const groupId =
        customerMergeGroupIds[primaryCustomer] ||
        (await ensureMergeGroup(primaryCustomer, 'customer'));

      await addCustomerMergeMembers(groupId, resolvedNames);

      setCustomerMergeGroupIds(prev => ({ ...prev, [primaryCustomer]: groupId }));
      setMergedCustomerGroups(prev => {
        const existingAliasMembers = prev[primaryCustomer] || [];
        const combined = uniqueList([...existingAliasMembers, ...resolvedNames]).sort((a, b) => a.localeCompare(b));
        return {
          ...prev,
          [primaryCustomer]: combined,
        };
      });

      setCustomerMergeSelection([]);

      if (!selectedCustomers.includes('all')) {
        setSelectedCustomers(prev => {
          const filtered = prev.filter(name => !resolvedNames.includes(name));
          if (!filtered.includes(primaryCustomer)) filtered.push(primaryCustomer);
          return uniqueList(filtered);
        });
      }
      await loadMergeData();
      toast({
        title: 'Customers merged',
        description: `${resolvedNames.length} customer(s) merged into ${primaryCustomer}.`,
      });
    } catch (error) {
      console.error('Merge failed:', error);
      toast({
        title: 'Merge failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsApplyingMerge(false);
    }
  };

  const handleRemoveMergedGroup = async (alias: string) => {
    const groupId = customerMergeGroupIds[alias];
    setIsApplyingMerge(true);
    try {
      if (groupId) {
        await deactivateMergeGroup(groupId);
      }
      const members = mergedCustomerGroups[alias] || [];
      setMergedCustomerGroups(prev => {
        const updated = { ...prev };
        delete updated[alias];
        return updated;
      });
      setCustomerMergeGroupIds(prev => {
        const updated = { ...prev };
        delete updated[alias];
        return updated;
      });
      setCustomerMergeSelection(prev => prev.filter(item => item !== alias));
      if (alias === primaryCustomer) {
        setPrimaryCustomer('');
      }
      setInvoiceAssignments(prev => {
        const updated = { ...prev };
        Object.entries(updated).forEach(([invoiceId, assigned]) => {
          if (assigned === alias) {
            delete updated[invoiceId];
          }
        });
        return updated;
      });
      if (!selectedCustomers.includes('all')) {
        setSelectedCustomers(prev => {
          const filtered = prev.filter(name => name !== alias);
          members.forEach(member => {
            if (!filtered.includes(member)) filtered.push(member);
          });
          return uniqueList(filtered);
        });
      } else {
        setSelectedCustomers(prev => prev.filter(name => name !== alias));
      }
      await loadMergeData();
      toast({
        title: 'Merge removed',
        description: `${alias} merge has been cleared.`,
      });
    } catch (error) {
      console.error('Failed to remove merge:', error);
      toast({
        title: 'Failed to remove merge',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsApplyingMerge(false);
    }
  };

  // Sortable header component
  const SortableHeader = ({ field, children, align = "text-left" }: { 
    field: string; 
    children: React.ReactNode; 
    align?: string;
  }) => (
    <th 
      className={`border p-2 ${align} cursor-pointer hover:bg-slate-600 transition-colors select-none`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{children}</span>
        <div className="flex flex-col">
          <ChevronUp 
            className={`h-3 w-3 ${
              sortField === field && sortDirection === 'asc' 
                ? 'text-white' 
                : 'text-slate-400'
            }`} 
          />
          <ChevronDown 
            className={`h-3 w-3 -mt-1 ${
              sortField === field && sortDirection === 'desc' 
                ? 'text-white' 
                : 'text-slate-400'
            }`} 
          />
        </div>
      </div>
    </th>
  );

  // Get available years from data
  const availableYears = [...new Set(mergedSalesData.map(item => 
    new Date(item.date_order).getFullYear().toString()
  ))].sort((a, b) => b.localeCompare(a));

  // Helper to extract code in brackets from product_name
  function extractCodeFromBrackets(name: string): string | null {
    const match = name.match(/\[(.*?)\]/);
    return match ? match[1].trim() : null;
  }

  // Get unique product categories from products table based on codes in order lines
  const productCategories = ['all', ...Array.from(new Set(
    mergedSalesData.flatMap(item =>
      (item.order_lines || []).map(line => {
        if (!line.product_name) return 'Uncategorized';
        const code = extractCodeFromBrackets(line.product_name);
        const found = code && products.find(p => p.default_code === code);
        return found ? found.product_category || 'Uncategorized' : 'Uncategorized';
      })
    )
  )).sort()];

  const doesLineMatchCategory = useCallback((line: any) => {
    if (selectedCategory === 'all') return true;
    if (!line?.product_name) return false;
    const code = extractCodeFromBrackets(line.product_name);
    const found = code && products.find(p => p.default_code === code);
    const category = found ? (found.product_category || 'Uncategorized') : 'Uncategorized';
    return category === selectedCategory;
  }, [products, selectedCategory]);

  // Filter data based on selections, including category
  const getInvoiceQuantity = (invoice: SalesData): number => {
    if (invoice.order_lines && Array.isArray(invoice.order_lines) && invoice.order_lines.length > 0) {
      return invoice.order_lines.reduce((sum, line) => {
        const qty = Number(line.qty_delivered) || 0;
        return sum + qty;
      }, 0);
    }
    return 1;
  };

  const getInvoiceQuantityForSelection = (invoice: SalesData): number => {
    if (!invoice.order_lines || invoice.order_lines.length === 0) {
      return selectedCategory === 'all' ? 1 : 0;
    }
    let total = 0;
    invoice.order_lines.forEach(line => {
      if (selectedCategory !== 'all' && !doesLineMatchCategory(line)) return;
      total += Number(line.qty_delivered) || 0;
    });
    if (selectedCategory === 'all' && total === 0) {
      return 1;
    }
    return total;
  };

  const getInvoiceValueForSelection = (invoice: SalesData): number => {
    if (!invoice.order_lines || invoice.order_lines.length === 0) {
      return selectedCategory === 'all' ? invoice.amount_total : 0;
    }
    const total = invoice.order_lines.reduce((sum, line) => {
      if (selectedCategory !== 'all' && !doesLineMatchCategory(line)) return sum;
      if (typeof line.price_subtotal === 'number') {
        return sum + line.price_subtotal;
      }
      const qty = Number(line.qty_delivered) || 0;
      const unit = Number(line.price_unit) || 0;
      return sum + qty * unit;
    }, 0);
    if (selectedCategory === 'all') {
      return total > 0 ? total : invoice.amount_total;
    }
    return total;
  };

  const filteredData = mergedSalesData.filter(item => {
    const orderDate = new Date(item.date_order);
    const year = orderDate.getFullYear().toString();
    const month = orderDate.getMonth() + 1;
    if (selectedYear !== 'all' && year !== selectedYear) return false;
    if (!selectedMonths.includes('all') && !selectedMonths.includes(month.toString())) return false;
    if (!selectedCustomers.includes('all') && !selectedCustomers.includes(item.partner_name)) return false;
    if (selectedCategory !== 'all') {
      if (!item.order_lines || !item.order_lines.some(line => doesLineMatchCategory(line))) return false;
    }
    return true;
  });

  console.log(`Filtered data: ${filteredData.length} invoices for year ${selectedYear}, months ${selectedMonths.join(', ')}`);

  // Calculate total quantity and value
  const totalQuantity = filteredData.reduce((sum, item) => {
    const qty = getInvoiceQuantityForSelection(item);
    return sum + qty;
  }, 0);

  const totalValue = filteredData.reduce((sum, item) => sum + getInvoiceValueForSelection(item), 0);

  console.log(`Totals: Quantity = ${totalQuantity}, Value = ${totalValue}`);

  // Previous year comparison - FIXED calculation
  const previousYear = (parseInt(selectedYear) - 1).toString();
  const previousYearData = mergedSalesData.filter(item => {
    const orderDate = new Date(item.date_order);
    const year = orderDate.getFullYear().toString();
    const month = orderDate.getMonth() + 1;
    
    if (year !== previousYear) return false;
    if (!selectedMonths.includes('all') && !selectedMonths.includes(month.toString())) return false;
    if (!selectedCustomers.includes('all') && !selectedCustomers.includes(item.partner_name)) return false;
    if (selectedCategory !== 'all') {
      if (!item.order_lines || !item.order_lines.some(line => doesLineMatchCategory(line))) return false;
    }
    
    return true;
  });

  console.log(`Previous year data: ${previousYearData.length} invoices for year ${previousYear}`);

  const previousYearQuantity = previousYearData.reduce((sum, item) => {
    return sum + getInvoiceQuantityForSelection(item);
  }, 0);

  const previousYearValue = previousYearData.reduce((sum, item) => sum + getInvoiceValueForSelection(item), 0);

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
    acc[customer].quantity += getInvoiceQuantityForSelection(item);
    acc[customer].value += getInvoiceValueForSelection(item);
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const customerPreviousData = previousYearData.reduce((acc, item) => {
    const customer = item.partner_name;
    if (!acc[customer]) {
      acc[customer] = { quantity: 0, value: 0 };
    }
    acc[customer].quantity += getInvoiceQuantityForSelection(item);
    acc[customer].value += getInvoiceValueForSelection(item);
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
    acc[monthKey].quantity += getInvoiceQuantityForSelection(item);
    acc[monthKey].value += getInvoiceValueForSelection(item);
    return acc;
  }, {} as Record<string, { quantity: number; value: number }>);

  const monthlyPreviousData = previousYearData.reduce((acc, item) => {
    const date = new Date(item.date_order);
    const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
    if (!acc[monthKey]) {
      acc[monthKey] = { quantity: 0, value: 0 };
    }
    acc[monthKey].quantity += getInvoiceQuantityForSelection(item);
    acc[monthKey].value += getInvoiceValueForSelection(item);
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
  const customers = useMemo(() => {
    return [...new Set(mergedSalesData.map(item => item.partner_name))].sort((a, b) => a.localeCompare(b));
  }, [mergedSalesData]);

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
      // Convert months to 2-digit padded format for target service
      const paddedTargetMonths = targetMonths.includes('all') 
        ? undefined 
        : targetMonths.map(month => month.padStart(2, '0'));
      
      console.log('Fetching targets with:', {
        year: selectedYear,
        originalMonths: targetMonths,
        paddedMonths: paddedTargetMonths
      });
      
      const targets = await getTargetsForAnalytics(
        selectedYear === 'all' ? undefined : selectedYear,
        paddedTargetMonths
      );
      
      console.log('Target data received:', targets);
      setTargetData(targets);
    };

    if (selectedYear !== 'all' || !targetMonths.includes('all')) {
      fetchTargets();
    } else {
      setTargetData([]);
    }
  }, [selectedYear, targetMonths]);

  // Auto-sync target months when selected months change
  useEffect(() => {
    setTargetMonths(selectedMonths);
  }, [selectedMonths]);

  // Auto-enable target comparison when target data is available
  useEffect(() => {
    if (targetData.length > 0 && !showTargetComparison) {
      setShowTargetComparison(true);
    }
  }, [targetData]);

  const mergedTargetData = useMemo(() => {
    if (!targetData || targetData.length === 0) return targetData;

    const aggregate: Record<string, {
      target_year?: string;
      target_months: Set<string>;
      adjusted_total_qty: number;
      adjusted_total_value: number;
      categoryTotals: Record<string, { quantity: number; value: number }>;
    }> = {};

    targetData.forEach(target => {
      const alias = getMergedCustomerName(target.customer_name);
      if (!aggregate[alias]) {
        aggregate[alias] = {
          target_year: target.target_year,
          target_months: new Set<string>(),
          adjusted_total_qty: 0,
          adjusted_total_value: 0,
          categoryTotals: {}
        };
      }
      const bucket = aggregate[alias];
      bucket.adjusted_total_qty += target.adjusted_total_qty || 0;
      bucket.adjusted_total_value += target.adjusted_total_value || 0;
      (target.target_months || []).forEach(month => bucket.target_months.add(month));
      (target.target_data || []).forEach(entry => {
        const categoryKey = entry.product_category || 'Uncategorized';
        if (!bucket.categoryTotals[categoryKey]) {
          bucket.categoryTotals[categoryKey] = { quantity: 0, value: 0 };
        }
        bucket.categoryTotals[categoryKey].quantity += entry.quantity || 0;
        bucket.categoryTotals[categoryKey].value += entry.value || 0;
      });
    });

    return Object.entries(aggregate).map(([alias, data]) => ({
      customer_name: alias,
      target_year: data.target_year || '',
      target_months: Array.from(data.target_months).sort(),
      target_data: Object.entries(data.categoryTotals).map(([category, totals]) => ({
        product_category: category,
        quantity: totals.quantity,
        value: totals.value
      })),
      adjusted_total_qty: data.adjusted_total_qty,
      adjusted_total_value: data.adjusted_total_value
    }));
  }, [targetData, getMergedCustomerName]);

  // Build a map of product_id to product info for fast lookup
  const productMap: Record<string, any> = {};
  products.forEach(prod => {
    if (prod.id) productMap[String(prod.id)] = prod;
  });

  // --- Product Category Sales Aggregation ---
  // Build a map: category -> { current: qty, previous: qty } for the selected month only
  const productCategoryMap: Record<string, { current: number; previous: number }> = {};

  const accumulateCategoryTotals = (
    source: SalesData[],
    bucketKey: 'current' | 'previous'
  ) => {
    const isAllMonths = selectedMonths.includes('all');
    const monthSet = isAllMonths ? null : new Set(selectedMonths);

    source.forEach(item => {
      if (!item.date_order || !item.order_lines || !Array.isArray(item.order_lines)) return;
      const orderDate = new Date(item.date_order);
      const month = (orderDate.getMonth() + 1).toString();
      if (!isAllMonths && monthSet && !monthSet.has(month)) return;

      item.order_lines.forEach(line => {
        if (selectedCategory !== 'all' && !doesLineMatchCategory(line)) return;
        let category = 'Uncategorized';
        if (line.product_name) {
          const code = extractCodeFromBrackets(line.product_name);
          const found = code && products.find(p => p.default_code === code);
          if (found) category = found.product_category || 'Uncategorized';
        }
        const qty = Number(line.qty_delivered) || 0;
        if (!productCategoryMap[category]) {
          productCategoryMap[category] = { current: 0, previous: 0 };
        }
        productCategoryMap[category][bucketKey] += qty;
      });
    });
  };

  accumulateCategoryTotals(
    filteredData.filter(item => new Date(item.date_order).getFullYear().toString() === selectedYear),
    'current'
  );
  accumulateCategoryTotals(
    previousYearData.filter(item => new Date(item.date_order).getFullYear().toString() === previousYear),
    'previous'
  );
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
              <label className="text-sm font-medium mb-2 block">Primary Customer (for merge)</label>
              <Select value={primaryCustomer || ''} onValueChange={setPrimaryCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select primary customer..." />
                </SelectTrigger>
                <SelectContent>
                  {mergeOptions.map(customer => (
                    <SelectItem key={`primary-${customer}`} value={customer}>{customer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {primaryCustomer && (
                <div className="text-xs text-muted-foreground mt-1">
                  All merges feed into <span className="font-semibold">{primaryCustomer}</span>.
                </div>
              )}
            </div>
            <div className="md:col-span-2 space-y-3">
              <label className="text-sm font-medium block">Merge Customers</label>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Invoice-wise merge</div>
                  <div className="text-xs text-muted-foreground">Select specific invoices instead of entire customers.</div>
                </div>
                <Switch checked={invoiceMergeMode} onCheckedChange={value => setInvoiceMergeMode(Boolean(value))} />
              </div>
              {isLoadingMergeData && (
                <div className="text-xs text-muted-foreground">Syncing merge data...</div>
              )}
              <div className="space-y-2">
                <Select value="" onValueChange={handleMergeSelectionAdd}>
                  <SelectTrigger>
                    <SelectValue placeholder="Add customers/groups to merge..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mergeOptions.map(customer => (
                      <SelectItem key={customer} value={customer}>{customer}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customerMergeSelection.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {customerMergeSelection.map(name => (
                      <Badge key={name} variant="secondary" className="text-xs">
                        {name.length > 20 ? `${name.substring(0, 20)}...` : name}
                        <X 
                          className="h-3 w-3 ml-1 cursor-pointer" 
                          onClick={() => handleMergeSelectionRemove(name)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
                {invoiceMergeMode && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      Select invoices from the merge customers to combine under the primary.
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded border divide-y">
                      {availableInvoiceOptions.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground">No invoices available for invoice-wise merge.</div>
                      ) : (
                        availableInvoiceOptions.map(option => (
                          <label key={option.id} className="flex items-center justify-between gap-2 p-2">
                            <div className="flex-1">
                              <div className="text-sm font-medium">{option.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {option.customer} • {option.date ? new Date(option.date).toLocaleDateString() : 'No date'} • LKR {Math.round(option.amount).toLocaleString()}
                              </div>
                            </div>
                            <Checkbox
                              checked={selectedInvoiceIds.includes(option.id)}
                              onCheckedChange={checked => handleInvoiceSelectionToggle(option.id, Boolean(checked))}
                            />
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleMergeCustomers}
                  disabled={
                    isApplyingMerge ||
                    !primaryCustomer || 
                    (invoiceMergeMode 
                      ? selectedInvoiceIds.length === 0 
                      : !resolvedMergeMembers.some(name => name !== primaryCustomer))
                  }
                  type="button"
                >
                  {isApplyingMerge
                    ? 'Applying merge...'
                    : invoiceMergeMode
                      ? 'Merge Selected Invoices'
                      : 'Merge Selected Customers'}
                </Button>
                <div className="text-xs text-muted-foreground">
                  Choose a primary, add merge customers, then merge by whole customer or invoice selection.
                </div>
                {Object.entries(mergedCustomerGroups).length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Customer-level merges:</div>
                    <div className="space-y-1">
                      {Object.entries(mergedCustomerGroups).map(([alias, members]) => (
                        <div key={alias} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                          <div className="font-semibold">{alias}</div>
                          <div className="flex-1 px-2 text-right truncate">{members.join(', ')}</div>
                          <Button variant="ghost" size="sm" type="button" onClick={() => handleRemoveMergedGroup(alias)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Object.keys(assignedInvoicesByPrimary).length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Invoice-level merges:</div>
                    <div className="space-y-1">
                      {Object.entries(assignedInvoicesByPrimary).map(([alias, invoices]) => (
                        <div key={`assigned-${alias}`} className="rounded border px-2 py-1">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span>{alias}</span>
                            <span>{invoices.length} invoice(s)</span>
                          </div>
                          <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                            {invoices.map(invoice => (
                              <div key={invoice.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate">{invoice.name || invoice.id}</span>
                                <Button variant="ghost" size="sm" type="button" onClick={() => handleUnassignInvoice(invoice.id)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Target Months (Auto-synced)</label>
              <div className="p-3 bg-gray-50 rounded-md">
                <div className="text-xs text-muted-foreground mb-2">
                  Target months automatically match selected months
                </div>
                {targetMonths.length > 0 && !targetMonths.includes('all') && (
                  <div className="flex flex-wrap gap-1">
                    {targetMonths.map(month => (
                      <Badge key={month} variant="secondary" className="text-xs">
                        {new Date(2000, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short' })}
                      </Badge>
                    ))}
                  </div>
                )}
                {targetMonths.includes('all') && (
                  <Badge variant="secondary" className="text-xs">All Months</Badge>
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
              // Convert months to 2-digit padded format for calculation
              const paddedSelectedMonths = targetMonths.includes('all') 
                ? undefined 
                : targetMonths.map(month => month.padStart(2, '0'));
              
              const comparison = calculateTargetVsActual(
                filteredData,
                mergedTargetData,
                selectedYear === 'all' ? undefined : selectedYear,
                paddedSelectedMonths
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
                          <SortableHeader field="customer">Customer</SortableHeader>
                          <SortableHeader field="actualQty" align="text-right">Actual Qty</SortableHeader>
                          <SortableHeader field="targetQty" align="text-right">Target Qty</SortableHeader>
                          <SortableHeader field="qtyVariance" align="text-right">Qty Variance</SortableHeader>
                          <SortableHeader field="qtyPercentage" align="text-right">Qty Achievement</SortableHeader>
                          <SortableHeader field="actualValue" align="text-right">Actual Value</SortableHeader>
                          <SortableHeader field="targetValue" align="text-right">Target Value</SortableHeader>
                          <SortableHeader field="valueVariance" align="text-right">Value Variance</SortableHeader>
                          <SortableHeader field="valuePercentage" align="text-right">Value Achievement</SortableHeader>
                        </tr>
                      </thead>
                      <tbody>
                        {sortComparisonData(comparison).map((item, index) => (
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

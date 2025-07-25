

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Package, Calendar, Clock, Users, TrendingUp, RefreshCw, AlertCircle, Plus, CalendarDays, 
  Edit, Trash2, ChevronDown, ChevronRight, GripVertical, Settings, Search
} from 'lucide-react';
import { supabaseBatchFetch, cn } from '@/lib/utils';
import { supabaseDataService } from '@/services/supabaseDataService';
import { Holiday } from '@/types/scheduler';

interface PurchaseOrder {
  id: string;
  name: string;
  partner_name: string;
  date_order: string;
  amount_total: number;
  state: string;
  order_lines?: Array<{
    product_name: string;
    product_uom_qty: number;
    qty_received: number;
    price_unit: number;
    price_subtotal: number;
    product_category: string;
  }>;
  total_qty?: number;
  pending_qty?: number;
}

interface ProductionLine {
  id: string;
  name: string;
  capacity: number;
  mo_count?: number;
  current_load?: number;
  efficiency?: number;
  status?: 'active' | 'maintenance' | 'offline';
  created_at?: string;
  updated_at?: string;
}

interface PlannedOrder {
  id: string;
  po_id: string;
  line_id: string;
  scheduled_date: string;
  quantity: number;
  status: 'planned' | 'in_progress' | 'completed';
}


interface LineGroup {
  id: string;
  name: string;
  line_ids: string[];
  isExpanded?: boolean;
}

export const ProductionPlanner: React.FC = () => {
  const { toast } = useToast();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [poSearchTerm, setPoSearchTerm] = useState<string>('');
  
  // Line management states
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [showLineDialog, setShowLineDialog] = useState(false);
  const [newLineName, setNewLineName] = useState('');
  const [newLineCapacity, setNewLineCapacity] = useState<number>(100);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineName, setEditingLineName] = useState('');
  const [editingLineCapacity, setEditingLineCapacity] = useState<number>(100);
  const [lineToEdit, setLineToEdit] = useState<ProductionLine | null>(null);
  
  // Holiday management states
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [isGlobalHoliday, setIsGlobalHoliday] = useState(true);
  const [selectedHolidayLines, setSelectedHolidayLines] = useState<string[]>([]);
  const [isCreatingHolidays, setIsCreatingHolidays] = useState(false);
  
  // Line grouping states
  const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedLinesForGroup, setSelectedLinesForGroup] = useState<string[]>([]);
  
  // PO Split and Hide functionality states
  const [hiddenPOIds, setHiddenPOIds] = useState<Set<string>>(new Set());
  const [showHiddenPOs, setShowHiddenPOs] = useState(false);
  const [showSplitPODialog, setShowSplitPODialog] = useState(false);
  const [poToSplit, setPoToSplit] = useState<PurchaseOrder | null>(null);
  const [splitQuantities, setSplitQuantities] = useState<number[]>([]);
  const [poContextMenu, setPoContextMenu] = useState<{po: PurchaseOrder, x: number, y: number} | null>(null);
  
  // Planning and scheduling states
  const [plannedOrders, setPlannedOrders] = useState<PlannedOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [draggedPO, setDraggedPO] = useState<PurchaseOrder | null>(null);
  const [draggedPlannedOrder, setDraggedPlannedOrder] = useState<PlannedOrder | null>(null);
  const [contextMenuOrder, setContextMenuOrder] = useState<PlannedOrder | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{x: number, y: number} | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedPlannedOrders, setSelectedPlannedOrders] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [originalPOData, setOriginalPOData] = useState<Map<string, PurchaseOrder>>(new Map());
  const [isManualScheduling, setIsManualScheduling] = useState(false);
  
  // Drop position choice dialog states
  const [showDropPositionDialog, setShowDropPositionDialog] = useState(false);
  const [dropDialogData, setDropDialogData] = useState<{
    targetOrder: PlannedOrder | null;
    targetDate: Date | null;
    targetLine: ProductionLine | null;
  }>({
    targetOrder: null,
    targetDate: null,
    targetLine: null
  });

  // Filter purchase orders based on search term
  const filteredPurchaseOrders = useMemo(() => {
    let filtered = purchaseOrders;
    
    // Filter out POs with 0 pending quantity (for sidebar display only)
    filtered = filtered.filter(po => (po.pending_qty || 0) > 0);
    
    // Filter out POs that already have planned production (for sidebar display only)
    // We need to check this dynamically since plannedOrders might change
    const plannedPONames = new Set(plannedOrders.map(planned => planned.po_id));
    filtered = filtered.filter(po => !plannedPONames.has(po.name));
    
    // Apply search filter
    if (poSearchTerm.trim()) {
      const searchLower = poSearchTerm.toLowerCase();
      filtered = filtered.filter(po => 
        po.name.toLowerCase().includes(searchLower) ||
        po.partner_name.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply hidden filter
    if (!showHiddenPOs) {
      filtered = filtered.filter(po => !hiddenPOIds.has(po.id));
    }
    
    return filtered;
  }, [purchaseOrders, plannedOrders, poSearchTerm, hiddenPOIds, showHiddenPOs]);

  // Group lines by their group assignment
  const groupedLines = useMemo(() => {
    const ungroupedLines: ProductionLine[] = [];
    const groupedMap = new Map<string, ProductionLine[]>();
    
    productionLines.forEach(line => {
      const group = lineGroups.find(g => g.line_ids.includes(line.id));
      if (group) {
        if (!groupedMap.has(group.id)) {
          groupedMap.set(group.id, []);
        }
        groupedMap.get(group.id)!.push(line);
      } else {
        ungroupedLines.push(line);
      }
    });
    
    return { ungroupedLines, groupedMap };
  }, [productionLines, lineGroups]);

  // Generate extended date range (3 months back, current month, 3 months forward)
  // Auto-extend by 2 months when orders exceed current range
  const dates = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Start 3 months before current month
    const startDate = new Date(currentYear, currentMonth - 3, 1);
    // End 3 months after current month
    let endDate = new Date(currentYear, currentMonth + 4, 0); // Last day of 3 months ahead
    
    // Check if any planned orders exceed the current date range
    const latestOrderDate = plannedOrders.reduce((latest, order) => {
      const orderDate = new Date(order.scheduled_date);
      return orderDate > latest ? orderDate : latest;
    }, new Date(0));
    
    // If orders exceed the current range, extend by 2 months
    if (latestOrderDate > endDate) {
      endDate = new Date(latestOrderDate.getFullYear(), latestOrderDate.getMonth() + 2 + 1, 0);
    }
    
    const allDates: Date[] = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      allDates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return allDates;
  }, [plannedOrders]);

  // Find current date index for auto-scrolling
  const currentDateIndex = useMemo(() => {
    const today = new Date();
    const todayStr = today.toDateString();
    return dates.findIndex(date => date.toDateString() === todayStr);
  }, [dates]);

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    return compareDate < today;
  };

  const isHoliday = (date: Date, lineId?: string) => {
    const dateStr = date.toISOString().split('T')[0];
    return holidays.some(holiday => {
      const holidayDateStr = holiday.date.toISOString().split('T')[0];
      if (holidayDateStr === dateStr) {
        if (holiday.isGlobal) return true;
        if (lineId && holiday.affectedLineIds?.includes(lineId)) return true;
      }
      return false;
    });
  };

  // Helper function to get orders for a specific line
  const getLineOrders = (lineId: string) => {
    return plannedOrders.filter(order => order.line_id === lineId);
  };

  // Fetch purchase orders from Supabase
  const fetchPurchaseOrders = async () => {
    setIsLoading(true);
    try {
      // First, let's see what's in planned_production
      const { data: plannedData } = await supabase
        .from('planned_production')
        .select('purchase_id');
      
      console.log('Planned production data:', plannedData);
      console.log('Purchase IDs in planned_production:', plannedData?.map(p => p.purchase_id));

      // Get unique planned purchase IDs
      const plannedPurchaseIds = [...new Set(plannedData?.map(p => p.purchase_id) || [])];
      console.log('Will exclude these unique PO names:', plannedPurchaseIds);

      // First, get the purchase_holds to exclude them
      const { data: holdData } = await supabase
        .from('purchase_holds')
        .select('purchase_id');
      
      const heldPurchaseIds = holdData?.map(hold => hold.purchase_id) || [];
      console.log('Purchase holds to exclude:', heldPurchaseIds);

      // Build the query - fetch ALL POs first, then filter out holds
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .order('date_order', { ascending: false })
        .limit(1000);

      if (error) {
        console.error('Query error:', error);
        throw error;
      }

      console.log('Fetched purchase orders:', data?.length, 'orders');

      if (data) {
        // Filter out purchase orders that are on hold
        const filteredData = data.filter(purchase => !heldPurchaseIds.includes(purchase.id));
        console.log(`Filtered out ${data.length - filteredData.length} purchase orders on hold`);
        
        const transformedData: PurchaseOrder[] = filteredData.map(purchase => {
          const orderLines = Array.isArray(purchase.order_lines) ? purchase.order_lines : [];
          
          // Debug: Check what fields are actually available
          if (orderLines.length > 0 && purchase.name === 'PO2007') {
            console.log('Debug PO2007 order lines:', orderLines.map(line => ({
              product_name: line.product_name,
              product_qty: line.product_qty,
              product_uom_qty: line.product_uom_qty,
              qty_received: line.qty_received,
              availableFields: Object.keys(line)
            })));
          }
          
          // Try both field names to be safe
          const totalQty = orderLines.reduce((sum, line) => {
            const qty = line.product_uom_qty || line.product_qty || 0;
            return sum + qty;
          }, 0);
          
          // Calculate actual pending quantity: total - received
          const totalReceived = orderLines.reduce((sum, line) => sum + (line.qty_received || 0), 0);
          const calculatedPending = Math.max(0, totalQty - totalReceived);
          
          return {
            id: purchase.id,
            name: purchase.name || '',
            partner_name: purchase.partner_name || '',
            date_order: purchase.date_order || '',
            amount_total: purchase.amount_total || 0,
            state: purchase.state || '',
            order_lines: orderLines,
            total_qty: totalQty,
            pending_qty: calculatedPending // Use calculated value instead of database value
          };
        });
        
        // Load split orders and merge with regular purchase orders
        const splitOrders = await loadSplitOrders();
        
        // Filter out original POs that have been split
        const splitOriginalIds = new Set(splitOrders.map((split: any) => split.original_po_id));
        const filteredRegularPOs = transformedData.filter(po => !splitOriginalIds.has(po.id));
        
        // Combine regular POs with split orders
        const allPurchaseOrders = [...filteredRegularPOs, ...splitOrders];
        
        // Store combined purchase orders
        setPurchaseOrders(allPurchaseOrders);
        console.log(`Loaded ${allPurchaseOrders.length} purchase orders (${filteredRegularPOs.length} regular + ${splitOrders.length} splits)`);
        console.log('PO names loaded:', allPurchaseOrders.map(po => po.name));
      }
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      toast({
        title: "Error",
        description: "Failed to fetch purchase orders",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch production lines from Supabase
  const fetchProductionLines = async () => {
    try {
      const { data, error } = await supabase
        .from('production_lines')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching production lines:', error);
        return;
      }

      if (data && data.length === 0) {
        // No production lines exist, create some sample ones
        const sampleLines = [
          { name: 'BATHEEGAMA', capacity: 500 },
          { name: 'BHAGYA FASHION', capacity: 400 },
          { name: 'DENIM APPAREL', capacity: 1000 },
          { name: 'DESHAPRIYA', capacity: 300 },
          { name: 'NIROHAN PANTY', capacity: 800 }
        ];

        for (const line of sampleLines) {
          try {
            await supabase
              .from('production_lines')
              .insert([{
                name: line.name,
                capacity: line.capacity
              }]);
          } catch (insertError) {
            console.error('Error creating sample production line:', insertError);
          }
        }
        
        // Refetch to get the created lines
        const { data: newData } = await supabase
          .from('production_lines')
          .select('*')
          .order('name');
        setProductionLines(newData || []);
      } else {
        setProductionLines(data || []);
      }
    } catch (error) {
      console.error('Error fetching production lines:', error);
    }
  };

  // Sync purchase orders from Odoo
  const syncPurchaseOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('odoo-purchases');
      if (error) {
        throw new Error(`Failed to sync purchase data: ${error.message}`);
      }
      if (data.success) {
        toast({
          title: 'Purchase Orders Synced',
          description: `${data.count} purchase orders synced successfully`,
        });
        await fetchPurchaseOrders();
      } else {
        throw new Error(data.error || 'Failed to sync purchase data');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      toast({
        title: 'Sync Error',
        description: error instanceof Error ? error.message : 'Failed to sync purchase orders',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };


  // Line management functions
  const handleAddLine = async () => {
    if (newLineName.trim()) {
      try {
        const { data, error } = await supabase
          .from('production_lines')
          .insert([
            {
              name: newLineName.trim(),
              capacity: newLineCapacity,
              current_load: 0,
              efficiency: 100,
              status: 'active'
            }
          ])
          .select()
          .single();

        if (error) throw error;

        setProductionLines(prev => [...prev, data]);
        setNewLineName('');
        setNewLineCapacity(100);
        setShowLineDialog(false);
        
        toast({
          title: 'Line Added',
          description: `${data.name} has been added successfully`,
        });
      } catch (error) {
        console.error('Error adding production line:', error);
        toast({
          title: 'Error',
          description: 'Failed to add production line',
          variant: 'destructive',
        });
      }
    }
  };
  
  const handleEditLine = (line: ProductionLine) => {
    setLineToEdit(line);
    setEditingLineName(line.name);
    setEditingLineCapacity(line.capacity);
  };

  const handleSaveEdit = async () => {
    if (!lineToEdit) return;
    
    try {
      const { error } = await supabase
        .from('production_lines')
        .update({
          name: editingLineName.trim(),
          capacity: editingLineCapacity
        })
        .eq('id', lineToEdit.id);

      if (error) throw error;

      setProductionLines(prev => 
        prev.map(line => 
          line.id === lineToEdit.id 
            ? { ...line, name: editingLineName.trim(), capacity: editingLineCapacity }
            : line
        )
      );
      
      setLineToEdit(null);
      toast({
        title: 'Line Updated',
        description: 'Production line has been updated successfully',
      });
    } catch (error) {
      console.error('Error updating production line:', error);
      toast({
        title: 'Error',
        description: 'Failed to update production line',
        variant: 'destructive',
      });
    }
  };

  const handleSaveInlineEdit = async () => {
    if (!editingLineId) return;
    
    try {
      const { error } = await supabase
        .from('production_lines')
        .update({
          name: editingLineName.trim(),
          capacity: editingLineCapacity
        })
        .eq('id', editingLineId);

      if (error) throw error;

      setProductionLines(prev => 
        prev.map(line => 
          line.id === editingLineId 
            ? { ...line, name: editingLineName.trim(), capacity: editingLineCapacity }
            : line
        )
      );
      
      setEditingLineId(null);
      toast({
        title: 'Line Updated',
        description: 'Production line has been updated successfully',
      });
    } catch (error) {
      console.error('Error updating production line:', error);
      toast({
        title: 'Error',
        description: 'Failed to update production line',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    try {
      // First, check if there are any orders assigned to this production line
      console.log('Checking for orders assigned to production line:', lineId);
      
      const { data: assignedOrders, error: queryError } = await supabase
        .from('orders')
        .select('*')
        .eq('assigned_line_id', lineId);

      if (queryError) {
        console.error('Error querying assigned orders:', queryError);
        throw queryError;
      }

      console.log('Found assigned orders:', assignedOrders);

      if (assignedOrders && assignedOrders.length > 0) {
        // Show user the hidden orders and ask for confirmation
        const orderDetails = assignedOrders.map(order => 
          `${order.po_number || order.id} (Status: ${order.status})`
        ).join(', ');
        
        const shouldProceed = window.confirm(
          `This production line has ${assignedOrders.length} assigned orders that are not visible on the calendar:\n\n${orderDetails}\n\nDo you want to unassign these orders and delete the production line?`
        );

        if (!shouldProceed) {
          return;
        }

        // Unassign all orders from this production line
        console.log('Unassigning orders from production line...');
        const { error: unassignError } = await supabase
          .from('orders')
          .update({ assigned_line_id: null })
          .eq('assigned_line_id', lineId);

        if (unassignError) {
          console.error('Error unassigning orders:', unassignError);
          throw unassignError;
        }

        console.log(`Successfully unassigned ${assignedOrders.length} orders`);
      }

      // Now delete the production line
      const { error } = await supabase
        .from('production_lines')
        .delete()
        .eq('id', lineId);

      if (error) throw error;

      setProductionLines(prev => prev.filter(line => line.id !== lineId));
      setPlannedOrders(prev => prev.filter(order => order.line_id !== lineId));
      
      toast({
        title: 'Line Deleted',
        description: assignedOrders && assignedOrders.length > 0 
          ? `Production line deleted and ${assignedOrders.length} orders unassigned`
          : 'Production line has been deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting production line:', error);
      
      // Enhanced error message
      let errorMessage = 'Failed to delete production line';
      if (error && typeof error === 'object' && 'message' in error) {
        if (error.message.includes('violates foreign key constraint')) {
          errorMessage = 'Cannot delete: Production line has assigned orders. Please try again - the system will show you which orders need to be unassigned.';
        } else {
          errorMessage = `Failed to delete production line: ${error.message}`;
        }
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  // Fetch holidays from Supabase
  const fetchHolidays = async () => {
    try {
      const holidaysData = await supabaseDataService.getHolidays();
      setHolidays(holidaysData);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  };

  // Holiday management functions
  const handleAddHoliday = async () => {
    if (selectedDates.length > 0 && newHolidayName.trim()) {
      setIsCreatingHolidays(true);
      
      try {
        // Check for existing holidays on selected dates
        const existingHolidayDates = holidays
          .filter(holiday => selectedDates.some(date => 
            holiday.date.toISOString().split('T')[0] === date.toISOString().split('T')[0]
          ))
          .map(holiday => holiday.date.toLocaleDateString());

        if (existingHolidayDates.length > 0) {
          const shouldProceed = window.confirm(
            `Some selected dates already have holidays: ${existingHolidayDates.join(', ')}\n\nDo you want to continue and create additional holidays on these dates?`
          );
          if (!shouldProceed) {
            setIsCreatingHolidays(false);
            return;
          }
        }

        // Check for affected planned orders across all selected dates
        const allAffectedOrders = plannedOrders.filter(order => 
          selectedDates.some(date => {
            const dateStr = date.toISOString().split('T')[0];
            return order.scheduled_date === dateStr && 
                   (isGlobalHoliday || selectedHolidayLines.includes(order.line_id));
          })
        );

        if (allAffectedOrders.length > 0) {
          const confirmMove = window.confirm(
            `Creating holidays on these dates will affect ${allAffectedOrders.length} planned orders across ${selectedDates.length} dates. Do you want to continue and reschedule them?`
          );
          
          if (!confirmMove) {
            setIsCreatingHolidays(false);
            return;
          }
        }

        // Create holidays for all selected dates
        const createdHolidays = [];
        let successCount = 0;
        let errorCount = 0;

        for (const date of selectedDates) {
          try {
            const newHoliday = await supabaseDataService.createHoliday({
              name: newHolidayName.trim(),
              date: date,
              isGlobal: isGlobalHoliday,
              affectedLineIds: isGlobalHoliday ? [] : selectedHolidayLines
            });
            createdHolidays.push(newHoliday);
            successCount++;
          } catch (error) {
            console.error(`Error creating holiday for ${date.toLocaleDateString()}:`, error);
            errorCount++;
          }
        }

        // Update holidays state with successfully created holidays
        if (createdHolidays.length > 0) {
          setHolidays(prev => [...prev, ...createdHolidays]);
        }

        // Move affected orders (implementation could be enhanced)
        if (allAffectedOrders.length > 0) {
          console.log('Moving affected orders:', allAffectedOrders);
        }

        // Reset form
        setNewHolidayName('');
        setSelectedDates([]);
        setIsGlobalHoliday(true);
        setSelectedHolidayLines([]);
        setShowHolidayDialog(false);
        
        // Show result toast
        if (errorCount === 0) {
          toast({
            title: 'Holidays Created',
            description: `Successfully created "${newHolidayName.trim()}" for ${successCount} date${successCount === 1 ? '' : 's'}`,
          });
        } else if (successCount > 0) {
          toast({
            title: 'Partial Success',
            description: `Created ${successCount} holidays, but ${errorCount} failed. Check console for details.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Error',
            description: 'Failed to create any holidays',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Error in bulk holiday creation:', error);
        toast({
          title: 'Error',
          description: 'Failed to create holidays',
          variant: 'destructive',
        });
      } finally {
        setIsCreatingHolidays(false);
      }
    }
  };
  
  const handleDeleteHoliday = async (holidayId: string) => {
    try {
      await supabaseDataService.deleteHoliday(holidayId);
      setHolidays(prev => prev.filter(holiday => holiday.id !== holidayId));
      
      toast({
        title: 'Holiday Deleted',
        description: 'Holiday has been deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting holiday:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete holiday',
        variant: 'destructive',
      });
    }
  };

  // Fetch line groups from Supabase
  const fetchLineGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('line_groups')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching line groups:', error);
        return;
      }

      setLineGroups(data || []);
    } catch (error) {
      console.error('Error fetching line groups:', error);
    }
  };

  // Group management functions
  const handleCreateGroup = async () => {
    if (newGroupName.trim() && selectedLinesForGroup.length > 0) {
      try {
        const { data, error } = await supabase
          .from('line_groups')
          .insert([
            {
              name: newGroupName.trim(),
              line_ids: selectedLinesForGroup,
              isExpanded: true
            }
          ])
          .select()
          .single();

        if (error) throw error;

        setLineGroups(prev => [...prev, data]);
        setNewGroupName('');
        setSelectedLinesForGroup([]);
        setShowGroupDialog(false);
        
        toast({
          title: 'Group Created',
          description: `${data.name} has been created with ${selectedLinesForGroup.length} lines`,
        });
      } catch (error) {
        console.error('Error creating line group:', error);
        toast({
          title: 'Error',
          description: 'Failed to create line group',
          variant: 'destructive',
        });
      }
    }
  };
  
  const handleToggleGroup = (groupId: string) => {
    setLineGroups(prev => prev.map(group => 
      group.id === groupId ? { ...group, isExpanded: !group.isExpanded } : group
    ));
  };
  
  const handleDeleteGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('line_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;

      setLineGroups(prev => prev.filter(group => group.id !== groupId));
      
      toast({
        title: 'Group Deleted',
        description: 'Line group has been deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting line group:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete line group',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveFromGroup = (lineId: string) => {
    setProductionLines(prev => prev.map(line => 
      line.id === lineId ? { ...line, groupId: undefined } : line
    ));
  };

  // Fetch planned orders from Supabase
  const fetchPlannedOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('planned_production')
        .select('*')
        .order('planned_date');

      if (error) {
        console.error('Error fetching planned orders:', error);
        // If table doesn't exist, just set empty array for now
        if (error.code === '42P01') {
          console.log('planned_production table does not exist yet, using empty array');
          setPlannedOrders([]);
          return;
        }
        return;
      }

      // Transform planned_production to match PlannedOrder interface
      const transformedData = (data || []).map(planned => ({
        id: planned.id,
        po_id: planned.purchase_id,
        line_id: planned.line_id,
        scheduled_date: planned.planned_date,
        quantity: planned.planned_quantity,
        status: planned.status
      }));

      // Consolidate orders for same PO on same date
      const consolidatedData: PlannedOrder[] = [];
      const consolidationMap = new Map<string, PlannedOrder>();

      for (const order of transformedData) {
        const key = `${order.po_id}-${order.line_id}-${order.scheduled_date}`;
        
        if (consolidationMap.has(key)) {
          // Merge quantities for same PO on same date
          const existing = consolidationMap.get(key)!;
          existing.quantity += order.quantity;
        } else {
          consolidationMap.set(key, { ...order });
        }
      }

      // Convert back to array
      consolidatedData.push(...consolidationMap.values());

      setPlannedOrders(consolidatedData);
    } catch (error) {
      console.error('Error fetching planned orders:', error);
      setPlannedOrders([]);
    }
  };

  // PO Context Menu Functions
  const hidePO = (po: PurchaseOrder) => {
    setHiddenPOIds(prev => new Set(prev).add(po.id));
    toast({
      title: 'PO Hidden',
      description: `${po.name} has been hidden`,
    });
  };

  const unhidePO = (po: PurchaseOrder) => {
    setHiddenPOIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(po.id);
      return newSet;
    });
    toast({
      title: 'PO Restored',
      description: `${po.name} has been restored`,
    });
  };

  const openSplitDialog = (po: PurchaseOrder) => {
    setPoToSplit(po);
    const totalQty = po.pending_qty || 0;
    setSplitQuantities([Math.floor(totalQty / 2), Math.ceil(totalQty / 2)]); // Default 50/50 split
    setShowSplitPODialog(true);
  };

  // Save split orders to Supabase split_orders table
  const saveSplitOrders = async (originalPO: PurchaseOrder, splitPOs: any[]) => {
    try {
      // First, delete any existing splits for this original PO
      const { error: deleteError } = await supabase
        .from('split_orders')
        .delete()
        .eq('original_po_id', originalPO.id);

      if (deleteError) {
        console.warn('Error deleting existing splits:', deleteError);
      }

      // Insert new split orders
      const splitRecords = splitPOs.map(split => ({
        original_po_id: originalPO.id,
        original_po_name: originalPO.name,
        split_name: split.name,
        split_index: parseInt(split.name.split('-S')[1]),
        quantity: split.pending_qty,
        partner_name: split.partner_name,
        date_order: split.date_order,
        amount_total: split.amount_total,
        state: split.state,
        order_lines: split.order_lines
      }));

      const { data, error } = await supabase
        .from('split_orders')
        .insert(splitRecords)
        .select();

      if (error) {
        console.error('Error saving split orders to Supabase:', error);
        // Fallback to localStorage
        const existingSplits = JSON.parse(localStorage.getItem('splitOrders') || '[]');
        const filteredSplits = existingSplits.filter((split: any) => split.original_po_id !== originalPO.id);
        const updatedSplits = [...filteredSplits, ...splitPOs];
        localStorage.setItem('splitOrders', JSON.stringify(updatedSplits));
        console.log('Split orders saved to localStorage as fallback');
      } else {
        console.log('Split orders saved to Supabase:', data.length, 'records');
      }
    } catch (error) {
      console.error('Error in saveSplitOrders:', error);
      // Fallback to localStorage
      try {
        const existingSplits = JSON.parse(localStorage.getItem('splitOrders') || '[]');
        const filteredSplits = existingSplits.filter((split: any) => split.original_po_id !== originalPO.id);
        const updatedSplits = [...filteredSplits, ...splitPOs];
        localStorage.setItem('splitOrders', JSON.stringify(updatedSplits));
        console.log('Split orders saved to localStorage as fallback');
      } catch (fallbackError) {
        console.error('Even localStorage fallback failed:', fallbackError);
      }
    }
  };

  // Load split orders from Supabase split_orders table
  const loadSplitOrders = async (): Promise<PurchaseOrder[]> => {
    try {
      const { data, error } = await supabase
        .from('split_orders')
        .select('*')
        .order('original_po_name', { ascending: true })
        .order('split_index', { ascending: true });

      if (error) {
        console.error('Error loading split orders from Supabase:', error);
        // Fallback to localStorage
        const splitOrders = JSON.parse(localStorage.getItem('splitOrders') || '[]');
        console.log('Loaded split orders from localStorage as fallback:', splitOrders.length);
        return splitOrders;
      }

      if (!data || data.length === 0) {
        console.log('No split orders found in Supabase');
        return [];
      }

      // Transform Supabase data back to PurchaseOrder format
      const splitOrders: PurchaseOrder[] = data.map(split => ({
        id: `split-${split.original_po_id}-S${split.split_index}`,
        name: split.split_name,
        partner_name: split.partner_name || '',
        date_order: split.date_order || '',
        amount_total: split.amount_total || 0,
        state: split.state || 'purchase',
        order_lines: split.order_lines || [],
        total_qty: split.quantity,
        pending_qty: split.quantity,
        is_split: true,
        original_po_id: split.original_po_id
      }));

      console.log('Loaded split orders from Supabase:', splitOrders.map(s => s.name));
      return splitOrders;
    } catch (error) {
      console.error('Error in loadSplitOrders:', error);
      // Fallback to localStorage
      try {
        const splitOrders = JSON.parse(localStorage.getItem('splitOrders') || '[]');
        console.log('Loaded split orders from localStorage as fallback:', splitOrders.length);
        return splitOrders;
      } catch (fallbackError) {
        console.error('Even localStorage fallback failed:', fallbackError);
        return [];
      }
    }
  };

  const handleSplitOrder = async () => {
    if (!poToSplit) return;

    try {
      const originalPO = poToSplit;
      
      // Create split orders using a separate storage approach
      const splitPOs = splitQuantities.map((quantity, index) => {
        const splitName = `${originalPO.name}-S${index + 1}`;
        
        // Calculate order lines for this split proportionally
        const splitOrderLines = originalPO.order_lines?.map(line => ({
          ...line,
          product_uom_qty: Math.round((line.product_uom_qty || 0) * (quantity / (originalPO.pending_qty || 1))),
          qty_received: 0 // Reset received quantity for splits
        })) || [];

        return {
          id: `split-${originalPO.id}-S${index + 1}`, // Unique split ID
          name: splitName,
          partner_name: originalPO.partner_name,
          date_order: originalPO.date_order,
          amount_total: Math.round((originalPO.amount_total || 0) * (quantity / (originalPO.pending_qty || 1))),
          state: 'purchase',
          order_lines: splitOrderLines,
          total_qty: quantity,
          pending_qty: quantity,
          is_split: true, // Mark as split order
          original_po_id: originalPO.id // Reference to original
        } as PurchaseOrder & { is_split: boolean; original_po_id: string };
      });

      // Store split orders separately in a custom table or local storage
      await saveSplitOrders(originalPO, splitPOs);

      // Remove original PO from the array and add split POs
      setPurchaseOrders(prev => {
        const filtered = prev.filter(po => po.id !== originalPO.id);
        return [...filtered, ...splitPOs];
      });

      // Update any planned production that references the original PO
      const plannedOrdersForOriginalPO = plannedOrders.filter(planned => planned.po_id === originalPO.name);
      
      if (plannedOrdersForOriginalPO.length > 0) {
        // Move all planned production to the first split (local state only for now)
        const firstSplitName = splitPOs[0].name;
        
        // Update local state
        setPlannedOrders(prev => 
          prev.map(planned => 
            planned.po_id === originalPO.name 
              ? { ...planned, po_id: firstSplitName }
              : planned
          )
        );
      }

      toast({
        title: 'Order Split Successfully',
        description: `${originalPO.name} has been split into ${splitQuantities.length} orders`,
      });

      setShowSplitPODialog(false);
      setPoToSplit(null);
      setSplitQuantities([]);

    } catch (error) {
      console.error('Error splitting order:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      toast({
        title: 'Error',
        description: `Failed to split the order: ${error.message || 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, po: PurchaseOrder) => {
    setDraggedPO(po);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Universal drop handler that routes to appropriate function
  const handleUniversalDrop = async (e: React.DragEvent, line: ProductionLine, date: Date) => {
    e.preventDefault();
    console.log('Universal drop called:', { 
      draggedPlannedOrder: !!draggedPlannedOrder, 
      draggedPO: !!draggedPO,
      line: line.name,
      date: date.toISOString().split('T')[0]
    });
    
    // For planned orders, allow dropping on holidays (we'll auto-skip to next working day)
    // For new POs, still enforce the working day restriction
    if (draggedPlannedOrder) {
      console.log('Routing to handlePlannedOrderDrop');
      await handlePlannedOrderDrop(e, line, date);
    } else if (draggedPO) {
      console.log('Routing to handleDrop (new PO)');
      await handleDrop(e, line, date);
    } else {
      console.log('No dragged item found');
    }
  };

  // Helper function to check if a date is a working day
  const isWorkingDay = (date: Date, lineId: string) => {
    return !isHoliday(date, lineId);
  };

  // Helper function to get available capacity for a specific date and line
  const getAvailableCapacity = (date: Date, lineId: string) => {
    const dateStr = date.toISOString().split('T')[0];
    const existingOrders = plannedOrders.filter(order => 
      order.line_id === lineId && order.scheduled_date === dateStr
    );
    const usedCapacity = existingOrders.reduce((sum, order) => sum + order.quantity, 0);
    const line = productionLines.find(l => l.id === lineId);
    return (line?.capacity || 0) - usedCapacity;
  };

  // Helper function to find conflicting orders on a date
  const getConflictingOrders = (date: Date, lineId: string) => {
    const dateStr = date.toISOString().split('T')[0];
    return plannedOrders.filter(order => 
      order.line_id === lineId && order.scheduled_date === dateStr
    );
  };

  // Helper function to reschedule conflicting orders
  const rescheduleConflictingOrders = async (conflictingOrders: PlannedOrder[], newStartDate: Date, lineId: string) => {
    const ordersToReschedule = [...conflictingOrders].sort((a, b) => 
      new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    );

    let currentDate = new Date(newStartDate);
    const rescheduledOrders: PlannedOrder[] = [];

    for (const order of ordersToReschedule) {
      // Find next available date for this order
      while (!isWorkingDay(currentDate, lineId) || getAvailableCapacity(currentDate, lineId) < order.quantity) {
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Update in database
      await supabase
        .from('planned_production')
        .update({ planned_date: dateStr })
        .eq('id', order.id);

      // Update local state
      const updatedOrder = { ...order, scheduled_date: dateStr };
      rescheduledOrders.push(updatedOrder);
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return rescheduledOrders;
  };

  // Main drop handler with advanced scheduling logic
  const handleDrop = async (e: React.DragEvent, line: ProductionLine, date: Date) => {
    e.preventDefault();
    
    if (!draggedPO || !isLineActive(line)) {
      setDraggedPO(null);
      return;
    }

    const totalQuantity = draggedPO.pending_qty || 0;
    const lineCapacity = line.capacity;
    
    if (totalQuantity <= 0) {
      toast({
        title: 'Invalid Quantity',
        description: 'Order has no pending quantity to schedule',
        variant: 'destructive',
      });
      setDraggedPO(null);
      return;
    }

    // Check if the target date is a working day
    if (!isWorkingDay(date, line.id)) {
      toast({
        title: 'Invalid Date',
        description: 'Cannot schedule on holidays',
        variant: 'destructive',
      });
      setDraggedPO(null);
      return;
    }

    try {

      // Calculate scheduling plan with collision detection
      let remainingQuantity = totalQuantity;
      let currentDate = new Date(date);
      const schedulingPlan: Array<{
        date: string;
        quantity: number;
      }> = [];
      const ordersToMove: PlannedOrder[] = [];

      // Schedule across multiple days if needed
      while (remainingQuantity > 0) {
        if (isWorkingDay(currentDate, line.id)) {
          const dateStr = currentDate.toISOString().split('T')[0];
          const conflictingOrders = getConflictingOrders(currentDate, line.id);
          const availableCapacityOnDate = getAvailableCapacity(currentDate, line.id);
          
          // Check if we need to move conflicting orders
          if (availableCapacityOnDate < remainingQuantity && conflictingOrders.length > 0) {
            // Move conflicting orders that would be displaced
            const capacityNeeded = Math.min(remainingQuantity, line.capacity);
            let capacityToFree = capacityNeeded - availableCapacityOnDate;
            
            for (const conflictingOrder of conflictingOrders) {
              if (capacityToFree <= 0) break;
              
              // Add to orders to move (avoid duplicates)
              if (!ordersToMove.some(order => order.id === conflictingOrder.id)) {
                ordersToMove.push(conflictingOrder);
                capacityToFree -= conflictingOrder.quantity;
              }
            }
          }
          
          // Calculate available capacity after moving conflicting orders
          const effectiveCapacity = Math.min(line.capacity, availableCapacityOnDate + 
            ordersToMove
              .filter(order => order.scheduled_date === dateStr && order.line_id === line.id)
              .reduce((sum, order) => sum + order.quantity, 0)
          );
          
          if (effectiveCapacity > 0) {
            const quantityToSchedule = Math.min(remainingQuantity, effectiveCapacity);
            
            schedulingPlan.push({
              date: dateStr,
              quantity: quantityToSchedule
            });

            remainingQuantity -= quantityToSchedule;
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
        
        // Safety check to prevent infinite loops
        if (currentDate > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) {
          break;
        }
      }

      // Move conflicting orders before scheduling new order
      if (ordersToMove.length > 0) {
        // Group moved orders by PO to consolidate them
        const movedOrdersByPO = new Map<string, {orders: PlannedOrder[], totalQuantity: number}>();
        
        for (const orderToMove of ordersToMove) {
          const poId = orderToMove.po_id;
          if (!movedOrdersByPO.has(poId)) {
            movedOrdersByPO.set(poId, {orders: [], totalQuantity: 0});
          }
          const group = movedOrdersByPO.get(poId)!;
          group.orders.push(orderToMove);
          group.totalQuantity += orderToMove.quantity;
        }
        
        // Track accumulated schedule across all moved orders for sequential scheduling
        const accumulatedSchedule = new Map<string, number>();
        
        // Add the new order's schedule to accumulated schedule
        for (const plan of schedulingPlan) {
          accumulatedSchedule.set(plan.date, (accumulatedSchedule.get(plan.date) || 0) + plan.quantity);
        }
        
        // Find the first available date after the new order
        let globalStartDate = new Date(schedulingPlan[schedulingPlan.length - 1]?.date || new Date());
        
        // Process each PO group sequentially to ensure no mixing
        for (const [poId, group] of movedOrdersByPO) {
          // Schedule this PO starting from the global start date
          let rescheduleDate = new Date(globalStartDate);
          let remainingToReschedule = group.totalQuantity;
          const reschedulePlan: Array<{date: string; quantity: number}> = [];
          
          while (remainingToReschedule > 0) {
            if (isWorkingDay(rescheduleDate, line.id)) {
              const dateStr = rescheduleDate.toISOString().split('T')[0];
              
              // Calculate available capacity considering accumulated schedule
              let usedCapacity = 0;
              
              // Add capacity from accumulated schedule (new order + previously scheduled moved orders)
              usedCapacity += accumulatedSchedule.get(dateStr) || 0;
              
              // Add capacity used by existing planned orders (excluding orders we're moving)
              const existingOrders = plannedOrders.filter(order => 
                order.line_id === line.id && 
                order.scheduled_date === dateStr &&
                !ordersToMove.some(moveOrder => moveOrder.id === order.id)
              );
              usedCapacity += existingOrders.reduce((sum, order) => sum + order.quantity, 0);
              
              const availableCapacity = Math.max(0, line.capacity - usedCapacity);
              
              if (availableCapacity > 0) {
                const quantityToSchedule = Math.min(remainingToReschedule, availableCapacity);
                reschedulePlan.push({
                  date: dateStr,
                  quantity: quantityToSchedule
                });
                
                // Update accumulated schedule
                accumulatedSchedule.set(dateStr, (accumulatedSchedule.get(dateStr) || 0) + quantityToSchedule);
                
                remainingToReschedule -= quantityToSchedule;
              }
            }
            
            rescheduleDate.setDate(rescheduleDate.getDate() + 1);
            
            // Safety check
            if (rescheduleDate > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) {
              break;
            }
          }
          
          // Update the moved order's schedule
          if (reschedulePlan.length > 0) {
            // Remove all old planned orders for this PO
            await supabase
              .from('planned_production')
              .delete()
              .in('id', group.orders.map(order => order.id));
            
            // Create new consolidated planned orders for rescheduled dates
            const rescheduledData = reschedulePlan.map((plan, index) => ({
              purchase_id: poId,
              line_id: line.id,
              planned_date: plan.date,
              planned_quantity: plan.quantity,
              status: 'planned',
              order_index: index
            }));
            
            await supabase
              .from('planned_production')
              .insert(rescheduledData);
            
            // Update global start date to start next PO after this one completes
            if (reschedulePlan.length > 0) {
              const lastDate = new Date(reschedulePlan[reschedulePlan.length - 1].date);
              lastDate.setDate(lastDate.getDate() + 1);
              globalStartDate = lastDate;
            }
          }
        }
        
        // Refresh planned orders
        await fetchPlannedOrders();
      }

      if (schedulingPlan.length === 0) {
        toast({
          title: 'No Available Capacity',
          description: 'No available capacity found for scheduling',
          variant: 'destructive',
        });
        setDraggedPO(null);
        return;
      }

      // Save to database
      const plannedProductionData = schedulingPlan.map((plan, index) => ({
        purchase_id: draggedPO.id,
        line_id: line.id,
        planned_date: plan.date,
        planned_quantity: plan.quantity,
        status: 'planned',
        order_index: index // Simple sequential index
      }));


      const { data, error } = await supabase
        .from('planned_production')
        .insert(plannedProductionData)
        .select();

      if (error) throw error;

      // Transform back to PlannedOrder format
      const transformedData = data.map(planned => ({
        id: planned.id,
        po_id: planned.purchase_id,
        line_id: planned.line_id,
        scheduled_date: planned.planned_date,
        quantity: planned.planned_quantity,
        status: planned.status
      }));

      setPlannedOrders(prev => [...prev, ...transformedData]);

      // Update PO state
      const scheduledQuantity = totalQuantity - remainingQuantity;
      const newPendingQty = Math.max(0, (draggedPO.pending_qty || 0) - scheduledQuantity);

      const { error: updateError } = await supabase
        .from('purchases')
        .update({ 
          pending_qty: newPendingQty,
          state: newPendingQty <= 0 ? 'planned' : 'purchase'
        })
        .eq('id', draggedPO.id);

      if (updateError) throw updateError;

      // Only update local PO state after successful database operation
      if (newPendingQty <= 0) {
        setPurchaseOrders(prev => prev.filter(po => po.id !== draggedPO.id));
      } else {
        setPurchaseOrders(prev => prev.map(po => 
          po.id === draggedPO.id ? { ...po, pending_qty: newPendingQty } : po
        ));
      }

      const dateRange = schedulingPlan.length > 1 
        ? `${schedulingPlan[0].date} to ${schedulingPlan[schedulingPlan.length - 1].date}`
        : schedulingPlan[0].date;

      const skipMessage = remainingQuantity > 0 ? ` (${remainingQuantity} units could not be scheduled)` : '';

      toast({
        title: 'Order Scheduled Successfully',
        description: `${draggedPO.name} (${scheduledQuantity} units) scheduled on ${line.name} from ${dateRange}${skipMessage}`,
      });

    } catch (error) {
      console.error('Error scheduling order:', error);
      toast({
        title: 'Scheduling Error',
        description: error instanceof Error ? error.message : 'Failed to schedule the order',
        variant: 'destructive',
      });
    }
    
    setDraggedPO(null);
  };

  // Handle selection of planned orders
  const handlePlannedOrderClick = (plannedOrder: PlannedOrder, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    // Get all blocks for the same PO
    const allBlocksForPO = plannedOrders.filter(order => order.po_id === plannedOrder.po_id);
    const blockIds = allBlocksForPO.map(order => order.id);

    if (event.ctrlKey || event.metaKey) {
      // Multi-select mode
      setIsMultiSelectMode(true);
      setSelectedPlannedOrders(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(plannedOrder.id)) {
          // Deselect all blocks for this PO
          blockIds.forEach(id => newSelection.delete(id));
        } else {
          // Select all blocks for this PO
          blockIds.forEach(id => newSelection.add(id));
        }
        return newSelection;
      });
    } else {
      // Single select - select all blocks for this PO
      setSelectedPlannedOrders(new Set(blockIds));
      setIsMultiSelectMode(blockIds.length > 1);
    }
  };

  // Move planned order back to sidebar
  const movePlannedOrderToSidebar = async (plannedOrder: PlannedOrder) => {
    try {
      // Find all blocks for the same PO
      const allBlocksForPO = plannedOrders.filter(order => order.po_id === plannedOrder.po_id);
      
      // Calculate total quantity from all blocks
      const totalQuantity = allBlocksForPO.reduce((sum, order) => sum + (order.quantity || 0), 0);
      
      // Delete all blocks from database first
      const { error: deleteError } = await supabase
        .from('planned_production')
        .delete()
        .eq('purchase_id', plannedOrder.po_id);

      if (deleteError) throw deleteError;

      // Fetch the purchase order from database to get current state
      const { data: purchaseData, error: fetchError } = await supabase
        .from('purchases')
        .select('*')
        .eq('id', plannedOrder.po_id)
        .single();

      if (fetchError) throw fetchError;

      if (purchaseData) {
        const newPendingQty = (purchaseData.pending_qty || 0) + totalQuantity;
        
        const { error: updateError } = await supabase
          .from('purchases')
          .update({ 
            pending_qty: newPendingQty,
            state: 'purchase'
          })
          .eq('id', plannedOrder.po_id);

        if (updateError) throw updateError;
      }

      // Remove all blocks for this PO from planned orders
      setPlannedOrders(prev => prev.filter(order => order.po_id !== plannedOrder.po_id));

      // Refresh purchase orders to show the moved order in sidebar
      await fetchPurchaseOrders();

      toast({
        title: 'Order Moved',
        description: `Complete order (${allBlocksForPO.length} blocks) moved back to sidebar`,
      });
    } catch (error) {
      console.error('Error moving planned order:', error);
      toast({
        title: 'Error',
        description: 'Failed to move planned order',
        variant: 'destructive',
      });
    }
  };

  // Handle right-click context menu for planned orders
  const handlePlannedOrderRightClick = (plannedOrder: PlannedOrder, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Create and show context menu
    const contextMenu = document.createElement('div');
    contextMenu.className = 'fixed bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    
    // Move back to sidebar option
    const moveMenuItem = document.createElement('button');
    moveMenuItem.className = 'block w-full text-left px-4 py-2 text-sm hover:bg-gray-100';
    moveMenuItem.textContent = 'Move back to sidebar';
    moveMenuItem.onclick = () => {
      movePlannedOrderToSidebar(plannedOrder);
      document.body.removeChild(contextMenu);
    };
    
    contextMenu.appendChild(moveMenuItem);
    document.body.appendChild(contextMenu);
    
    // Remove context menu when clicking elsewhere
    const removeMenu = () => {
      if (document.body.contains(contextMenu)) {
        document.body.removeChild(contextMenu);
      }
      document.removeEventListener('click', removeMenu);
    };
    
    setTimeout(() => document.addEventListener('click', removeMenu), 0);
  };

  // Handle dragging planned orders - always drag entire PO
  const handlePlannedOrderDragStart = (e: React.DragEvent, plannedOrder: PlannedOrder) => {
    console.log('🎯 Drag started for PO:', plannedOrder.po_id);
    
    // Always get all blocks for this PO
    const allBlocksForPO = plannedOrders.filter(order => order.po_id === plannedOrder.po_id);
    
    // If we have a multi-selection that includes orders from this PO, include all selected orders
    if (selectedPlannedOrders.has(plannedOrder.id)) {
      const selectedOrders = plannedOrders.filter(order => selectedPlannedOrders.has(order.id));
      
      // Group selected orders by PO to get complete POs
      const selectedPOIds = new Set(selectedOrders.map(order => order.po_id));
      const completeSelectedOrders = plannedOrders.filter(order => selectedPOIds.has(order.po_id));
      
      console.log('📦 Multi-select drag with', selectedPOIds.size, 'complete POs');
      
      setDraggedPlannedOrder(plannedOrder);
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'multiple-complete-pos',
        orders: completeSelectedOrders
      }));
    } else {
      // Single PO drag - include all blocks of this PO
      console.log('📦 Single PO drag with', allBlocksForPO.length, 'blocks');
      
      setDraggedPlannedOrder(plannedOrder);
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'single-complete-po',
        orders: allBlocksForPO
      }));
    }
    e.dataTransfer.effectAllowed = 'move';
  };

  // Clear selection when clicking elsewhere
  const clearSelection = () => {
    setSelectedPlannedOrders(new Set());
    setIsMultiSelectMode(false);
  };

  // Handle dropping onto existing planned order blocks (shows dialog)
  const handleOrderBlockDrop = (e: React.DragEvent, targetOrder: PlannedOrder, targetLine: ProductionLine, targetDate: Date) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedPO) return;

    // Show dialog asking where to place the order
    setDropDialogData({
      targetOrder,
      targetDate,
      targetLine
    });
    setShowDropPositionDialog(true);
  };

  // Handle the dialog choice confirmation
  const handleDropPositionConfirm = async (choice: 'plan-right-away' | 'plan-after') => {
    setIsManualScheduling(true);
    const { targetOrder, targetDate, targetLine } = dropDialogData;
    
    if (!draggedPO || !targetOrder || !targetDate || !targetLine) {
      console.error('Missing required data for drop position confirmation');
      return;
    }

    try {
      if (choice === 'plan-right-away') {
        // New PO takes priority - reschedule conflicting orders
        const conflictingOrders = getConflictingOrders(targetDate, targetLine.id);
        
        // Schedule the new PO first
        const totalQuantity = draggedPO.pending_qty || 0;
        let remainingQuantity = totalQuantity;
        let currentDate = new Date(targetDate);
        const schedulingPlan: Array<{ date: string; quantity: number; }> = [];

        // Plan the new PO
        while (remainingQuantity > 0) {
          if (isWorkingDay(currentDate, targetLine.id)) {
            const plannedQuantity = Math.min(remainingQuantity, targetLine.capacity);
            
            schedulingPlan.push({
              date: currentDate.toISOString().split('T')[0],
              quantity: plannedQuantity
            });

            remainingQuantity -= plannedQuantity;
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Remove conflicting orders from database and local state
        for (const conflictOrder of conflictingOrders) {
          await supabase
            .from('planned_production')
            .delete()
            .eq('id', conflictOrder.id);
        }
        
        setPlannedOrders(prev => 
          prev.filter(order => !conflictingOrders.some(conflict => conflict.id === order.id))
        );

        // Schedule new PO
        const plannedProductionData = schedulingPlan.map((plan, index) => ({
          purchase_id: draggedPO.id,
          line_id: targetLine.id,
          planned_date: plan.date,
          planned_quantity: plan.quantity,
          status: 'planned',
          order_index: index
        }));

        const { data, error } = await supabase
          .from('planned_production')
          .insert(plannedProductionData)
          .select();

        if (error) throw error;

        // Add new planned orders to state
        const transformedData = data.map(planned => ({
          id: planned.id,
          po_id: planned.purchase_id,
          line_id: planned.line_id,
          scheduled_date: planned.planned_date,
          quantity: planned.planned_quantity,
          status: planned.status
        }));

        setPlannedOrders(prev => [...prev, ...transformedData]);

        // Find next available date after new PO ends
        const lastPlannedDate = new Date(schedulingPlan[schedulingPlan.length - 1].date);
        lastPlannedDate.setDate(lastPlannedDate.getDate() + 1);

        // Reschedule conflicting orders after the new PO
        await rescheduleConflictingOrders(conflictingOrders, lastPlannedDate, targetLine.id);

        toast({
          title: 'Order Prioritized',
          description: `${draggedPO.name} scheduled with priority. Existing orders rescheduled.`,
        });

      } else if (choice === 'plan-after') {
        // Schedule after existing orders, utilizing remaining capacity
        const allOrdersForTargetPO = plannedOrders.filter(order => order.po_id === targetOrder.po_id);
        const sortedTargetOrders = allOrdersForTargetPO.sort((a, b) => 
          new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
        );
        
        const lastOrder = sortedTargetOrders[sortedTargetOrders.length - 1];
        const lastDate = new Date(lastOrder.scheduled_date);
        
        // Check remaining capacity on last day
        const remainingCapacityOnLastDay = getAvailableCapacity(lastDate, targetLine.id);
        
        let startDate = new Date(lastDate);
        let totalQuantity = draggedPO.pending_qty || 0;

        // Use remaining capacity on last day if available
        if (remainingCapacityOnLastDay > 0) {
          const quantityToUseOnLastDay = Math.min(totalQuantity, remainingCapacityOnLastDay);
          
          // Add to existing day
          const additionalPlan = {
            purchase_id: draggedPO.id,
            line_id: targetLine.id,
            planned_date: lastDate.toISOString().split('T')[0],
            planned_quantity: quantityToUseOnLastDay,
            status: 'planned',
            order_index: 0
          };

          const { data: additionalData, error: additionalError } = await supabase
            .from('planned_production')
            .insert([additionalPlan])
            .select();

          if (!additionalError && additionalData) {
            const transformedAdditional = additionalData.map(planned => ({
              id: planned.id,
              po_id: planned.purchase_id,
              line_id: planned.line_id,
              scheduled_date: planned.planned_date,
              quantity: planned.planned_quantity,
              status: planned.status
            }));

            setPlannedOrders(prev => [...prev, ...transformedAdditional]);
            totalQuantity -= quantityToUseOnLastDay;
          }
        }

        // Schedule remaining quantity on subsequent days
        if (totalQuantity > 0) {
          startDate.setDate(startDate.getDate() + 1);
          
          const tempPO = { ...draggedPO, pending_qty: totalQuantity };
          setDraggedPO(tempPO);
          await handleDrop(new Event('drop') as any, targetLine, startDate);
        }

        toast({
          title: 'Order Scheduled After',
          description: `${draggedPO.name} scheduled after existing orders.`,
        });
      }

      // Update PO state
      const newPendingQty = 0; // Assuming full quantity is scheduled
      const { error: updateError } = await supabase
        .from('purchases')
        .update({ 
          pending_qty: newPendingQty,
          state: 'planned'
        })
        .eq('id', draggedPO.id);

      if (updateError) throw updateError;

      // Only update local state after successful database operation
      setPurchaseOrders(prev => prev.filter(po => po.id !== draggedPO.id));

    } catch (error) {
      console.error('Error in drop position confirmation:', error);
      toast({
        title: 'Scheduling Error',
        description: 'Failed to schedule the order',
        variant: 'destructive',
      });
    } finally {
      setIsManualScheduling(false);
      setShowDropPositionDialog(false);
      setDropDialogData({ targetOrder: null, targetDate: null, targetLine: null });
      setDraggedPO(null);
    }
  };

  // Helper function to find next working day
  const findNextWorkingDay = (startDate: Date, lineId: string) => {
    let currentDate = new Date(startDate);
    while (!isWorkingDay(currentDate, lineId)) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return currentDate;
  };

  // Handle dropping planned orders to new dates with smart placement
  const handlePlannedOrderDrop = async (e: React.DragEvent, line: ProductionLine, date: Date) => {
    e.preventDefault();
    console.log('🎯 Drop handler called for', line.name, 'on', date.toISOString().split('T')[0]);
    
    if (draggedPlannedOrder) {
      try {
        // Check what type of move this is
        const dragData = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
        const ordersToMove = dragData.orders || [draggedPlannedOrder];
        console.log('📦 Moving', ordersToMove.length, 'orders');

        // Sort orders by their current date to maintain sequence
        const sortedOrders = ordersToMove.sort((a, b) => 
          new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
        );

        // Find the starting working day
        let currentDate = findNextWorkingDay(date, line.id);
        
        console.log('Moving PO:', {
          originalDate: date.toISOString().split('T')[0],
          newStartDate: currentDate.toISOString().split('T')[0],
          ordersToMove: ordersToMove.length,
          poIds: [...new Set(ordersToMove.map(o => o.po_id))]
        });
        
        // Always proceed with the move, even if the date seems the same
        // This handles cases where user drags within the same PO range
        
        const updates = [];
        let moveCount = 0;
        const lineCapacity = line.capacity;
        
        // Track daily capacity usage during placement
        const dailyUsage = new Map();

        // Get existing orders on this line that are NOT being moved (for capacity calculation)
        const poIdsToMove = [...new Set(ordersToMove.map(order => order.po_id))];
        const existingOrdersOnLine = plannedOrders.filter(order => 
          order.line_id === line.id && !poIdsToMove.includes(order.po_id)
        );
        
        // Add existing orders to daily usage calculation
        existingOrdersOnLine.forEach(order => {
          const currentUsage = dailyUsage.get(order.scheduled_date) || 0;
          dailyUsage.set(order.scheduled_date, currentUsage + order.quantity);
        });

        // Group ALL orders being moved by their ORIGINAL scheduled date (cross-PO consolidation)
        const ordersByOriginalDate = new Map();
        sortedOrders.forEach(order => {
          const dateKey = order.scheduled_date;
          if (!ordersByOriginalDate.has(dateKey)) {
            ordersByOriginalDate.set(dateKey, []);
          }
          ordersByOriginalDate.get(dateKey).push(order);
        });

        console.log('📅 Original date groups:', Object.fromEntries(
          Array.from(ordersByOriginalDate.entries()).map(([date, orders]) => [
            date, 
            orders.map(o => `${o.po_id}(${o.quantity})`).join(', ')
          ])
        ));

        // Process orders by original date to maintain cross-PO consolidation
        let placementDate = new Date(currentDate);
        
        for (const [originalDate, dateGroup] of ordersByOriginalDate) {
          placementDate = findNextWorkingDay(placementDate, line.id);
          
          // Calculate total quantity for all orders on this original date
          const totalQuantityForDate = dateGroup.reduce((sum, order) => sum + order.quantity, 0);
          
          console.log(`📦 Processing date group ${originalDate}: ${dateGroup.length} orders, total qty: ${totalQuantityForDate}`);
          
          // Try to fit all orders from this original date on the same new date
          let attempts = 0;
          let placed = false;
          
          while (!placed && attempts < 30) {
            const dateString = placementDate.toISOString().split('T')[0];
            const currentUsage = dailyUsage.get(dateString) || 0;
            const availableCapacity = lineCapacity - currentUsage;
            
            console.log(`📊 Trying ${dateString}: capacity ${lineCapacity}, used ${currentUsage}, available ${availableCapacity}, need ${totalQuantityForDate}`);
            
            if (totalQuantityForDate <= availableCapacity) {
              // All orders from this original date can fit together
              console.log(`✅ Placing all orders from ${originalDate} on ${dateString}`);
              
              dateGroup.forEach(order => {
                updates.push({
                  id: order.id,
                  line_id: line.id,
                  planned_date: dateString
                });
                moveCount++;
              });
              
              // Update daily usage tracking
              dailyUsage.set(dateString, currentUsage + totalQuantityForDate);
              placed = true;
              
              // Move to next working day for next date group
              placementDate.setDate(placementDate.getDate() + 1);
              placementDate = findNextWorkingDay(placementDate, line.id);
            } else {
              // Can't fit together, try next day
              console.log(`❌ Cannot fit on ${dateString}, trying next day`);
              placementDate.setDate(placementDate.getDate() + 1);
              placementDate = findNextWorkingDay(placementDate, line.id);
              attempts++;
            }
          }
          
          // If we couldn't maintain consolidation after reasonable attempts, fall back to individual placement
          if (!placed) {
            console.log(`⚠️ Failed to maintain consolidation for ${originalDate}, placing individually`);
            
            for (const order of dateGroup) {
              let individualPlacementDate = new Date(placementDate);
              let individualPlaced = false;
              
              while (!individualPlaced) {
                individualPlacementDate = findNextWorkingDay(individualPlacementDate, line.id);
                const dateString = individualPlacementDate.toISOString().split('T')[0];
                const currentUsage = dailyUsage.get(dateString) || 0;
                const availableCapacity = lineCapacity - currentUsage;
                
                if (order.quantity <= availableCapacity) {
                  updates.push({
                    id: order.id,
                    line_id: line.id,
                    planned_date: dateString
                  });
                  
                  dailyUsage.set(dateString, currentUsage + order.quantity);
                  moveCount++;
                  individualPlaced = true;
                } else {
                  individualPlacementDate.setDate(individualPlacementDate.getDate() + 1);
                }
              }
            }
          }
        }
        
        console.log('📊 Daily capacity usage after accounting for existing orders:', 
          Object.fromEntries(dailyUsage.entries()));
        
        // Now delete all existing blocks for the POs being moved to avoid conflicts
        
        for (const poId of poIdsToMove) {
          const { error: deleteError } = await supabase
            .from('planned_production')
            .delete()
            .eq('purchase_id', poId);

          if (deleteError) throw deleteError;
        }

        // Then create new blocks at the new positions
        const newBlocks = updates.map((update, index) => ({
          purchase_id: ordersToMove.find(order => order.id === update.id)?.po_id,
          line_id: update.line_id,
          planned_date: update.planned_date,
          planned_quantity: ordersToMove.find(order => order.id === update.id)?.quantity || 0,
          status: 'planned',
          order_index: index
        }));

        const { data: insertedData, error: insertError } = await supabase
          .from('planned_production')
          .insert(newBlocks)
          .select();

        if (insertError) throw insertError;

        // Update local state - remove old orders and add new ones
        setPlannedOrders(prev => {
          // Remove all orders for the moved POs
          const filteredOrders = prev.filter(order => !poIdsToMove.includes(order.po_id));
          
          // Transform inserted data to match PlannedOrder interface
          const newPlannedOrders = (insertedData || []).map(inserted => ({
            id: inserted.id,
            po_id: inserted.purchase_id,
            line_id: inserted.line_id,
            scheduled_date: inserted.planned_date,
            quantity: inserted.planned_quantity,
            status: inserted.status
          }));
          
          // Return filtered orders plus new orders
          return [...filteredOrders, ...newPlannedOrders];
        });

        // Clear selection after successful move
        setSelectedPlannedOrders(new Set());
        setIsMultiSelectMode(false);

        // Count unique POs moved
        const uniquePOs = new Set(ordersToMove.map(order => order.po_id));
        const poCount = uniquePOs.size;
        
        toast({
          title: 'Purchase Orders Moved',
          description: `${poCount} complete PO${poCount > 1 ? 's' : ''} (${moveCount} block${moveCount > 1 ? 's' : ''}) moved to ${line.name} starting ${date.toLocaleDateString()} (holidays skipped)`,
        });

      } catch (error) {
        console.error('Error moving planned orders:', error);
        toast({
          title: 'Move Error',
          description: 'Failed to move the planned orders',
          variant: 'destructive',
        });
      }
    }
    
    setDraggedPlannedOrder(null);
  };

  // Auto-scroll to current date on component mount
  useEffect(() => {
    fetchPurchaseOrders();
    fetchProductionLines();
    fetchHolidays();
    fetchLineGroups();
    fetchPlannedOrders();
  }, []);

  // Auto-scroll to current date when calendar is ready
  useEffect(() => {
    if (currentDateIndex >= 0) {
      const timer = setTimeout(() => {
        const currentDateElement = document.getElementById(`date-${currentDateIndex}`);
        if (currentDateElement) {
          currentDateElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest', 
            inline: 'center' 
          });
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [currentDateIndex, productionLines.length]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'maintenance': return 'bg-yellow-500';
      case 'offline': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getCapacityColor = (current: number = 0, capacity: number) => {
    const percentage = (current / capacity) * 100;
    if (percentage < 70) return 'text-green-600';
    if (percentage < 90) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getLineStatus = (line: ProductionLine) => {
    return line.status || 'active';
  };

  const isLineActive = (line: ProductionLine) => {
    return getLineStatus(line) === 'active';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50" onClick={clearSelection}>
      <div className="p-6 space-y-6">
        {/* Header with Management Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg">
              <Calendar className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                Production Planner
              </h1>
              <p className="text-lg text-gray-600 mt-2">
                Advanced production scheduling with holiday and grouping support
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Management Buttons */}
            <Button
              onClick={() => setShowLineDialog(true)}
              variant="outline"
              className="bg-white shadow-sm"
            >
              <Settings className="mr-2 h-4 w-4" />
              Lines
            </Button>
            <Button
              onClick={() => setShowHolidayDialog(true)}
              variant="outline"
              className="bg-white shadow-sm"
            >
              <Calendar className="mr-2 h-4 w-4" />
              Holidays
            </Button>
            <Button
              onClick={() => setShowGroupDialog(true)}
              variant="outline"
              className="bg-white shadow-sm"
            >
              <Users className="mr-2 h-4 w-4" />
              Groups
            </Button>
            <Button
              onClick={syncPurchaseOrders}
              disabled={isLoading}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {isLoading ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync POs
            </Button>
          </div>
        </div>

        {/* PO Controls and Filters */}
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-sm rounded-xl p-4 border-0 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search purchase orders..."
                value={poSearchTerm}
                onChange={(e) => setPoSearchTerm(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button
              onClick={() => setShowHiddenPOs(!showHiddenPOs)}
              variant={showHiddenPOs ? "default" : "outline"}
              size="sm"
            >
              {showHiddenPOs ? 'Hide Hidden' : 'Show Hidden'} ({hiddenPOIds.size})
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>{filteredPurchaseOrders.length} POs</span>
            <span>•</span>
            <span>{holidays.length} holidays</span>
            <span>•</span>
            <span>{lineGroups.length} groups</span>
            {isMultiSelectMode && (
              <>
                <span>•</span>
                <span className="text-blue-600 font-medium">
                  {selectedPlannedOrders.size} selected
                </span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Enhanced Purchase Orders Sidebar */}
          <Card className="lg:col-span-1 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Package className="h-5 w-5 text-blue-600" />
                  <span>Purchase Orders</span>
                </div>
                <Badge variant="secondary">{filteredPurchaseOrders.length}</Badge>
              </CardTitle>
              <CardDescription>
                Drag to schedule on calendar. Right-click for options.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                {filteredPurchaseOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No purchase orders found</p>
                    <Button
                      onClick={syncPurchaseOrders}
                      variant="outline"
                      className="mt-4"
                    >
                      Sync from Odoo
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredPurchaseOrders.map((po) => (
                      <HoverCard key={po.id}>
                        <HoverCardTrigger asChild>
                          <div
                            draggable
                            onDragStart={(e) => handleDragStart(e, po)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setPoContextMenu({ po, x: e.clientX, y: e.clientY });
                            }}
                            className={`p-3 bg-white rounded-lg border transition-all cursor-move ${
                              hiddenPOIds.has(po.id) 
                                ? 'border-gray-200 opacity-50' 
                                : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="font-medium text-gray-900 text-sm truncate">{po.name}</h4>
                                {hiddenPOIds.has(po.id) && (
                                  <Badge variant="secondary" className="text-xs">Hidden</Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 truncate font-medium">{po.partner_name}</p>
                              <div className="flex items-center space-x-2">
                                <Badge variant="outline" className="text-xs">
                                  Total: {po.total_qty?.toLocaleString() || 0}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Pending: {po.pending_qty?.toLocaleString() || 0}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80">
                          <div className="space-y-3">
                            <div>
                              <h4 className="font-semibold">{po.name}</h4>
                              <p className="text-sm text-gray-600">{po.partner_name}</p>
                              <p className="text-xs text-gray-500">Date: {new Date(po.date_order).toLocaleDateString()}</p>
                            </div>
                            <div>
                              <h5 className="font-medium text-sm mb-2">Order Line Items:</h5>
                              {po.order_lines && po.order_lines.length > 0 ? (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {po.order_lines.map((line, index) => (
                                    <div key={index} className="p-2 bg-gray-50 rounded text-xs">
                                      <div className="font-medium">{line.product_name}</div>
                                      <div className="text-gray-600">
                                        Product Qty: {line.product_uom_qty?.toLocaleString() || 0} | 
                                        Qty Received: {line.qty_received?.toLocaleString() || 0}
                                      </div>
                                      {line.product_category && (
                                        <div className="text-gray-500">Category: {line.product_category}</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500">No order line items</p>
                              )}
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Enhanced Production Calendar */}
          <Card className="lg:col-span-3 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CalendarDays className="h-5 w-5 text-green-600" />
                  <span>Production Calendar</span>
                </div>
                <div className="text-sm text-gray-600">
                  {dates.length} days • {dates[0]?.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} to {dates[dates.length - 1]?.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
              </CardTitle>
              <CardDescription>
                Drop POs onto lines. Holiday-aware scheduling with automatic conflict resolution.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[600px]" id="calendar-container">
                <div className="min-w-max">
                  {/* Date Headers */}
                  <div className="sticky top-0 z-30 bg-white border-b-2 border-gray-200 shadow-sm flex">
                    <div className="sticky left-0 z-40 w-48 bg-white border-r-2 border-gray-300 shadow-lg">
                      <div className="h-16 p-3 flex items-center justify-center bg-gradient-to-r from-blue-50 to-blue-100">
                        <span className="font-bold text-sm text-gray-800">Production Lines</span>
                      </div>
                    </div>
                    
                    <div className="flex">
                      {dates.map((date, index) => (
                        <div
                          key={date.toISOString()}
                          id={`date-${index}`}
                          className={`w-32 h-16 p-2 border-r border-gray-200 flex flex-col justify-center items-center text-center relative ${
                            isToday(date) 
                              ? 'bg-blue-100 border-blue-300 ring-2 ring-blue-400' 
                              : isHoliday(date)
                                ? 'bg-red-100 border-red-300'
                              : isWeekend(date) 
                                ? 'bg-orange-50 border-orange-200' 
                                : isPastDate(date)
                                  ? 'bg-gray-50 border-gray-300'
                                  : 'bg-white'
                          }`}
                        >
                          {isToday(date) && (
                            <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          )}
                          {isHoliday(date) && (
                            <div className="absolute top-1 left-1 w-2 h-2 bg-red-500 rounded-full"></div>
                          )}
                          <div className={`text-xs font-semibold uppercase ${
                            isToday(date) ? 'text-blue-700' : 
                            isHoliday(date) ? 'text-red-700' :
                            isPastDate(date) ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {date.toLocaleDateString('en-US', { weekday: 'short' })}
                          </div>
                          <div className={`text-sm font-bold mt-1 ${
                            isToday(date) ? 'text-blue-800' : 
                            isHoliday(date) ? 'text-red-800' :
                            isPastDate(date) ? 'text-gray-500' : 'text-gray-800'
                          }`}>
                            {date.getDate()}
                          </div>
                          <div className={`text-xs mt-0.5 ${
                            isToday(date) ? 'text-blue-600' : 
                            isHoliday(date) ? 'text-red-600' :
                            isPastDate(date) ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {date.toLocaleDateString('en-US', { month: 'short' })}
                          </div>
                          {isToday(date) && (
                            <div className="text-xs text-blue-600 font-semibold">Today</div>
                          )}
                          {isHoliday(date) && !isToday(date) && (
                            <div className="text-xs text-red-600 font-semibold">Holiday</div>
                          )}
                          {isWeekend(date) && !isToday(date) && !isHoliday(date) && (
                            <div className="text-xs text-orange-600 font-semibold">Weekend</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Grouped Production Lines */}
                  {Object.entries(groupedLines.groupedMap).map(([groupId, groupLines]) => {
                    const group = lineGroups.find(g => g.id === groupId);
                    return (
                      <div key={groupId}>
                        {/* Group Header */}
                        <div className="flex border-b border-gray-300 bg-gray-100/50">
                          <div className="sticky left-0 z-20 w-48 bg-gray-100 border-r-2 border-gray-300 shadow-md">
                            <div className="h-12 p-3 flex items-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleGroup(groupId)}
                                className="p-0 h-auto mr-2"
                              >
                                {group?.isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                              <span className="font-bold text-gray-800 text-sm">{group?.name}</span>
                              <Badge variant="secondary" className="ml-2 text-xs">{groupLines.length}</Badge>
                            </div>
                          </div>
                          <div className="flex">
                            {dates.map((date, index) => (
                              <div key={index} className="w-32 h-12 border-r border-gray-200 bg-gray-100/50"></div>
                            ))}
                          </div>
                        </div>

                        {/* Group Lines (if expanded) */}
                        {group?.isExpanded && groupLines.map(line => (
                          <div key={line.id} className="flex border-b border-gray-200">
                            <div className="sticky left-0 z-20 w-48 bg-white border-r-2 border-gray-300 shadow-md">
                              <div className="h-20 p-3 flex flex-col justify-center bg-gradient-to-r from-gray-50 to-gray-100">
                                <div className="space-y-1">
                                  <div className="font-bold text-gray-800 text-sm">{line.name}</div>
                                  <div className="text-xs text-gray-600">
                                    Cap: <span className="font-semibold text-gray-800">{line.capacity}</span>
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Load: <span className={`font-semibold ${getCapacityColor(line.current_load || 0, line.capacity)}`}>
                                      {line.current_load || 0}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex">
                              {dates.map((date, index) => {
                                const dateString = date.toISOString().split('T')[0];
                                const ordersOnDate = plannedOrders.filter(order => 
                                  order.line_id === line.id && order.scheduled_date === dateString
                                );
                                
                                return (
                                  <div
                                    key={`${line.id}-${date.toISOString()}`}
                                    className={`w-32 h-20 border-r border-gray-200 relative transition-all duration-200 ${
                                      isToday(date)
                                        ? 'bg-blue-50 border-blue-200'
                                        : isHoliday(date, line.id)
                                          ? 'bg-red-50/70'
                                        : isWeekend(date)
                                          ? 'bg-orange-50/50'
                                          : isPastDate(date)
                                            ? 'bg-gray-50/70'
                                            : !isLineActive(line)
                                              ? 'bg-gray-100/50'
                                              : 'bg-white hover:bg-blue-50'
                                    }`}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleUniversalDrop(e, line, date)}
                                  >
                                    {/* Planned Orders */}
                                    <div className="p-1 space-y-1 overflow-hidden">
                                      {ordersOnDate.map((planned) => {
                                        // Try both matching strategies
                                        let relatedPO = purchaseOrders.find(po => po.name === planned.po_id);
                                        if (!relatedPO) {
                                          relatedPO = purchaseOrders.find(po => po.id === planned.po_id);
                                        }
                                        
                                        return (
                                          <HoverCard key={planned.id}>
                                            <HoverCardTrigger asChild>
                                              <div
                                                draggable
                                                onClick={(e) => handlePlannedOrderClick(planned, e)}
                                                onContextMenu={(e) => handlePlannedOrderRightClick(planned, e)}
                                                onDragStart={(e) => handlePlannedOrderDragStart(e, planned)}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => {
                                                  // If we're dragging a planned order (not a new PO), let it bubble up to the calendar cell
                                                  if (draggedPlannedOrder && !draggedPO) {
                                                    e.stopPropagation(); // Prevent calendar cell from handling it
                                                    handleUniversalDrop(e, line, date); // Handle it here instead
                                                    return;
                                                  }
                                                  handleOrderBlockDrop(e, planned, line, date);
                                                }}
                                                className={`text-xs p-1 rounded cursor-move transition-colors ${
                                                  selectedPlannedOrders.has(planned.id)
                                                    ? 'bg-blue-200 border border-blue-400 shadow-md'
                                                    : 'bg-green-100 border border-green-300 hover:bg-green-200'
                                                } ${
                                                  draggedPlannedOrder && 
                                                  plannedOrders.some(order => 
                                                    order.po_id === draggedPlannedOrder.po_id && order.id === planned.id
                                                  ) ? 'opacity-50' : ''
                                                }`}
                                              >
                                                <div className="font-medium truncate">{planned.po_id}</div>
                                                <div className="text-xs opacity-75">{planned.quantity?.toLocaleString()}</div>
                                              </div>
                                            </HoverCardTrigger>
                                            <HoverCardContent className="w-80">
                                              <div className="space-y-3">
                                                <div>
                                                  <h4 className="font-semibold">{planned.po_id}</h4>
                                                  <p className="text-sm text-gray-600">{relatedPO?.partner_name || 'Unknown Partner'}</p>
                                                  <p className="text-xs text-gray-500">
                                                    Line: {productionLines.find(l => l.id === planned.line_id)?.name || 'Unknown Line'}
                                                  </p>
                                                  <p className="text-xs text-gray-500">
                                                    Date: {new Date(planned.scheduled_date).toLocaleDateString()}
                                                  </p>
                                                  <p className="text-xs text-gray-500">
                                                    Status: <span className="capitalize">{planned.status}</span>
                                                  </p>
                                                </div>
                                                <div>
                                                  <h5 className="font-medium text-sm mb-2">Production Details:</h5>
                                                  <div className="p-2 bg-gray-50 rounded text-xs">
                                                    <div className="font-medium">Planned Quantity: {planned.quantity?.toLocaleString()}</div>
                                                    <div className="text-gray-600">
                                                      Total PO Quantity: {relatedPO?.total_qty?.toLocaleString() || 0}
                                                    </div>
                                                    <div className="text-gray-600">
                                                      Remaining: {relatedPO?.pending_qty?.toLocaleString() || 0}
                                                    </div>
                                                  </div>
                                                </div>
                                                {relatedPO?.order_lines && relatedPO.order_lines.length > 0 && (
                                                  <div>
                                                    <h5 className="font-medium text-sm mb-2">Order Line Items:</h5>
                                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                                      {relatedPO.order_lines.map((line, index) => (
                                                        <div key={index} className="p-2 bg-gray-50 rounded text-xs">
                                                          <div className="font-medium">{line.product_name}</div>
                                                          <div className="text-gray-600">
                                                            Product Qty: {line.product_uom_qty?.toLocaleString() || 0} | 
                                                            Qty Received: {line.qty_received?.toLocaleString() || 0}
                                                          </div>
                                                          {line.product_category && (
                                                            <div className="text-gray-500">Category: {line.product_category}</div>
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            </HoverCardContent>
                                          </HoverCard>
                                        );
                                      })}
                                    </div>

                                    {/* Indicators */}
                                    {isToday(date) && (
                                      <div className="absolute top-1 left-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                    )}
                                    {isHoliday(date, line.id) && (
                                      <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></div>
                                    )}
                                    {!ordersOnDate.length && !isWeekend(date) && !isPastDate(date) && !isHoliday(date, line.id) && isLineActive(line) && (
                                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                        <Plus className="h-4 w-4 text-gray-400" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {/* Ungrouped Lines */}
                  {groupedLines.ungroupedLines.map(line => (
                    <div key={line.id} className="flex border-b border-gray-200">
                      <div className="sticky left-0 z-20 w-48 bg-white border-r-2 border-gray-300 shadow-md">
                        <div className="h-20 p-3 flex flex-col justify-center bg-gradient-to-r from-gray-50 to-gray-100">
                          <div className="space-y-1">
                            <div className="font-bold text-gray-800 text-sm">{line.name}</div>
                            <div className="text-xs text-gray-600">
                              Cap: <span className="font-semibold text-gray-800">{line.capacity}</span>
                            </div>
                            <div className="text-xs text-gray-600">
                              Load: <span className={`font-semibold ${getCapacityColor(line.current_load || 0, line.capacity)}`}>
                                {line.current_load || 0}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex">
                        {dates.map((date, index) => {
                          const dateString = date.toISOString().split('T')[0];
                          const ordersOnDate = plannedOrders.filter(order => 
                            order.line_id === line.id && order.scheduled_date === dateString
                          );
                          
                          return (
                            <div
                              key={`${line.id}-${date.toISOString()}`}
                              className={`w-32 h-20 border-r border-gray-200 relative transition-all duration-200 ${
                                isToday(date)
                                  ? 'bg-blue-50 border-blue-200'
                                  : isHoliday(date, line.id)
                                    ? 'bg-red-50/70'
                                  : isWeekend(date)
                                    ? 'bg-orange-50/50'
                                    : isPastDate(date)
                                      ? 'bg-gray-50/70'
                                      : !isLineActive(line)
                                        ? 'bg-gray-100/50'
                                        : 'bg-white hover:bg-blue-50'
                              }`}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleUniversalDrop(e, line, date)}
                            >
                              {/* Planned Orders */}
                              <div className="p-1 space-y-1 overflow-hidden">
                                {ordersOnDate.map((planned) => {
                                  // Try both matching strategies
                                  let relatedPO = purchaseOrders.find(po => po.name === planned.po_id);
                                  if (!relatedPO) {
                                    relatedPO = purchaseOrders.find(po => po.id === planned.po_id);
                                  }
                                  return (
                                    <HoverCard key={planned.id}>
                                      <HoverCardTrigger asChild>
                                        <div
                                          draggable
                                          onClick={(e) => handlePlannedOrderClick(planned, e)}
                                          onContextMenu={(e) => handlePlannedOrderRightClick(planned, e)}
                                          onDragStart={(e) => handlePlannedOrderDragStart(e, planned)}
                                          onDragOver={handleDragOver}
                                          onDrop={(e) => {
                                            // If we're dragging a planned order (not a new PO), let it bubble up to the calendar cell
                                            if (draggedPlannedOrder && !draggedPO) {
                                              e.stopPropagation(); // Prevent calendar cell from handling it
                                              handleUniversalDrop(e, line, date); // Handle it here instead
                                              return;
                                            }
                                            handleOrderBlockDrop(e, planned, line, date);
                                          }}
                                          className={`text-xs p-1 rounded cursor-move transition-colors ${
                                            selectedPlannedOrders.has(planned.id)
                                              ? 'bg-blue-200 border border-blue-400 shadow-md'
                                              : 'bg-green-100 border border-green-300 hover:bg-green-200'
                                          } ${
                                            draggedPlannedOrder && 
                                            plannedOrders.some(order => 
                                              order.po_id === draggedPlannedOrder.po_id && order.id === planned.id
                                            ) ? 'opacity-50' : ''
                                          }`}
                                        >
                                          <div className="font-medium truncate">{planned.po_id}</div>
                                          <div className="text-xs opacity-75">{planned.quantity?.toLocaleString()}</div>
                                        </div>
                                      </HoverCardTrigger>
                                      <HoverCardContent className="w-80">
                                        <div className="space-y-3">
                                          <div>
                                            <h4 className="font-semibold">{planned.po_id}</h4>
                                            <p className="text-sm text-gray-600">{relatedPO?.partner_name || 'Unknown Partner'}</p>
                                            <p className="text-xs text-gray-500">
                                              Line: {productionLines.find(l => l.id === planned.line_id)?.name || 'Unknown Line'}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                              Date: {new Date(planned.scheduled_date).toLocaleDateString()}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                              Status: <span className="capitalize">{planned.status}</span>
                                            </p>
                                          </div>
                                          <div>
                                            <h5 className="font-medium text-sm mb-2">Production Details:</h5>
                                            <div className="p-2 bg-gray-50 rounded text-xs">
                                              <div className="font-medium">Planned Quantity: {planned.quantity?.toLocaleString()}</div>
                                              <div className="text-gray-600">
                                                Total PO Quantity: {relatedPO?.total_qty?.toLocaleString() || 0}
                                              </div>
                                              <div className="text-gray-600">
                                                Remaining: {relatedPO?.pending_qty?.toLocaleString() || 0}
                                              </div>
                                            </div>
                                          </div>
                                          {relatedPO?.order_lines && relatedPO.order_lines.length > 0 && (
                                            <div>
                                              <h5 className="font-medium text-sm mb-2">Order Line Items:</h5>
                                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {relatedPO.order_lines.map((line, index) => (
                                                  <div key={index} className="p-2 bg-gray-50 rounded text-xs">
                                                    <div className="font-medium">{line.product_name}</div>
                                                    <div className="text-gray-600">
                                                      Product Qty: {line.product_uom_qty?.toLocaleString() || 0} | 
                                                      Qty Received: {line.qty_received?.toLocaleString() || 0}
                                                    </div>
                                                    {line.product_category && (
                                                      <div className="text-gray-500">Category: {line.product_category}</div>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </HoverCardContent>
                                    </HoverCard>
                                  );
                                })}
                              </div>

                              {/* Indicators */}
                              {isToday(date) && (
                                <div className="absolute top-1 left-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                              )}
                              {isHoliday(date, line.id) && (
                                <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></div>
                              )}
                              {!ordersOnDate.length && !isWeekend(date) && !isPastDate(date) && !isHoliday(date, line.id) && isLineActive(line) && (
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                  <Plus className="h-4 w-4 text-gray-400" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Planned Orders Summary */}
        {plannedOrders.length > 0 && (
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="h-5 w-5 text-purple-600" />
                  <span>Planned Orders</span>
                </div>
                <Badge variant="secondary">{plannedOrders.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {plannedOrders.slice(0, 8).map((planned) => {
                  const line = productionLines.find(l => l.id === planned.line_id);
                  return (
                    <div key={planned.id} className="p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200 hover:shadow-md transition-shadow">
                      <div className="space-y-2">
                        <div className="font-medium text-sm text-gray-900 truncate">{planned.po_id}</div>
                        <div className="text-xs text-gray-600">{line?.name}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">
                            {planned.quantity?.toLocaleString() || '0'}
                          </span>
                          <Badge className="bg-green-100 text-green-800 text-xs">
                            {planned.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(planned.scheduled_date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Management Dialogs */}
      {/* Line Management Dialog */}
      <Dialog open={showLineDialog} onOpenChange={setShowLineDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Production Lines</DialogTitle>
            <DialogDescription>
              Create, edit, and manage production lines
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add New Line Form */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium mb-3">Add New Line</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Line Name</label>
                  <Input
                    value={newLineName}
                    onChange={(e) => setNewLineName(e.target.value)}
                    placeholder="Enter line name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Daily Capacity</label>
                  <Input
                    type="number"
                    value={newLineCapacity}
                    onChange={(e) => setNewLineCapacity(parseInt(e.target.value) || 0)}
                    placeholder="Daily capacity"
                  />
                </div>
              </div>
              <Button onClick={handleAddLine} className="mt-3" disabled={!newLineName.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
            </div>

            {/* Existing Lines */}
            <div className="space-y-3">
              <h4 className="font-medium">Existing Lines</h4>
              {productionLines.map((line) => (
                <div key={line.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
                  {editingLineId === line.id ? (
                    <div className="flex items-center gap-3 flex-1">
                      <Input
                        value={editingLineName}
                        onChange={(e) => setEditingLineName(e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        value={editingLineCapacity}
                        onChange={(e) => setEditingLineCapacity(parseInt(e.target.value) || 0)}
                        className="w-24"
                      />
                      <Button size="sm" onClick={handleSaveInlineEdit}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingLineId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="font-medium">{line.name}</div>
                        <div className="text-sm text-gray-600">
                          Capacity: {line.capacity}/day • Load: {line.current_load || 0} • Efficiency: {line.efficiency || 100}%
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(getLineStatus(line))}`}></div>
                          <span className="text-xs text-gray-500 capitalize">{getLineStatus(line)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingLineId(line.id);
                            setEditingLineName(line.name);
                            setEditingLineCapacity(line.capacity);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteLine(line.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Holiday Management Dialog */}
      <Dialog open={showHolidayDialog} onOpenChange={setShowHolidayDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Holidays</DialogTitle>
            <DialogDescription>
              Add holidays and manage production calendar
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add Holiday Form */}
            <div className="space-y-4">
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <h4 className="font-medium mb-3">Add New Holiday</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Holiday Name</label>
                    <Input
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      placeholder="Enter holiday name"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Select Dates</label>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const today = new Date();
                            const currentMonth = today.getMonth();
                            const currentYear = today.getFullYear();
                            const weekends = [];
                            
                            // Get all weekends in current month
                            for (let day = 1; day <= 31; day++) {
                              const date = new Date(currentYear, currentMonth, day);
                              if (date.getMonth() !== currentMonth) break;
                              if (date.getDay() === 0 || date.getDay() === 6) { // Sunday or Saturday
                                weekends.push(date);
                              }
                            }
                            setSelectedDates(weekends);
                          }}
                          disabled={isCreatingHolidays}
                        >
                          This Month's Weekends
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedDates([])}
                          disabled={selectedDates.length === 0}
                        >
                          Clear All
                        </Button>
                      </div>
                    </div>
                    <CalendarComponent
                      mode="multiple"
                      selected={selectedDates}
                      onSelect={(dates) => setSelectedDates(dates || [])}
                      className="rounded-md border"
                    />
                    {selectedDates.length > 0 && (
                      <div className="mt-2 p-3 bg-blue-50 rounded border">
                        <p className="text-sm font-medium text-blue-800 mb-2">
                          {selectedDates.length} date{selectedDates.length === 1 ? '' : 's'} selected
                        </p>
                        <div className="max-h-32 overflow-y-auto">
                          <div className="flex flex-wrap gap-1">
                            {selectedDates
                              .sort((a, b) => a.getTime() - b.getTime())
                              .map((date, index) => (
                                <div
                                  key={index}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                                >
                                  <span>{date.toLocaleDateString()}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedDates(prev => prev.filter(d => d.getTime() !== date.getTime()));
                                    }}
                                    className="text-blue-600 hover:text-blue-800 ml-1"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                        {selectedDates.length > 1 && (
                          <div className="mt-2 text-xs text-blue-600">
                            All selected dates will be created with the same holiday name and settings
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="global-holiday"
                        checked={isGlobalHoliday}
                        onCheckedChange={setIsGlobalHoliday}
                      />
                      <label htmlFor="global-holiday" className="text-sm font-medium">
                        Global Holiday (affects all lines)
                      </label>
                    </div>
                    {!isGlobalHoliday && (
                      <div>
                        <label className="text-sm font-medium">Select Lines</label>
                        <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2">
                          {productionLines.map((line) => (
                            <div key={line.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`line-${line.id}`}
                                checked={selectedHolidayLines.includes(line.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedHolidayLines(prev => [...prev, line.id]);
                                  } else {
                                    setSelectedHolidayLines(prev => prev.filter(id => id !== line.id));
                                  }
                                }}
                              />
                              <label htmlFor={`line-${line.id}`} className="text-sm">
                                {line.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <Button 
                    onClick={handleAddHoliday} 
                    disabled={!newHolidayName.trim() || selectedDates.length === 0 || isCreatingHolidays}
                    className="w-full"
                  >
                    {isCreatingHolidays ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        {selectedDates.length > 1 
                          ? `Add Holidays (${selectedDates.length} dates)`
                          : 'Add Holiday'
                        }
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Existing Holidays */}
            <div className="space-y-4">
              <h4 className="font-medium">Existing Holidays</h4>
              <ScrollArea className="h-96">
                <div className="space-y-3 pr-4">
                  {holidays.map((holiday) => (
                    <div key={holiday.id} className="p-3 border rounded-lg bg-white">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{holiday.name}</div>
                          <div className="text-sm text-gray-600">
                            {holiday.date.toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {holiday.isGlobal ? 'Global holiday' : `Affects ${holiday.affectedLineIds?.length || 0} lines`}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteHoliday(holiday.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Management Dialog */}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Line Groups</DialogTitle>
            <DialogDescription>
              Create and manage production line groups
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add New Group Form */}
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h4 className="font-medium mb-3">Create New Group</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Group Name</label>
                  <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Enter group name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Select Lines</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2 bg-white">
                    {productionLines.filter(line => 
                      !lineGroups.some(group => group.line_ids.includes(line.id))
                    ).map((line) => (
                      <div key={line.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`group-line-${line.id}`}
                          checked={selectedLinesForGroup.includes(line.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedLinesForGroup(prev => [...prev, line.id]);
                            } else {
                              setSelectedLinesForGroup(prev => prev.filter(id => id !== line.id));
                            }
                          }}
                        />
                        <label htmlFor={`group-line-${line.id}`} className="text-sm">
                          {line.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <Button 
                  onClick={handleCreateGroup} 
                  disabled={!newGroupName.trim() || selectedLinesForGroup.length === 0}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group
                </Button>
              </div>
            </div>

            {/* Existing Groups */}
            <div className="space-y-3">
              <h4 className="font-medium">Existing Groups</h4>
              {lineGroups.map((group) => (
                <div key={group.id} className="p-3 border rounded-lg bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{group.name}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteGroup(group.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-sm text-gray-600">
                    Lines: {group.line_ids.map(lineId => {
                      const line = productionLines.find(l => l.id === lineId);
                      return line?.name;
                    }).filter(Boolean).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PO Context Menu */}
      {poContextMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[150px]"
          style={{ left: poContextMenu.x, top: poContextMenu.y }}
          onMouseLeave={() => setPoContextMenu(null)}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
            onClick={() => {
              openSplitDialog(poContextMenu.po);
              setPoContextMenu(null);
            }}
          >
            Split Order
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
            onClick={() => {
              hidePO(poContextMenu.po);
              setPoContextMenu(null);
            }}
          >
            Hide Order
          </button>
          {hiddenPOIds.has(poContextMenu.po.id) && (
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
              onClick={() => {
                unhidePO(poContextMenu.po);
                setPoContextMenu(null);
              }}
            >
              Unhide Order
            </button>
          )}
        </div>
      )}

      {/* Drop Position Dialog */}
      <Dialog open={showDropPositionDialog} onOpenChange={setShowDropPositionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scheduling Conflict Detected</DialogTitle>
            <DialogDescription>
              There are existing orders on this date. How would you like to schedule your order?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-sm mb-2">Order to Schedule:</h4>
              <p className="text-sm">{draggedPO?.name}</p>
              <p className="text-xs text-gray-600">Quantity: {draggedPO?.pending_qty?.toLocaleString()}</p>
              <p className="text-xs text-gray-600">Partner: {draggedPO?.partner_name}</p>
            </div>
            
            <div className="space-y-3">
              <Button
                variant="default"
                className="w-full justify-start"
                onClick={() => handleDropPositionConfirm('plan-right-away')}
              >
                <div className="text-left">
                  <div className="font-medium">Plan Right Away</div>
                  <div className="text-xs opacity-75">This order takes priority. Existing orders will be rescheduled.</div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleDropPositionConfirm('plan-after')}
              >
                <div className="text-left">
                  <div className="font-medium">Plan After</div>
                  <div className="text-xs opacity-75">Schedule after existing orders, using remaining capacity.</div>
                </div>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PO Split Dialog */}
      <Dialog open={showSplitPODialog} onOpenChange={setShowSplitPODialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split Purchase Order</DialogTitle>
            <DialogDescription>
              Split {poToSplit?.name} into multiple orders
            </DialogDescription>
          </DialogHeader>
          {poToSplit && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Total Quantity: {poToSplit.pending_qty}</label>
              </div>
              <div className="space-y-2">
                {splitQuantities.map((qty, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <label className="text-sm w-20">Split {index + 1}:</label>
                    <Input
                      type="number"
                      value={qty}
                      onChange={(e) => {
                        const newQuantities = [...splitQuantities];
                        newQuantities[index] = parseInt(e.target.value) || 0;
                        setSplitQuantities(newQuantities);
                      }}
                      className="flex-1"
                    />
                    {splitQuantities.length > 2 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSplitQuantities(prev => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => setSplitQuantities(prev => [...prev, 0])}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Split
              </Button>
              <div className="text-sm text-gray-600">
                Total: {splitQuantities.reduce((sum, qty) => sum + qty, 0)} / {poToSplit.pending_qty}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSplitPODialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSplitOrder}
              disabled={splitQuantities.reduce((sum, qty) => sum + qty, 0) !== poToSplit?.pending_qty}
            >
              Split Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
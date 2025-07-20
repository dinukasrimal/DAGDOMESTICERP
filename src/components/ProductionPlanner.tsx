

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

interface Holiday {
  id: string;
  name: string;
  date: string;
  line_ids?: string[];
  is_global: boolean;
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [isGlobalHoliday, setIsGlobalHoliday] = useState(true);
  const [selectedHolidayLines, setSelectedHolidayLines] = useState<string[]>([]);
  
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
  }, [purchaseOrders, poSearchTerm, hiddenPOIds, showHiddenPOs]);

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
      if (holiday.date === dateStr) {
        if (holiday.is_global) return true;
        if (lineId && holiday.line_ids?.includes(lineId)) return true;
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
      // Fetch purchase orders excluding those in purchase_holds
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .not('id', 'in', `(SELECT purchase_id FROM purchase_holds)`)
        .order('date_order', { ascending: false })
        .limit(1000);

      if (error) throw error;

      if (data) {
        const transformedData: PurchaseOrder[] = data.map(purchase => {
          const orderLines = Array.isArray(purchase.order_lines) ? purchase.order_lines : [];
          // Total quantity: Sum of product_qty from order lines
          const totalQty = orderLines.reduce((sum, line) => sum + (line.product_qty || 0), 0);
          // Pending quantity: Use pending_qty from purchases table
          const pendingQty = purchase.pending_qty || 0;
          
          return {
            id: purchase.id,
            name: purchase.name || '',
            partner_name: purchase.partner_name || '',
            date_order: purchase.date_order || '',
            amount_total: purchase.amount_total || 0,
            state: purchase.state || '',
            order_lines: orderLines,
            total_qty: totalQty,
            pending_qty: pendingQty
          };
        });
        
        // Show purchase orders (excluding those on hold)
        setPurchaseOrders(transformedData);
        console.log(`Loaded ${transformedData.length} purchase orders (excluding holds)`);
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
      const { error } = await supabase
        .from('production_lines')
        .delete()
        .eq('id', lineId);

      if (error) throw error;

      setProductionLines(prev => prev.filter(line => line.id !== lineId));
      setPlannedOrders(prev => prev.filter(order => order.line_id !== lineId));
      
      toast({
        title: 'Line Deleted',
        description: 'Production line has been deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting production line:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete production line',
        variant: 'destructive',
      });
    }
  };

  // Fetch holidays from Supabase
  const fetchHolidays = async () => {
    try {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .order('date');

      if (error) {
        console.error('Error fetching holidays:', error);
        return;
      }

      setHolidays(data || []);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  };

  // Holiday management functions
  const handleAddHoliday = async () => {
    if (selectedDate && newHolidayName.trim()) {
      // Check if there are any planned orders on the selected date
      const dateStr = selectedDate.toISOString().split('T')[0];
      const affectedOrders = plannedOrders.filter(order => 
        order.scheduled_date === dateStr && 
        (isGlobalHoliday || selectedHolidayLines.includes(order.line_id))
      );

      if (affectedOrders.length > 0) {
        const confirmMove = window.confirm(
          `This holiday will affect ${affectedOrders.length} planned orders. Do you want to continue and reschedule them?`
        );
        
        if (!confirmMove) return;
      }

      try {
        const { data, error } = await supabase
          .from('holidays')
          .insert([
            {
              name: newHolidayName.trim(),
              date: dateStr,
              is_global: isGlobalHoliday,
              line_ids: isGlobalHoliday ? [] : selectedHolidayLines
            }
          ])
          .select()
          .single();

        if (error) throw error;

        setHolidays(prev => [...prev, data]);
        
        // Move affected orders to the next available date
        if (affectedOrders.length > 0) {
          // Implementation for moving orders would go here
          console.log('Moving affected orders:', affectedOrders);
        }

        setNewHolidayName('');
        setSelectedDate(undefined);
        setIsGlobalHoliday(true);
        setSelectedHolidayLines([]);
        setShowHolidayDialog(false);
        
        toast({
          title: 'Holiday Added',
          description: `${data.name} has been added for ${dateStr}`,
        });
      } catch (error) {
        console.error('Error adding holiday:', error);
        toast({
          title: 'Error',
          description: 'Failed to add holiday',
          variant: 'destructive',
        });
      }
    }
  };
  
  const handleDeleteHoliday = async (holidayId: string) => {
    try {
      const { error } = await supabase
        .from('holidays')
        .delete()
        .eq('id', holidayId);

      if (error) throw error;

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

      setPlannedOrders(transformedData);
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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, po: PurchaseOrder) => {
    setDraggedPO(po);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, line: ProductionLine, date: Date) => {
    e.preventDefault();
    
    if (draggedPO && isLineActive(line)) {
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

      // Check if the target date is a holiday or weekend
      if (isHoliday(date, line.id) || isWeekend(date)) {
        toast({
          title: 'Invalid Date',
          description: 'Cannot schedule on holidays or weekends',
          variant: 'destructive',
        });
        setDraggedPO(null);
        return;
      }

      // Get existing orders for this line and date
      const dateString = date.toISOString().split('T')[0];
      const existingOrders = plannedOrders.filter(order => 
        order.line_id === line.id && order.scheduled_date === dateString
      );
      const usedCapacity = existingOrders.reduce((sum, order) => sum + order.quantity, 0);
      const availableCapacity = lineCapacity - usedCapacity;

      try {
        let plannedDays: Array<{
          po_id: string;
          line_id: string;
          scheduled_date: string;
          quantity: number;
          status: 'planned';
        }> = [];

        let remainingQuantity = totalQuantity;
        let currentDate = new Date(date);

        // Schedule across multiple days if needed
        while (remainingQuantity > 0) {
          const dateStr = currentDate.toISOString().split('T')[0];
          
          // Skip holidays and weekends
          if (isHoliday(currentDate, line.id) || isWeekend(currentDate)) {
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
          }

          // Get available capacity for this date
          const existingOrdersOnDate = plannedOrders.filter(order => 
            order.line_id === line.id && order.scheduled_date === dateStr
          );
          const usedCapacityOnDate = existingOrdersOnDate.reduce((sum, order) => sum + order.quantity, 0);
          const availableCapacityOnDate = lineCapacity - usedCapacityOnDate;

          if (availableCapacityOnDate > 0) {
            const quantityToSchedule = Math.min(remainingQuantity, availableCapacityOnDate);
            
            plannedDays.push({
              po_id: draggedPO.name,
              line_id: line.id,
              scheduled_date: dateStr,
              quantity: quantityToSchedule,
              status: 'planned'
            });

            remainingQuantity -= quantityToSchedule;
          }

          currentDate.setDate(currentDate.getDate() + 1);
          
          // Prevent infinite loops
          if (currentDate > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) {
            break;
          }
        }

        if (plannedDays.length === 0) {
          toast({
            title: 'No Available Capacity',
            description: 'No available capacity found for scheduling',
            variant: 'destructive',
          });
          setDraggedPO(null);
          return;
        }

        // Save to database - transform to planned_production format
        const plannedProductionData = plannedDays.map(day => ({
          purchase_id: day.po_id,
          line_id: day.line_id,
          planned_date: day.scheduled_date,
          planned_quantity: day.quantity,
          status: day.status,
          order_index: 0
        }));

        const { data, error } = await supabase
          .from('planned_production')
          .insert(plannedProductionData)
          .select();

        if (error) throw error;

        // Update local state - transform back to PlannedOrder format
        const transformedData = data.map(planned => ({
          id: planned.id,
          po_id: planned.purchase_id,
          line_id: planned.line_id,
          scheduled_date: planned.planned_date,
          quantity: planned.planned_quantity,
          status: planned.status
        }));
        setPlannedOrders(prev => [...prev, ...transformedData]);

        // Update PO pending quantity
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

        // Update local PO state
        if (newPendingQty <= 0) {
          setPurchaseOrders(prev => prev.filter(po => po.id !== draggedPO.id));
        } else {
          setPurchaseOrders(prev => prev.map(po => 
            po.id === draggedPO.id ? { ...po, pending_qty: newPendingQty } : po
          ));
        }

        const dateRange = plannedDays.length > 1 
          ? `${plannedDays[0].scheduled_date} to ${plannedDays[plannedDays.length - 1].scheduled_date}`
          : plannedDays[0].scheduled_date;

        const skipMessage = remainingQuantity > 0 ? ` (${remainingQuantity} units could not be scheduled)` : '';

        toast({
          title: 'Order Scheduled',
          description: `${draggedPO.name} (${scheduledQuantity} units) scheduled on ${line.name} from ${dateRange}${skipMessage}`,
        });

      } catch (error) {
        console.error('Error scheduling order:', error);
        toast({
          title: 'Scheduling Error',
          description: 'Failed to schedule the order',
          variant: 'destructive',
        });
      }
    }
    
    setDraggedPO(null);
  };

  // Handle dragging planned orders
  const handlePlannedOrderDragStart = (e: React.DragEvent, plannedOrder: PlannedOrder) => {
    setDraggedPlannedOrder(plannedOrder);
    e.dataTransfer.effectAllowed = 'move';
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
  const handleDropPositionConfirm = async (choice: 'where-dropped' | 'after-order') => {
    setIsManualScheduling(true);
    const { targetOrder, targetDate, targetLine } = dropDialogData;
    
    if (!draggedPO || !targetOrder || !targetDate || !targetLine) {
      console.error('Missing required data for drop position confirmation');
      return;
    }

    try {
      if (choice === 'where-dropped') {
        // Schedule at the exact date where dropped
        await handleDrop(new Event('drop') as any, targetLine, targetDate);
      } else if (choice === 'after-order') {
        // Find the last day of the target order and use remaining capacity
        const allOrdersForTargetPO = plannedOrders.filter(order => order.po_id === targetOrder.po_id);
        const sortedTargetOrders = allOrdersForTargetPO.sort((a, b) => 
          new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
        );
        
        const lastOrder = sortedTargetOrders[sortedTargetOrders.length - 1];
        const lastDate = new Date(lastOrder.scheduled_date);
        
        // Calculate remaining capacity on the last day
        const lastDateStr = lastDate.toISOString().split('T')[0];
        const allOrdersOnLastDay = plannedOrders.filter(order => 
          order.line_id === targetLine.id && order.scheduled_date === lastDateStr
        );
        const usedCapacityOnLastDay = allOrdersOnLastDay.reduce((sum, order) => sum + order.quantity, 0);
        const remainingCapacityOnLastDay = targetLine.capacity - usedCapacityOnLastDay;
        
        console.log('📊 Total quantity calculation:', {
          po: draggedPO.name,
          pendingQty: draggedPO.pending_qty,
          remainingCapacity: remainingCapacityOnLastDay
        });

        if (remainingCapacityOnLastDay > 0) {
          // Start scheduling after the last day
          const afterDate = new Date(lastDate);
          afterDate.setDate(afterDate.getDate() + 1);
          await handleDrop(new Event('drop') as any, targetLine, afterDate);
        } else {
          // No quantity to schedule
          toast({
            title: 'No Quantity Available',
            description: `No pending quantity found for ${draggedPO.name}`,
            variant: 'destructive',
          });
        }
      }
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
    }
  };

  // Handle dropping planned orders to new dates
  const handlePlannedOrderDrop = async (e: React.DragEvent, line: ProductionLine, date: Date) => {
    e.preventDefault();
    
    if (draggedPlannedOrder) {
      try {
        const dateString = date.toISOString().split('T')[0];
        
        // Update the planned order
        const { error } = await supabase
          .from('planned_production')
          .update({
            line_id: line.id,
            planned_date: dateString
          })
          .eq('id', draggedPlannedOrder.id);

        if (error) throw error;

        // Update local state
        setPlannedOrders(prev => 
          prev.map(order => 
            order.id === draggedPlannedOrder.id 
              ? { ...order, line_id: line.id, scheduled_date: dateString }
              : order
          )
        );

        toast({
          title: 'Order Moved',
          description: `Order moved to ${line.name} on ${date.toLocaleDateString()}`,
        });
      } catch (error) {
        console.error('Error moving planned order:', error);
        toast({
          title: 'Move Error',
          description: 'Failed to move the planned order',
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50">
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
                                        Product Qty: {line.product_qty?.toLocaleString() || 0} | 
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
                                    onDrop={(e) => handleDrop(e, line, date)}
                                  >
                                    {/* Planned Orders */}
                                    <div className="p-1 space-y-1 overflow-hidden">
                                      {ordersOnDate.map((planned) => (
                                        <div
                                          key={planned.id}
                                          draggable
                                          onDragStart={(e) => handlePlannedOrderDragStart(e, planned)}
                                          className="text-xs p-1 bg-green-100 border border-green-300 rounded cursor-move hover:bg-green-200 transition-colors"
                                        >
                                          <div className="font-medium truncate">{planned.po_id}</div>
                                          <div className="text-xs opacity-75">{planned.quantity}</div>
                                        </div>
                                      ))}
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
                              onDrop={(e) => handleDrop(e, line, date)}
                            >
                              {/* Planned Orders */}
                              <div className="p-1 space-y-1 overflow-hidden">
                                {ordersOnDate.map((planned) => (
                                  <div
                                    key={planned.id}
                                    draggable
                                    onDragStart={(e) => handlePlannedOrderDragStart(e, planned)}
                                    className="text-xs p-1 bg-green-100 border border-green-300 rounded cursor-move hover:bg-green-200 transition-colors"
                                  >
                                    <div className="font-medium truncate">{planned.po_id}</div>
                                    <div className="text-xs opacity-75">{planned.quantity}</div>
                                  </div>
                                ))}
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
                            {planned.quantity.toLocaleString()}
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
                    <label className="text-sm font-medium">Date</label>
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      className="rounded-md border"
                    />
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
                    disabled={!newHolidayName.trim() || !selectedDate}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Holiday
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
                            {new Date(holiday.date).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {holiday.is_global ? 'Global holiday' : `Affects ${holiday.line_ids?.length || 0} lines`}
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
            <DialogTitle>Choose Drop Position</DialogTitle>
            <DialogDescription>
              How would you like to schedule this order?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleDropPositionConfirm('where-dropped')}
            >
              Schedule at dropped date
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleDropPositionConfirm('after-order')}
            >
              Schedule after existing order
            </Button>
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
              onClick={() => {
                // Handle split logic here
                setShowSplitPODialog(false);
              }}
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
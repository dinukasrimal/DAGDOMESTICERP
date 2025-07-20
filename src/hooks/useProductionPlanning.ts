import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { 
  Purchase, 
  PurchaseOrderLine, 
  ProductionLine, 
  PlannedProduction, 
  Holiday,
  PlanningResult,
  DayPlan
} from '@/types/planning';

export const useProductionPlanning = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Data states
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [orderLines, setOrderLines] = useState<PurchaseOrderLine[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [plannedProduction, setPlannedProduction] = useState<PlannedProduction[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // Fetch available purchases (not in holds)
  const fetchAvailablePurchases = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .not('id', 'in', `(SELECT purchase_id FROM purchase_holds)`)
        .eq('state', 'purchase')
        .order('date_order', { ascending: true });
      setPurchases(data || []);
    } catch (error) {
      console.error('Error fetching purchases:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch purchase orders',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Fetch order lines for a specific purchase
  const fetchOrderLines = useCallback(async (purchaseId: string) => {
    try {
      const { data, error } = await supabase
        .from('purchase_order_lines')
        .select('*')
        .eq('purchase_id', purchaseId)
        .order('product_name');

      if (error) throw error;
      setOrderLines(data || []);
    } catch (error) {
      console.error('Error fetching order lines:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch order lines',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Fetch order lines for tooltip (returns data instead of setting state)
  const fetchOrderLinesForTooltip = useCallback(async (purchaseId: string): Promise<PurchaseOrderLine[]> => {
    try {
      const { data, error } = await supabase
        .from('purchase_order_lines')
        .select('*')
        .eq('purchase_id', purchaseId)
        .order('product_name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching order lines for tooltip:', error);
      return [];
    }
  }, []);

  // Fetch production lines
  const fetchProductionLines = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('production_lines')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProductionLines(data || []);
    } catch (error) {
      console.error('Error fetching production lines:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch production lines',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Fetch planned production
  const fetchPlannedProduction = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('planned_production')
        .select(`
          *,
          purchases(*),
          production_lines(*)
        `)
        .order('planned_date')
        .order('order_index');

      if (error) throw error;
      setPlannedProduction(data || []);
    } catch (error) {
      console.error('Error fetching planned production:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch planned production',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Fetch holidays
  const fetchHolidays = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('holidays')
        .select('*')
        .order('date');

      if (error) throw error;
      setHolidays(data || []);
    } catch (error) {
      console.error('Error fetching holidays:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch holidays',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Create production line
  const createProductionLine = useCallback(async (name: string, capacity: number, description?: string) => {
    try {
      const { data, error } = await supabase
        .from('production_lines')
        .insert([{
          name,
          capacity,
          description,
          is_active: true
        }])
        .select()
        .single();

      if (error) throw error;

      setProductionLines(prev => [...prev, data]);
      toast({
        title: 'Success',
        description: `Production line ${name} created successfully`,
      });

      return data;
    } catch (error) {
      console.error('Error creating production line:', error);
      toast({
        title: 'Error',
        description: 'Failed to create production line',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  // Update production line capacity
  const updateProductionLineCapacity = useCallback(async (lineId: string, capacity: number) => {
    try {
      const { error } = await supabase
        .from('production_lines')
        .update({ capacity })
        .eq('id', lineId);

      if (error) throw error;

      setProductionLines(prev => 
        prev.map(line => 
          line.id === lineId ? { ...line, capacity } : line
        )
      );

      // Recalculate all plans for this line
      await recalculatePlansForLine(lineId);

      toast({
        title: 'Success',
        description: 'Production line capacity updated and plans recalculated',
      });
    } catch (error) {
      console.error('Error updating production line:', error);
      toast({
        title: 'Error',
        description: 'Failed to update production line',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Calculate planning for a purchase order
  const calculatePlanning = useCallback((
    purchase: Purchase,
    lineId: string,
    startDate: Date,
    existingPlans: PlannedProduction[] = []
  ): PlanningResult => {
    const line = productionLines.find(l => l.id === lineId);
    if (!line) {
      return { success: false, message: 'Production line not found' };
    }

    const days: DayPlan[] = [];
    let remainingQuantity = purchase.pending_qty;
    let currentDate = new Date(startDate);

    while (remainingQuantity > 0) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Skip weekends and holidays
      const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;
      const isHoliday = holidays.some(h => h.date === dateStr);
      
      if (!isWeekend && !isHoliday) {
        // Calculate used capacity for this date
        const plansForDate = existingPlans.filter(p => 
          p.line_id === lineId && p.planned_date === dateStr
        );
        const usedCapacity = plansForDate.reduce((sum, p) => sum + p.planned_quantity, 0);
        const availableCapacity = line.capacity - usedCapacity;

        if (availableCapacity > 0) {
          const plannedQuantity = Math.min(remainingQuantity, availableCapacity);
          days.push({
            date: dateStr,
            quantity: plannedQuantity,
            remainingCapacity: availableCapacity - plannedQuantity
          });
          remainingQuantity -= plannedQuantity;
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);

      // Safety check to prevent infinite loops
      if (days.length > 365) {
        return { 
          success: false, 
          message: 'Unable to plan within reasonable timeframe' 
        };
      }
    }

    return { success: true, days };
  }, [productionLines, holidays]);

  // Plan a purchase order
  const planPurchaseOrder = useCallback(async (
    purchase: Purchase,
    lineId: string,
    startDate: Date,
    insertIndex?: number
  ) => {
    try {
      const existingPlans = plannedProduction.filter(p => p.line_id === lineId);
      const planningResult = calculatePlanning(purchase, lineId, startDate, existingPlans);

      if (!planningResult.success) {
        toast({
          title: 'Planning Failed',
          description: planningResult.message,
          variant: 'destructive',
        });
        return;
      }

      // Create planned production records
      const planData = planningResult.days.map((day, index) => ({
        purchase_id: purchase.id,
        line_id: lineId,
        planned_date: day.date,
        planned_quantity: day.quantity,
        status: 'planned' as const,
        order_index: insertIndex !== undefined ? insertIndex + index : 0
      }));

      const { data, error } = await supabase
        .from('planned_production')
        .insert(planData)
        .select(`
          *,
          purchases(*),
          production_lines(*)
        `);

      if (error) throw error;

      // Update purchase state
      await supabase
        .from('purchases')
        .update({ state: 'planned' })
        .eq('id', purchase.id);

      // Update local state
      setPlannedProduction(prev => [...prev, ...(data || [])]);
      setPurchases(prev => prev.filter(p => p.id !== purchase.id));

      toast({
        title: 'Success',
        description: `${purchase.name} planned successfully`,
      });

    } catch (error) {
      console.error('Error planning purchase order:', error);
      toast({
        title: 'Error',
        description: 'Failed to plan purchase order',
        variant: 'destructive',
      });
    }
  }, [plannedProduction, calculatePlanning, toast]);

  // Move planned production back to sidebar
  const movePlannedToSidebar = useCallback(async (plannedId: string) => {
    try {
      const planned = plannedProduction.find(p => p.id === plannedId);
      if (!planned) return;

      // Delete all planned production for this purchase
      const { error: deleteError } = await supabase
        .from('planned_production')
        .delete()
        .eq('purchase_id', planned.purchase_id);

      if (deleteError) throw deleteError;

      // Update purchase state back to purchase
      const { data: purchaseData, error: updateError } = await supabase
        .from('purchases')
        .update({ state: 'purchase' })
        .eq('id', planned.purchase_id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update local state
      setPlannedProduction(prev => 
        prev.filter(p => p.purchase_id !== planned.purchase_id)
      );
      setPurchases(prev => [...prev, purchaseData]);

      toast({
        title: 'Success',
        description: 'Purchase order moved back to sidebar',
      });

    } catch (error) {
      console.error('Error moving planned to sidebar:', error);
      toast({
        title: 'Error',
        description: 'Failed to move purchase order',
        variant: 'destructive',
      });
    }
  }, [plannedProduction, toast]);

  // Recalculate plans for a line (used when capacity changes)
  const recalculatePlansForLine = useCallback(async (lineId: string) => {
    try {
      // Get all planned production for this line grouped by purchase
      const linePlans = plannedProduction.filter(p => p.line_id === lineId);
      const purchaseGroups = new Map<string, PlannedProduction[]>();
      
      linePlans.forEach(plan => {
        if (!purchaseGroups.has(plan.purchase_id)) {
          purchaseGroups.set(plan.purchase_id, []);
        }
        purchaseGroups.get(plan.purchase_id)!.push(plan);
      });

      // Delete all existing plans for this line
      await supabase
        .from('planned_production')
        .delete()
        .eq('line_id', lineId);

      // Recalculate and recreate plans
      for (const [purchaseId, plans] of purchaseGroups) {
        const purchase = plans[0].purchases;
        if (purchase) {
          const startDate = new Date(plans[0].planned_date);
          await planPurchaseOrder(purchase, lineId, startDate);
        }
      }

    } catch (error) {
      console.error('Error recalculating plans:', error);
    }
  }, [plannedProduction, planPurchaseOrder]);

  // Initialize data
  useEffect(() => {
    fetchAvailablePurchases();
    fetchProductionLines();
    fetchPlannedProduction();
    fetchHolidays();
  }, [fetchAvailablePurchases, fetchProductionLines, fetchPlannedProduction, fetchHolidays]);

  return {
    // Data
    purchases,
    orderLines,
    productionLines,
    plannedProduction,
    holidays,
    isLoading,

    // Actions
    fetchOrderLines,
    fetchOrderLinesForTooltip,
    createProductionLine,
    updateProductionLineCapacity,
    planPurchaseOrder,
    movePlannedToSidebar,
    calculatePlanning,

    // Refresh functions
    refetchData: useCallback(() => {
      fetchAvailablePurchases();
      fetchPlannedProduction();
    }, [fetchAvailablePurchases, fetchPlannedProduction])
  };
};
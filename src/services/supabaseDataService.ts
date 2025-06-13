
import { supabase } from '../integrations/supabase/client';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';

export class SupabaseDataService {
  // Production Lines
  async getProductionLines(): Promise<ProductionLine[]> {
    const { data, error } = await supabase
      .from('production_lines')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Error fetching production lines:', error);
      throw error;
    }
    
    return data || [];
  }

  async createProductionLine(line: Omit<ProductionLine, 'id'>): Promise<ProductionLine> {
    const { data, error } = await supabase
      .from('production_lines')
      .insert([line])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating production line:', error);
      throw error;
    }
    
    return data;
  }

  async updateProductionLine(id: string, updates: Partial<ProductionLine>): Promise<ProductionLine> {
    const { data, error } = await supabase
      .from('production_lines')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating production line:', error);
      throw error;
    }
    
    return data;
  }

  async deleteProductionLine(id: string): Promise<void> {
    const { error } = await supabase
      .from('production_lines')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting production line:', error);
      throw error;
    }
  }

  // Holidays
  async getHolidays(): Promise<Holiday[]> {
    // Get holidays with their associated production lines
    const { data: holidaysData, error } = await supabase
      .from('holidays')
      .select(`
        *,
        holiday_production_lines (
          production_line_id
        )
      `)
      .order('date');
    
    if (error) {
      console.error('Error fetching holidays:', error);
      throw error;
    }
    
    return (holidaysData || []).map(holiday => ({
      id: holiday.id,
      date: new Date(holiday.date),
      name: holiday.name,
      isGlobal: holiday.is_global,
      affectedLineIds: holiday.is_global ? [] : holiday.holiday_production_lines?.map((hpl: any) => hpl.production_line_id) || []
    }));
  }

  async createHoliday(holiday: Omit<Holiday, 'id'>): Promise<Holiday> {
    const { data, error } = await supabase
      .from('holidays')
      .insert([{
        name: holiday.name,
        date: holiday.date.toISOString().split('T')[0],
        is_global: holiday.isGlobal
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating holiday:', error);
      throw error;
    }

    // If it's not global, create the line associations
    if (!holiday.isGlobal && holiday.affectedLineIds && holiday.affectedLineIds.length > 0) {
      const lineAssociations = holiday.affectedLineIds.map(lineId => ({
        holiday_id: data.id,
        production_line_id: lineId
      }));

      const { error: associationError } = await supabase
        .from('holiday_production_lines')
        .insert(lineAssociations);

      if (associationError) {
        console.error('Error creating holiday line associations:', associationError);
        throw associationError;
      }
    }
    
    return {
      id: data.id,
      date: new Date(data.date),
      name: data.name,
      isGlobal: data.is_global,
      affectedLineIds: holiday.isGlobal ? [] : holiday.affectedLineIds || []
    };
  }

  async updateHoliday(id: string, updates: Partial<Holiday>): Promise<Holiday> {
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.date !== undefined) updateData.date = updates.date.toISOString().split('T')[0];
    if (updates.isGlobal !== undefined) updateData.is_global = updates.isGlobal;
    
    const { data, error } = await supabase
      .from('holidays')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating holiday:', error);
      throw error;
    }

    // Handle line associations if updating to/from global
    if (updates.isGlobal !== undefined || updates.affectedLineIds !== undefined) {
      // Delete existing associations
      await supabase
        .from('holiday_production_lines')
        .delete()
        .eq('holiday_id', id);

      // Add new associations if not global
      if (!data.is_global && updates.affectedLineIds && updates.affectedLineIds.length > 0) {
        const lineAssociations = updates.affectedLineIds.map(lineId => ({
          holiday_id: id,
          production_line_id: lineId
        }));

        await supabase
          .from('holiday_production_lines')
          .insert(lineAssociations);
      }
    }
    
    return {
      id: data.id,
      date: new Date(data.date),
      name: data.name,
      isGlobal: data.is_global,
      affectedLineIds: data.is_global ? [] : updates.affectedLineIds || []
    };
  }

  async deleteHoliday(id: string): Promise<void> {
    const { error } = await supabase
      .from('holidays')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting holiday:', error);
      throw error;
    }
  }

  // Ramp Up Plans
  async getRampUpPlans(): Promise<RampUpPlan[]> {
    const { data, error } = await supabase
      .from('ramp_up_plans')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Error fetching ramp up plans:', error);
      throw error;
    }
    
    return (data || []).map(plan => ({
      id: plan.id,
      name: plan.name,
      efficiencies: Array.isArray(plan.efficiencies) ? plan.efficiencies as { day: number; efficiency: number }[] : [],
      finalEfficiency: plan.final_efficiency
    }));
  }

  async createRampUpPlan(plan: Omit<RampUpPlan, 'id'>): Promise<RampUpPlan> {
    const { data, error } = await supabase
      .from('ramp_up_plans')
      .insert([{
        name: plan.name,
        efficiencies: plan.efficiencies,
        final_efficiency: plan.finalEfficiency
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating ramp up plan:', error);
      throw error;
    }
    
    return {
      id: data.id,
      name: data.name,
      efficiencies: Array.isArray(data.efficiencies) ? data.efficiencies as { day: number; efficiency: number }[] : [],
      finalEfficiency: data.final_efficiency
    };
  }

  async updateRampUpPlan(id: string, updates: Partial<RampUpPlan>): Promise<RampUpPlan> {
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.efficiencies !== undefined) updateData.efficiencies = updates.efficiencies;
    if (updates.finalEfficiency !== undefined) updateData.final_efficiency = updates.finalEfficiency;
    
    const { data, error } = await supabase
      .from('ramp_up_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating ramp up plan:', error);
      throw error;
    }
    
    return {
      id: data.id,
      name: data.name,
      efficiencies: Array.isArray(data.efficiencies) ? data.efficiencies as { day: number; efficiency: number }[] : [],
      finalEfficiency: data.final_efficiency
    };
  }

  async deleteRampUpPlan(id: string): Promise<void> {
    const { error } = await supabase
      .from('ramp_up_plans')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting ramp up plan:', error);
      throw error;
    }
  }

  // Orders
  async getOrders(): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
    
    return (data || []).map(order => ({
      id: order.id,
      poNumber: order.po_number,
      styleId: order.style_id,
      orderQuantity: order.order_quantity,
      smv: order.smv,
      moCount: order.mo_count,
      cutQuantity: order.cut_quantity,
      issueQuantity: order.issue_quantity,
      status: order.status,
      planStartDate: order.plan_start_date ? new Date(order.plan_start_date) : null,
      planEndDate: order.plan_end_date ? new Date(order.plan_end_date) : null,
      actualProduction: (order.actual_production || {}) as { [date: string]: number },
      assignedLineId: order.assigned_line_id || undefined,
      basePONumber: order.base_po_number || undefined,
      splitNumber: order.split_number || undefined
    }));
  }

  async createOrder(order: Omit<Order, 'id'>): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        po_number: order.poNumber,
        style_id: order.styleId,
        order_quantity: order.orderQuantity,
        smv: order.smv,
        mo_count: order.moCount,
        cut_quantity: order.cutQuantity,
        issue_quantity: order.issueQuantity,
        status: order.status,
        plan_start_date: order.planStartDate?.toISOString().split('T')[0] || null,
        plan_end_date: order.planEndDate?.toISOString().split('T')[0] || null,
        actual_production: order.actualProduction,
        assigned_line_id: order.assignedLineId || null,
        base_po_number: order.basePONumber || null,
        split_number: order.splitNumber || null
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating order:', error);
      throw error;
    }
    
    return {
      id: data.id,
      poNumber: data.po_number,
      styleId: data.style_id,
      orderQuantity: data.order_quantity,
      smv: data.smv,
      moCount: data.mo_count,
      cutQuantity: data.cut_quantity,
      issueQuantity: data.issue_quantity,
      status: data.status,
      planStartDate: data.plan_start_date ? new Date(data.plan_start_date) : null,
      planEndDate: data.plan_end_date ? new Date(data.plan_end_date) : null,
      actualProduction: (data.actual_production || {}) as { [date: string]: number },
      assignedLineId: data.assigned_line_id || undefined,
      basePONumber: data.base_po_number || undefined,
      splitNumber: data.split_number || undefined
    };
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order> {
    const updateData: any = {};
    
    if (updates.poNumber !== undefined) updateData.po_number = updates.poNumber;
    if (updates.styleId !== undefined) updateData.style_id = updates.styleId;
    if (updates.orderQuantity !== undefined) updateData.order_quantity = updates.orderQuantity;
    if (updates.smv !== undefined) updateData.smv = updates.smv;
    if (updates.moCount !== undefined) updateData.mo_count = updates.moCount;
    if (updates.cutQuantity !== undefined) updateData.cut_quantity = updates.cutQuantity;
    if (updates.issueQuantity !== undefined) updateData.issue_quantity = updates.issueQuantity;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.planStartDate !== undefined) {
      updateData.plan_start_date = updates.planStartDate?.toISOString().split('T')[0] || null;
    }
    if (updates.planEndDate !== undefined) {
      updateData.plan_end_date = updates.planEndDate?.toISOString().split('T')[0] || null;
    }
    if (updates.actualProduction !== undefined) updateData.actual_production = updates.actualProduction;
    if (updates.assignedLineId !== undefined) updateData.assigned_line_id = updates.assignedLineId || null;
    if (updates.basePONumber !== undefined) updateData.base_po_number = updates.basePONumber || null;
    if (updates.splitNumber !== undefined) updateData.split_number = updates.splitNumber || null;

    const { data, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating order:', error);
      throw error;
    }
    
    return {
      id: data.id,
      poNumber: data.po_number,
      styleId: data.style_id,
      orderQuantity: data.order_quantity,
      smv: data.smv,
      moCount: data.mo_count,
      cutQuantity: data.cut_quantity,
      issueQuantity: data.issue_quantity,
      status: data.status,
      planStartDate: data.plan_start_date ? new Date(data.plan_start_date) : null,
      planEndDate: data.plan_end_date ? new Date(data.plan_end_date) : null,
      actualProduction: (data.actual_production || {}) as { [date: string]: number },
      assignedLineId: data.assigned_line_id || undefined,
      basePONumber: data.base_po_number || undefined,
      splitNumber: data.split_number || undefined
    };
  }

  async deleteOrder(id: string): Promise<void> {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  }

  async getPendingOrders(): Promise<Order[]> {
    const orders = await this.getOrders();
    return orders.filter(order => 
      order.status === 'pending' && !order.planStartDate && !order.planEndDate
    );
  }
}

export const supabaseDataService = new SupabaseDataService();

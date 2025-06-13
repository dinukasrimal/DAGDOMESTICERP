
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
    const { data, error } = await supabase
      .from('holidays')
      .select('*')
      .order('date');
    
    if (error) {
      console.error('Error fetching holidays:', error);
      throw error;
    }
    
    return (data || []).map(holiday => ({
      ...holiday,
      date: new Date(holiday.date)
    }));
  }

  async createHoliday(holiday: Omit<Holiday, 'id'>): Promise<Holiday> {
    const { data, error } = await supabase
      .from('holidays')
      .insert([{
        ...holiday,
        date: holiday.date.toISOString().split('T')[0]
      }])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating holiday:', error);
      throw error;
    }
    
    return {
      ...data,
      date: new Date(data.date)
    };
  }

  async updateHoliday(id: string, updates: Partial<Holiday>): Promise<Holiday> {
    const updateData = updates.date 
      ? { ...updates, date: updates.date.toISOString().split('T')[0] }
      : updates;
    
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
    
    return {
      ...data,
      date: new Date(data.date)
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
    
    return data || [];
  }

  async createRampUpPlan(plan: Omit<RampUpPlan, 'id'>): Promise<RampUpPlan> {
    const { data, error } = await supabase
      .from('ramp_up_plans')
      .insert([plan])
      .select()
      .single();
    
    if (error) {
      console.error('Error creating ramp up plan:', error);
      throw error;
    }
    
    return data;
  }

  async updateRampUpPlan(id: string, updates: Partial<RampUpPlan>): Promise<RampUpPlan> {
    const { data, error } = await supabase
      .from('ramp_up_plans')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating ramp up plan:', error);
      throw error;
    }
    
    return data;
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
      ...order,
      planStartDate: order.plan_start_date ? new Date(order.plan_start_date) : null,
      planEndDate: order.plan_end_date ? new Date(order.plan_end_date) : null,
      actualProduction: order.actual_production || {},
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
      ...data,
      poNumber: data.po_number,
      styleId: data.style_id,
      orderQuantity: data.order_quantity,
      moCount: data.mo_count,
      cutQuantity: data.cut_quantity,
      issueQuantity: data.issue_quantity,
      planStartDate: data.plan_start_date ? new Date(data.plan_start_date) : null,
      planEndDate: data.plan_end_date ? new Date(data.plan_end_date) : null,
      actualProduction: data.actual_production || {},
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
      ...data,
      poNumber: data.po_number,
      styleId: data.style_id,
      orderQuantity: data.order_quantity,
      moCount: data.mo_count,
      cutQuantity: data.cut_quantity,
      issueQuantity: data.issue_quantity,
      planStartDate: data.plan_start_date ? new Date(data.plan_start_date) : null,
      planEndDate: data.plan_end_date ? new Date(data.plan_end_date) : null,
      actualProduction: data.actual_production || {},
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

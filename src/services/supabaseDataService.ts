
import { supabase } from '../integrations/supabase/client';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';

export class SupabaseDataService {
  async fetchOrders(): Promise<Order[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return data.map(order => ({
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
      actualProduction: order.actual_production || {},
      assignedLineId: order.assigned_line_id,
      basePONumber: order.base_po_number,
      splitNumber: order.split_number
    }));
  }

  async fetchProductionLines(): Promise<ProductionLine[]> {
    const { data, error } = await supabase
      .from('production_lines')
      .select('*')
      .order('name');

    if (error) throw error;
    
    return data.map(line => ({
      id: line.id,
      name: line.name,
      capacity: line.capacity
    }));
  }

  async fetchHolidays(): Promise<Holiday[]> {
    const { data, error } = await supabase
      .from('holidays')
      .select('*')
      .order('date');

    if (error) throw error;
    
    return data.map(holiday => ({
      id: holiday.id,
      date: new Date(holiday.date),
      name: holiday.name
    }));
  }

  async fetchRampUpPlans(): Promise<RampUpPlan[]> {
    const { data, error } = await supabase
      .from('ramp_up_plans')
      .select('*')
      .order('name');

    if (error) throw error;
    
    return data.map(plan => ({
      id: plan.id,
      name: plan.name,
      efficiencies: plan.efficiencies,
      finalEfficiency: plan.final_efficiency
    }));
  }

  async createOrder(order: Omit<Order, 'id'>): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .insert({
        po_number: order.poNumber,
        style_id: order.styleId,
        order_quantity: order.orderQuantity,
        smv: order.smv,
        mo_count: order.moCount,
        cut_quantity: order.cutQuantity,
        issue_quantity: order.issueQuantity,
        status: order.status,
        plan_start_date: order.planStartDate?.toISOString().split('T')[0],
        plan_end_date: order.planEndDate?.toISOString().split('T')[0],
        actual_production: order.actualProduction,
        assigned_line_id: order.assignedLineId,
        base_po_number: order.basePONumber,
        split_number: order.splitNumber
      })
      .select()
      .single();

    if (error) throw error;
    
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
      actualProduction: data.actual_production || {},
      assignedLineId: data.assigned_line_id,
      basePONumber: data.base_po_number,
      splitNumber: data.split_number
    };
  }

  async updateOrder(order: Order): Promise<void> {
    const { error } = await supabase
      .from('orders')
      .update({
        po_number: order.poNumber,
        style_id: order.styleId,
        order_quantity: order.orderQuantity,
        smv: order.smv,
        mo_count: order.moCount,
        cut_quantity: order.cutQuantity,
        issue_quantity: order.issueQuantity,
        status: order.status,
        plan_start_date: order.planStartDate?.toISOString().split('T')[0],
        plan_end_date: order.planEndDate?.toISOString().split('T')[0],
        actual_production: order.actualProduction,
        assigned_line_id: order.assignedLineId,
        base_po_number: order.basePONumber,
        split_number: order.splitNumber
      })
      .eq('id', order.id);

    if (error) throw error;
  }

  async deleteOrder(orderId: string): Promise<void> {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (error) throw error;
  }
}

export const supabaseDataService = new SupabaseDataService();

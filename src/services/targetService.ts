import { supabase } from '@/integrations/supabase/client';

export interface TargetData {
  customer_name: string;
  target_year: string;
  target_months: string[];
  target_data: Array<{
    product_category: string;
    quantity: number;
    value: number;
  }>;
  adjusted_total_qty: number;
  adjusted_total_value: number;
}

export const getTargetsForAnalytics = async (
  year?: string,
  months?: string[],
  customer?: string
): Promise<TargetData[]> => {
  try {
    let query = supabase
      .from('sales_targets')
      .select('*');

    if (year) {
      query = query.eq('target_year', year);
    }

    if (customer) {
      query = query.eq('customer_name', customer);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    let filteredTargets = data || [];

    // Filter by months if provided
    if (months && months.length > 0) {
      filteredTargets = filteredTargets.filter(target =>
        target.target_months.some((month: string) => months.includes(month))
      );
    }

    return filteredTargets.map(target => ({
      customer_name: target.customer_name,
      target_year: target.target_year,
      target_months: target.target_months,
      target_data: Array.isArray(target.target_data) ? target.target_data as Array<{
        product_category: string;
        quantity: number;
        value: number;
      }> : [],
      adjusted_total_qty: target.adjusted_total_qty,
      adjusted_total_value: target.adjusted_total_value,
    }));
  } catch (error) {
    console.error('Error fetching targets for analytics:', error);
    return [];
  }
};

export const calculateTargetVsActual = (
  actualSales: Array<{
    partner_name: string;
    date_order: string;
    amount_total: number;
    order_lines?: Array<{
      product_name: string;
      qty_delivered: number;
      price_subtotal: number;
      product_category: string;
    }>;
  }>,
  targets: TargetData[],
  selectedYear?: string,
  selectedMonths?: string[]
) => {
  const comparison: Array<{
    customer: string;
    actualQty: number;
    actualValue: number;
    targetQty: number;
    targetValue: number;
    qtyVariance: number;
    valueVariance: number;
    qtyPercentage: number;
    valuePercentage: number;
  }> = [];

  targets.forEach(target => {
    // Filter actual sales for this customer and time period
    const customerSales = actualSales.filter(sale => {
      if (sale.partner_name !== target.customer_name) return false;
      if (!sale.date_order) return false;

      const saleDate = new Date(sale.date_order);
      const saleYear = saleDate.getFullYear().toString();
      const saleMonth = String(saleDate.getMonth() + 1).padStart(2, '0');

      // Check year filter
      if (selectedYear && saleYear !== selectedYear) return false;

      // Check if sale month matches target months or selected months
      const relevantMonths = selectedMonths || target.target_months;
      return relevantMonths.includes(saleMonth);
    });

    // Calculate actual totals
    let actualQty = 0;
    let actualValue = 0;

    customerSales.forEach(sale => {
      actualValue += sale.amount_total;
      if (sale.order_lines) {
        sale.order_lines.forEach(line => {
          actualQty += line.qty_delivered;
        });
      }
    });

    // Calculate proportional target if using selected months
    let targetQty = target.adjusted_total_qty;
    let targetValue = target.adjusted_total_value;

    if (selectedMonths && selectedMonths.length > 0) {
      const matchingMonths = target.target_months.filter(month => selectedMonths.includes(month));
      const proportion = matchingMonths.length / target.target_months.length;
      targetQty = Math.round(target.adjusted_total_qty * proportion);
      targetValue = Math.round(target.adjusted_total_value * proportion);
    }

    const qtyVariance = actualQty - targetQty;
    const valueVariance = actualValue - targetValue;
    const qtyPercentage = targetQty > 0 ? (actualQty / targetQty) * 100 : 0;
    const valuePercentage = targetValue > 0 ? (actualValue / targetValue) * 100 : 0;

    comparison.push({
      customer: target.customer_name,
      actualQty,
      actualValue,
      targetQty,
      targetValue,
      qtyVariance,
      valueVariance,
      qtyPercentage,
      valuePercentage,
    });
  });

  return comparison;
};
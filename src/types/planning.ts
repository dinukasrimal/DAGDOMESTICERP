// Production Planning Types

export interface Purchase {
  id: string;
  name: string;
  partner_name: string;
  pending_qty: number;
  received_qty: number;
  amount_total: number;
  date_order: string;
  expected_date?: string;
  state: 'purchase' | 'planned' | 'completed';
  order_lines: any[];
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseOrderLine {
  id: string;
  purchase_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  specifications?: string;
  created_at: string;
}

export interface PurchaseHold {
  id: string;
  purchase_id: string;
  reason: string;
  created_at: string;
  created_by: string;
}

export interface ProductionLine {
  id: string;
  name: string;
  capacity: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlannedProduction {
  id: string;
  purchase_id: string;
  line_id: string;
  planned_date: string;
  planned_quantity: number;
  actual_quantity?: number;
  status: 'planned' | 'in_progress' | 'completed';
  order_index: number; // For ordering within a day
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  is_recurring: boolean;
  created_at: string;
}

// UI Types
export interface DraggedItem {
  type: 'purchase' | 'planned_production';
  data: Purchase | PlannedProduction;
  source?: 'sidebar' | 'calendar';
}

export interface PlanningPosition {
  lineId: string;
  date: Date;
  insertIndex?: number;
}

export interface OverlapDialog {
  show: boolean;
  targetPlanned?: PlannedProduction;
  draggedPurchase?: Purchase;
  position?: PlanningPosition;
}

export interface SplitDialog {
  show: boolean;
  plannedProduction?: PlannedProduction;
  availableLines: ProductionLine[];
}

// Planning calculation types
export interface DayPlan {
  date: string;
  quantity: number;
  remainingCapacity: number;
}

export interface PlanningResult {
  success: boolean;
  days: DayPlan[];
  message?: string;
  conflictingPlanned?: PlannedProduction[];
}
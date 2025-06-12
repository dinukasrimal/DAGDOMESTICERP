export interface Order {
  id: string;
  poNumber: string;
  styleId: string;
  orderQuantity: number;
  smv: number;
  moCount: number;
  cutQuantity: number;
  issueQuantity: number;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
  planStartDate: Date | null;
  planEndDate: Date | null;
  actualProduction: { [date: string]: number };
  assignedLineId?: string; // Track which production line this order is assigned to
}

export interface ProductionLine {
  id: string;
  name: string;
  capacity: number;
}

export interface Holiday {
  id: string;
  date: Date;
  name: string;
}

export interface RampUpPlan {
  id: string;
  name: string;
  efficiencies: { day: number; efficiency: number }[];
  finalEfficiency: number;
}

export interface ScheduledOrder {
  id: string;
  orderId: string;
  lineId: string;
  startDate: Date;
  endDate: Date;
  rampUpPlanId: string;
  order: Order;
}

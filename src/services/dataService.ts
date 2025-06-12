import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { GoogleSheetsService, SheetOrder } from './googleSheetsService';

export class DataService {
  private googleSheetsService: GoogleSheetsService | null = null;
  private orders: Order[] = [];
  private productionLines: ProductionLine[] = [];
  private holidays: Holiday[] = [];
  private rampUpPlans: RampUpPlan[] = [];

  constructor() {
    this.initializeDefaultData();
  }

  initializeGoogleSheets(apiKey: string, spreadsheetId: string, range?: string) {
    // Default to ORDER SECTION tab with columns A to H
    const defaultRange = range || 'ORDER SECTION!A:H';
    this.googleSheetsService = new GoogleSheetsService(apiKey, spreadsheetId, defaultRange);
  }

  private initializeDefaultData() {
    // Initialize with default production lines and ramp-up plans
    this.productionLines = [
      { id: '1', name: 'Line A - Knitwear', capacity: 100 },
      { id: '2', name: 'Line B - Woven', capacity: 80 },
      { id: '3', name: 'Line C - Casual', capacity: 120 },
      { id: '4', name: 'Line D - Formal', capacity: 90 }
    ];

    this.rampUpPlans = [
      {
        id: '1',
        name: 'Standard Plan',
        efficiencies: [
          { day: 1, efficiency: 50 },
          { day: 2, efficiency: 70 },
          { day: 3, efficiency: 85 },
          { day: 4, efficiency: 90 }
        ],
        finalEfficiency: 90
      },
      {
        id: '2',
        name: 'Fast Track Plan',
        efficiencies: [
          { day: 1, efficiency: 70 },
          { day: 2, efficiency: 85 },
          { day: 3, efficiency: 95 }
        ],
        finalEfficiency: 95
      }
    ];
  }

  private convertSheetOrderToOrder(sheetOrder: SheetOrder): Order {
    return {
      id: `sheet-${sheetOrder.PO_Number}`,
      poNumber: sheetOrder.PO_Number,
      styleId: sheetOrder.Style_Name,
      orderQuantity: sheetOrder.QTY,
      smv: sheetOrder.SMV,
      moCount: sheetOrder.MO_Count,
      cutQuantity: sheetOrder.QTY, // Using QTY as default cut quantity
      issueQuantity: sheetOrder.QTY, // Using QTY as default issue quantity
      status: sheetOrder.Plan_Start_Date ? 'scheduled' : 'pending',
      planStartDate: sheetOrder.Plan_Start_Date ? new Date(sheetOrder.Plan_Start_Date) : null,
      planEndDate: sheetOrder.Plan_End_Date ? new Date(sheetOrder.Plan_End_Date) : null,
      actualProduction: {}
    };
  }

  async fetchOrdersFromSheet(): Promise<Order[]> {
    if (!this.googleSheetsService) {
      throw new Error('Google Sheets service not initialized');
    }

    try {
      const sheetOrders = await this.googleSheetsService.fetchOrders();
      this.orders = sheetOrders.map(order => this.convertSheetOrderToOrder(order));
      return this.orders;
    } catch (error) {
      console.error('Failed to fetch orders from Google Sheets:', error);
      throw error;
    }
  }

  async updateOrderSchedule(order: Order, startDate: Date, endDate: Date): Promise<void> {
    if (!this.googleSheetsService) {
      throw new Error('Google Sheets service not initialized');
    }

    try {
      const planStartDate = startDate.toISOString().split('T')[0];
      const planEndDate = endDate.toISOString().split('T')[0];
      
      // Calculate Plan Cut Start (3 days before Plan Start Date)
      const planCutStartDate = new Date(startDate);
      planCutStartDate.setDate(planCutStartDate.getDate() - 3);
      const planCutStart = planCutStartDate.toISOString().split('T')[0];

      await this.googleSheetsService.updateOrderSchedule(
        order.poNumber, 
        planStartDate, 
        planEndDate, 
        planCutStart
      );

      console.log(`Updated schedule for order ${order.poNumber}`);
    } catch (error) {
      console.error('Failed to update order schedule:', error);
      throw error;
    }
  }

  getOrders(): Order[] {
    return this.orders;
  }

  getProductionLines(): ProductionLine[] {
    return this.productionLines;
  }

  getHolidays(): Holiday[] {
    return this.holidays;
  }

  getRampUpPlans(): RampUpPlan[] {
    return this.rampUpPlans;
  }

  setOrders(orders: Order[]) {
    this.orders = orders;
  }

  setProductionLines(lines: ProductionLine[]) {
    this.productionLines = lines;
  }

  setHolidays(holidays: Holiday[]) {
    this.holidays = holidays;
  }

  setRampUpPlans(plans: RampUpPlan[]) {
    this.rampUpPlans = plans;
  }
}

// Create singleton instance
export const dataService = new DataService();

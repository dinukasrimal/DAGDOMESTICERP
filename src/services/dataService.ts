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

  initializeGoogleSheets(apiKey: string, spreadsheetId: string) {
    this.googleSheetsService = new GoogleSheetsService(apiKey, spreadsheetId);
  }

  private initializeDefaultData() {
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
      id: `sheet-${sheetOrder.poNumber}`,
      poNumber: sheetOrder.poNumber,
      styleId: sheetOrder.styleName,
      orderQuantity: sheetOrder.qty,
      smv: sheetOrder.smv,
      moCount: sheetOrder.moCount,
      cutQuantity: sheetOrder.qty,
      issueQuantity: sheetOrder.qty,
      status: sheetOrder.planStartDate ? 'scheduled' : 'pending',
      planStartDate: sheetOrder.planStartDate ? new Date(sheetOrder.planStartDate) : null,
      planEndDate: sheetOrder.planEndDate ? new Date(sheetOrder.planEndDate) : null,
      actualProduction: {}
    };
  }

  async fetchOrdersFromSheet(): Promise<Order[]> {
    if (!this.googleSheetsService) {
      throw new Error('Google Sheets service not initialized');
    }

    const sheetOrders = await this.googleSheetsService.fetchOrders();
    this.orders = sheetOrders.map(order => this.convertSheetOrderToOrder(order));
    return this.orders;
  }

  async updateOrderSchedule(order: Order, startDate: Date, endDate: Date): Promise<void> {
    if (!this.googleSheetsService) {
      throw new Error('Google Sheets service not initialized');
    }

    await this.googleSheetsService.updateOrderSchedule(order, startDate, endDate);
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

export const dataService = new DataService();

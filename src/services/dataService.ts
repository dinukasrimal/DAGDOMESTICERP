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
    console.log('🔧 Initializing Google Sheets service');
    this.googleSheetsService = new GoogleSheetsService(apiKey, spreadsheetId);
  }

  private initializeDefaultData() {
    this.productionLines = [
      { id: '1', name: 'Line A - Knitwear', capacity: 120, moCount: 0 },
      { id: '2', name: 'Line B - Woven', capacity: 100, moCount: 0 },
      { id: '3', name: 'Line C - Denim', capacity: 80, moCount: 0 },
      { id: '4', name: 'Line D - Casual', capacity: 150, moCount: 0 }
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
    // Generate a unique ID for the order
    const uniqueId = `sheet-${sheetOrder.poNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🔄 Converting sheet order: ${sheetOrder.poNumber} (Qty: ${sheetOrder.qty}, SMV: ${sheetOrder.smv}, Cut: ${sheetOrder.cutQuantity || 0}, Issue: ${sheetOrder.issueQuantity || 0})`);
    
    return {
      id: uniqueId,
      poNumber: sheetOrder.poNumber,
      styleId: sheetOrder.styleName,
      orderQuantity: sheetOrder.qty,
      smv: sheetOrder.smv,
      moCount: sheetOrder.moCount,
      cutQuantity: sheetOrder.cutQuantity || 0,
      issueQuantity: sheetOrder.issueQuantity || 0,
      status: 'pending', // All new orders from sheet are pending since we only load ones without PED
      planStartDate: null,
      planEndDate: null,
      actualProduction: {}
    };
  }

  async fetchOrdersFromSheet(existingOrders: Order[] = []): Promise<Order[]> {
    if (!this.googleSheetsService) {
      throw new Error('Google Sheets service not initialized');
    }
    try {
      console.log('📡 Fetching orders from Google Sheets (READ ONLY)...');
      const sheetOrders = await this.googleSheetsService.fetchOrders();
      
      if (!sheetOrders || sheetOrders.length === 0) {
        console.log('📭 No orders found in Google Sheets');
        return existingOrders;
      }
      
      console.log(`📋 Processing ${sheetOrders.length} orders from sheet (only those without PED)`);
      
      // Create a map of existing orders by PO number for quick lookup
      const existingOrdersMap = new Map<string, Order>();
      existingOrders.forEach(order => {
        existingOrdersMap.set(order.poNumber, order);
      });
      
      const newOrders: Order[] = [];
      let addedCount = 0;
      let scheduledKeptCount = 0;
      let updatedCount = 0;
      
      // First, add all existing scheduled orders (preserve them)
      existingOrders.forEach(existingOrder => {
        if (existingOrder.status === 'scheduled' || existingOrder.assignedLineId) {
          console.log(`⏭️ Keeping scheduled order: ${existingOrder.poNumber}`);
          newOrders.push(existingOrder);
          scheduledKeptCount++;
        }
      });
      
      // Then process sheet orders (only pending ones without PED)
      for (const sheetOrder of sheetOrders) {
        const existingOrder = existingOrdersMap.get(sheetOrder.poNumber);
        
        if (existingOrder && (existingOrder.status === 'scheduled' || existingOrder.assignedLineId)) {
          // Skip - already added above as scheduled
          continue;
        } else if (existingOrder && existingOrder.status === 'pending') {
          // Update existing pending order with fresh sheet data
          console.log(`🔄 Updating pending order: ${sheetOrder.poNumber}`);
          const updatedOrder = {
            ...existingOrder,
            styleId: sheetOrder.styleName,
            orderQuantity: sheetOrder.qty,
            smv: sheetOrder.smv,
            moCount: sheetOrder.moCount,
            cutQuantity: sheetOrder.cutQuantity || 0,
            issueQuantity: sheetOrder.issueQuantity || 0
          };
          newOrders.push(updatedOrder);
          updatedCount++;
        } else {
          // New order from sheet
          console.log(`➕ Adding new pending order: ${sheetOrder.poNumber}`);
          const newOrder = this.convertSheetOrderToOrder(sheetOrder);
          newOrders.push(newOrder);
          addedCount++;
        }
      }
      
      // Add any existing pending orders that weren't found in the sheet (manually created)
      existingOrders.forEach(existingOrder => {
        if (existingOrder.status === 'pending' && 
            !sheetOrders.some(sheetOrder => sheetOrder.poNumber === existingOrder.poNumber)) {
          console.log(`📋 Keeping manual pending order: ${existingOrder.poNumber}`);
          newOrders.push(existingOrder);
        }
      });
      
      this.orders = newOrders;
      
      const pendingCount = this.orders.filter(o => o.status === 'pending').length;
      const totalScheduledCount = this.orders.filter(o => o.status === 'scheduled').length;
      
      console.log(`✅ Read-only sync complete: ${this.orders.length} total orders`);
      console.log(`📊 Status: ${pendingCount} pending, ${totalScheduledCount} scheduled`);
      console.log(`🔄 ${scheduledKeptCount} scheduled orders preserved, ${addedCount} new orders added, ${updatedCount} pending orders updated`);
      console.log(`📝 NO DATA WRITTEN TO GOOGLE SHEETS (read-only mode)`);
      
      return this.orders;
    } catch (error) {
      console.error('❌ Error fetching orders from sheet:', error);
      throw error;
    }
  }

  getOrders(): Order[] {
    return this.orders;
  }

  getPendingOrders(): Order[] {
    // Only return orders that are truly pending (no plan dates)
    return this.orders.filter(order => 
      order.status === 'pending' && !order.planStartDate && !order.planEndDate
    );
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

export const mockProductionLines: ProductionLine[] = [
  { id: '1', name: 'Line A - Knitwear', capacity: 120, moCount: 0 },
  { id: '2', name: 'Line B - Woven', capacity: 100, moCount: 0 },
  { id: '3', name: 'Line C - Denim', capacity: 80, moCount: 0 },
  { id: '4', name: 'Line D - Casual', capacity: 150, moCount: 0 },
];

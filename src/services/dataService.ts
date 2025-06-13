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
    // Generate a unique ID for the order
    const uniqueId = `sheet-${sheetOrder.poNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if this order has schedule dates - if so, it's already scheduled
    const hasScheduleDates = sheetOrder.planStartDate && sheetOrder.planEndDate;
    
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
      status: hasScheduleDates ? 'scheduled' : 'pending',
      planStartDate: sheetOrder.planStartDate ? new Date(sheetOrder.planStartDate) : null,
      planEndDate: sheetOrder.planEndDate ? new Date(sheetOrder.planEndDate) : null,
      actualProduction: {}
    };
  }

  async fetchOrdersFromSheet(existingOrders: Order[] = []): Promise<Order[]> {
    if (!this.googleSheetsService) {
      throw new Error('Google Sheets service not initialized');
    }

    try {
      console.log('📡 Fetching orders from Google Sheets...');
      const sheetOrders = await this.googleSheetsService.fetchOrders();
      
      if (!sheetOrders || sheetOrders.length === 0) {
        console.log('📭 No orders found in Google Sheets');
        return existingOrders;
      }
      
      console.log(`📋 Processing ${sheetOrders.length} orders from sheet`);
      
      // Create a map of existing orders by PO number for quick lookup
      const existingOrdersMap = new Map<string, Order>();
      existingOrders.forEach(order => {
        existingOrdersMap.set(order.poNumber, order);
      });
      
      const newOrders: Order[] = [];
      let duplicateCount = 0;
      let scheduledCount = 0;
      
      for (const sheetOrder of sheetOrders) {
        const existingOrder = existingOrdersMap.get(sheetOrder.poNumber);
        
        if (existingOrder) {
          // Order already exists - check if it's scheduled/assigned
          if (existingOrder.status === 'scheduled' || existingOrder.assignedLineId) {
            console.log(`⏭️ Skipping ${sheetOrder.poNumber} - already scheduled/assigned`);
            scheduledCount++;
            // Keep the existing scheduled order as-is
            newOrders.push(existingOrder);
          } else {
            console.log(`🔄 Updating ${sheetOrder.poNumber} - was pending, updating with sheet data`);
            // Update the pending order with fresh sheet data
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
          }
        } else {
          // New order from sheet
          console.log(`➕ Adding new order: ${sheetOrder.poNumber}`);
          const newOrder = this.convertSheetOrderToOrder(sheetOrder);
          newOrders.push(newOrder);
        }
      }
      
      // Add any existing orders that weren't found in the sheet (they might be manually created)
      existingOrders.forEach(existingOrder => {
        if (!sheetOrders.some(sheetOrder => sheetOrder.poNumber === existingOrder.poNumber)) {
          console.log(`📋 Keeping existing order not found in sheet: ${existingOrder.poNumber}`);
          newOrders.push(existingOrder);
        }
      });
      
      this.orders = newOrders;
      
      const pendingCount = this.orders.filter(o => o.status === 'pending').length;
      const totalScheduledCount = this.orders.filter(o => o.status === 'scheduled').length;
      
      console.log(`✅ Sync complete: ${this.orders.length} total orders`);
      console.log(`📊 Status: ${pendingCount} pending, ${totalScheduledCount} scheduled`);
      console.log(`🔄 ${scheduledCount} scheduled orders preserved, ${duplicateCount} duplicates skipped`);
      
      return this.orders;
    } catch (error) {
      console.error('❌ Error fetching orders from sheet:', error);
      throw error;
    }
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

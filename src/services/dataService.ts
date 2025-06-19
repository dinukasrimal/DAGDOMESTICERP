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

  async updateCutAndIssueQuantities(existingOrders: Order[]): Promise<{ updatedOrders: Order[], hasUpdates: boolean }> {
    if (!this.googleSheetsService) {
      throw new Error('Google Sheets service not initialized');
    }

    try {
      console.log('🔄 Updating cut and issue quantities for existing orders...');
      const { cutQtyMap, issueQtyMap } = await this.googleSheetsService.getCutAndIssueQuantities();
      
      let hasUpdates = false;
      const updatedOrders = existingOrders.map(order => {
        const basePONumber = order.basePONumber || order.poNumber.split(' Split ')[0];
        const newCutQty = cutQtyMap.get(basePONumber) || 0;
        const newIssueQty = issueQtyMap.get(basePONumber) || 0;
        
        // Check if cut or issue quantities have changed
        if (order.cutQuantity !== newCutQty || order.issueQuantity !== newIssueQty) {
          console.log(`📝 Updating quantities for ${order.poNumber}: Cut ${order.cutQuantity} → ${newCutQty}, Issue ${order.issueQuantity} → ${newIssueQty}`);
          hasUpdates = true;
          
          // For split orders, calculate proportional quantities
          if (order.poNumber.includes(' Split ') && order.basePONumber) {
            const totalOrderQty = existingOrders
              .filter(o => (o.basePONumber || o.poNumber.split(' Split ')[0]) === basePONumber)
              .reduce((sum, o) => sum + o.orderQuantity, 0);
            
            const proportionalCut = totalOrderQty > 0 ? Math.round((order.orderQuantity / totalOrderQty) * newCutQty) : 0;
            const proportionalIssue = totalOrderQty > 0 ? Math.round((order.orderQuantity / totalOrderQty) * newIssueQty) : 0;
            
            return {
              ...order,
              cutQuantity: proportionalCut,
              issueQuantity: proportionalIssue
            };
          } else {
            return {
              ...order,
              cutQuantity: newCutQty,
              issueQuantity: newIssueQty
            };
          }
        }
        
        return order;
      });
      
      console.log(`✅ Cut/Issue quantity update complete. ${hasUpdates ? 'Updates found' : 'No updates needed'}`);
      return { updatedOrders, hasUpdates };
    } catch (error) {
      console.error('❌ Error updating cut and issue quantities:', error);
      return { updatedOrders: existingOrders, hasUpdates: false };
    }
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

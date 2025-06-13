
import { Order } from '../types/scheduler';

export interface SheetOrder {
  poNumber: string;
  styleName: string;
  smv: number;
  qty: number;
  moCount: number;
  planStartDate?: string;
  planEndDate?: string;
  cutQty?: number;
  issueQty?: number;
}

export class GoogleSheetsService {
  private apiKey: string;
  private spreadsheetId: string;

  constructor(apiKey: string, spreadsheetId: string) {
    this.apiKey = apiKey;
    this.spreadsheetId = spreadsheetId;
  }

  private async fetchSheetData(range: string): Promise<any[][]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
    
    try {
      console.log(`📡 Fetching data from range: ${range}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.values || [];
    } catch (error) {
      console.error(`❌ Error fetching sheet data for range ${range}:`, error);
      throw error;
    }
  }

  async fetchOrders(): Promise<SheetOrder[]> {
    try {
      console.log('📋 Starting to fetch orders from multiple sheets...');
      
      // Fetch main order data
      const orderData = await this.fetchSheetData('ORDER SECTION!A:E');
      console.log(`📊 Fetched ${orderData.length} rows from ORDER SECTION`);
      
      // Fetch cut quantity data
      let cutData: any[][] = [];
      try {
        cutData = await this.fetchSheetData('STYLE SO DETAIL!A:B');
        console.log(`✂️ Fetched ${cutData.length} rows from STYLE SO DETAIL (cut qty)`);
      } catch (error) {
        console.warn('⚠️ Could not fetch STYLE SO DETAIL sheet, cut quantities will be 0');
      }
      
      // Fetch issue quantity data
      let issueData: any[][] = [];
      try {
        issueData = await this.fetchSheetData('ISSUE!A:B');
        console.log(`📦 Fetched ${issueData.length} rows from ISSUE sheet`);
      } catch (error) {
        console.warn('⚠️ Could not fetch ISSUE sheet, issue quantities will be 0');
      }

      if (orderData.length === 0) {
        console.log('📭 No order data found');
        return [];
      }

      // Process cut quantities by PO
      const cutQtyMap = new Map<string, number>();
      if (cutData.length > 1) { // Skip header row
        for (let i = 1; i < cutData.length; i++) {
          const row = cutData[i];
          if (row && row.length >= 2) {
            const po = String(row[0] || '').trim();
            const cutQty = parseFloat(row[1]) || 0;
            if (po) {
              cutQtyMap.set(po, (cutQtyMap.get(po) || 0) + cutQty);
            }
          }
        }
      }

      // Process issue quantities by PO
      const issueQtyMap = new Map<string, number>();
      if (issueData.length > 1) { // Skip header row
        for (let i = 1; i < issueData.length; i++) {
          const row = issueData[i];
          if (row && row.length >= 2) {
            const po = String(row[0] || '').trim();
            const issueQty = parseFloat(row[1]) || 0;
            if (po) {
              issueQtyMap.set(po, (issueQtyMap.get(po) || 0) + issueQty);
            }
          }
        }
      }

      // Process main order data
      const orders: SheetOrder[] = [];
      const headers = orderData[0] || [];
      console.log('📋 Processing headers:', headers);

      for (let i = 1; i < orderData.length; i++) {
        const row = orderData[i];
        if (!row || row.length === 0) continue;

        const poNumber = String(row[0] || '').trim();
        const styleName = String(row[1] || '').trim();
        const smv = parseFloat(row[2]) || 0;
        const qty = parseFloat(row[3]) || 0;
        const moCount = parseFloat(row[4]) || 0;

        if (!poNumber || !styleName || qty <= 0) {
          console.log(`⚠️ Skipping invalid row ${i}: PO=${poNumber}, Style=${styleName}, Qty=${qty}`);
          continue;
        }

        const cutQty = cutQtyMap.get(poNumber) || 0;
        const issueQty = issueQtyMap.get(poNumber) || 0;

        orders.push({
          poNumber,
          styleName,
          smv,
          qty,
          moCount,
          cutQty,
          issueQty
        });

        console.log(`✅ Processed order: ${poNumber} - Cut: ${cutQty}, Issue: ${issueQty}`);
      }

      console.log(`🎯 Successfully processed ${orders.length} orders with cut/issue quantities`);
      return orders;
    } catch (error) {
      console.error('❌ Error in fetchOrders:', error);
      throw error;
    }
  }

  async updateOrderSchedule(order: Order, startDate: Date, endDate: Date): Promise<void> {
    console.log('📝 Google Sheets schedule update not implemented yet');
  }
}

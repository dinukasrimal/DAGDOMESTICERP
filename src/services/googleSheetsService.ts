
import { Order } from '../types/scheduler';

export interface SheetOrder {
  poNumber: string;
  styleName: string;
  smv: number;
  qty: number;
  moCount: number;
  planStartDate?: string;
  planEndDate?: string;
}

export class GoogleSheetsService {
  private apiKey: string;
  private spreadsheetId: string;
  private sheetName: string;

  constructor(apiKey: string, spreadsheetId: string, sheetName: string = 'ORDER SECTION') {
    this.apiKey = apiKey;
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName;
  }

  async fetchOrders(): Promise<SheetOrder[]> {
    const range = `'${this.sheetName}'!A:G`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
    
    console.log('Fetching orders from Google Sheets:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Sheets API Error:', errorText);
      throw new Error(`Failed to fetch orders: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rows = data.values || [];
    
    if (rows.length < 2) {
      console.log('No data rows found in sheet');
      return [];
    }

    const orders: SheetOrder[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      orders.push({
        poNumber: row[0] || '',
        styleName: row[1] || '',
        smv: parseFloat(row[2]) || 0,
        qty: parseInt(row[3]) || 0,
        moCount: parseInt(row[4]) || 0,
        planStartDate: row[5] || undefined,
        planEndDate: row[6] || undefined,
      });
    }

    console.log(`Fetched ${orders.length} orders from Google Sheets`);
    return orders;
  }

  async updateOrderSchedule(order: Order, startDate: Date, endDate: Date): Promise<void> {
    console.log('Google Sheets update schedule called for order:', order.poNumber);
    // Note: This would require write permissions to the sheet
    // For now, we'll just log the update attempt
    console.log(`Would update order ${order.poNumber} with start: ${startDate.toISOString()}, end: ${endDate.toISOString()}`);
  }
}

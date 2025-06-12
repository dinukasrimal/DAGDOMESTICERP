
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
    const range = `'${this.sheetName}'!A:Z`; // Get more columns to ensure we capture all data
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

    // Log the header row to understand the structure
    console.log('Header row:', rows[0]);
    console.log('Sample data row:', rows[1]);

    const orders: SheetOrder[] = [];
    let totalCount = 0;
    let excludedCount = 0;
    
    // Try to find the correct column indices by examining the header
    const headerRow = rows[0] || [];
    
    // Common column name patterns to look for
    const findColumnIndex = (patterns: string[]) => {
      for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i]).toLowerCase().trim();
        if (patterns.some(pattern => header.includes(pattern.toLowerCase()))) {
          return i;
        }
      }
      return -1;
    };

    // Try to find column indices
    const poIndex = findColumnIndex(['po', 'order', 'number']) !== -1 ? findColumnIndex(['po', 'order', 'number']) : 0;
    const styleIndex = findColumnIndex(['style', 'name', 'description']) !== -1 ? findColumnIndex(['style', 'name', 'description']) : 1;
    const smvIndex = findColumnIndex(['smv', 'time', 'minute']) !== -1 ? findColumnIndex(['smv', 'time', 'minute']) : 2;
    const qtyIndex = findColumnIndex(['qty', 'quantity', 'pieces', 'pcs']) !== -1 ? findColumnIndex(['qty', 'quantity', 'pieces', 'pcs']) : 3;
    const moIndex = findColumnIndex(['mo', 'manufacturing', 'order']) !== -1 ? findColumnIndex(['mo', 'manufacturing', 'order']) : 4;
    const pedIndex = findColumnIndex(['ped', 'plan', 'end', 'date']) !== -1 ? findColumnIndex(['ped', 'plan', 'end', 'date']) : 6;

    console.log('Column indices:', { poIndex, styleIndex, smvIndex, qtyIndex, moIndex, pedIndex });
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[poIndex]) continue;

      totalCount++;
      
      // Check if PED (Plan End Date) column has a value - if yes, exclude this order
      const planEndDate = row[pedIndex];
      if (planEndDate && planEndDate.trim() !== '') {
        excludedCount++;
        console.log(`Excluding order ${row[poIndex]} - already has PED: ${planEndDate}`);
        continue;
      }

      // Extract and parse quantity more robustly
      const rawQty = row[qtyIndex];
      let qty = 0;
      
      if (rawQty !== undefined && rawQty !== null && rawQty !== '') {
        const qtyStr = String(rawQty).trim();
        // Remove any non-numeric characters except decimal points
        const cleanQty = qtyStr.replace(/[^0-9.]/g, '');
        qty = parseInt(cleanQty) || 0;
        
        // If still 0, try to extract numbers from the string
        if (qty === 0) {
          const numbers = qtyStr.match(/\d+/g);
          if (numbers && numbers.length > 0) {
            qty = parseInt(numbers[0]) || 0;
          }
        }
      }

      // Extract and parse MO count
      const rawMo = row[moIndex];
      let moCount = 0;
      
      if (rawMo !== undefined && rawMo !== null && rawMo !== '') {
        const moStr = String(rawMo).trim();
        const cleanMo = moStr.replace(/[^0-9.]/g, '');
        moCount = parseInt(cleanMo) || 0;
        
        if (moCount === 0) {
          const numbers = moStr.match(/\d+/g);
          if (numbers && numbers.length > 0) {
            moCount = parseInt(numbers[0]) || 0;
          }
        }
      }

      // Extract and parse SMV
      const rawSmv = row[smvIndex];
      let smv = 0;
      
      if (rawSmv !== undefined && rawSmv !== null && rawSmv !== '') {
        const smvStr = String(rawSmv).trim();
        const cleanSmv = smvStr.replace(/[^0-9.]/g, '');
        smv = parseFloat(cleanSmv) || 0;
      }

      console.log(`Order ${row[poIndex]}: Raw QTY = "${rawQty}", Parsed QTY = ${qty}, Raw MO = "${rawMo}", Parsed MO = ${moCount}`);

      // Only add orders with valid quantities
      if (qty > 0) {
        orders.push({
          poNumber: row[poIndex] || '',
          styleName: row[styleIndex] || '',
          smv: smv,
          qty: qty,
          moCount: moCount,
          planStartDate: row[5] || undefined,
          planEndDate: row[pedIndex] || undefined,
        });
      } else {
        console.log(`Skipping order ${row[poIndex]} - invalid quantity: ${qty}`);
      }
    }

    console.log(`Total orders in sheet: ${totalCount}`);
    console.log(`Orders excluded (have PED): ${excludedCount}`);
    console.log(`Orders loaded with valid quantities: ${orders.length}`);
    
    return orders;
  }

  async updateOrderSchedule(order: Order, startDate: Date, endDate: Date): Promise<void> {
    console.log('Google Sheets update schedule called for order:', order.poNumber);
    // Note: This would require write permissions to the sheet
    // For now, we'll just log the update attempt
    console.log(`Would update order ${order.poNumber} with start: ${startDate.toISOString()}, end: ${endDate.toISOString()}`);
  }
}

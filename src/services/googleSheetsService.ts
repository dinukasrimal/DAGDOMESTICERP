
import { Order } from '../types/scheduler';

export interface SheetOrder {
  poNumber: string;
  styleName: string;
  smv: number;
  qty: number;
  moCount: number;
  planStartDate?: string;
  planEndDate?: string;
  cutQuantity?: number;
  issueQuantity?: number;
}

export interface CutQtyRecord {
  poNumber: string;
  cutQty: number;
}

export interface IssueQtyRecord {
  poNumber: string;
  issueQty: number;
}

export class GoogleSheetsService {
  private apiKey: string;
  private spreadsheetId: string;
  private orderSheetName: string;

  constructor(apiKey: string, spreadsheetId: string, orderSheetName: string = 'ORDER SECTION') {
    this.apiKey = apiKey;
    this.spreadsheetId = spreadsheetId;
    this.orderSheetName = orderSheetName;
  }

  private async fetchSheetData(sheetName: string): Promise<any[][]> {
    const range = `'${sheetName}'!A:Z`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
    
    console.log(`Fetching data from sheet: ${sheetName}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google Sheets API Error for ${sheetName}:`, errorText);
      throw new Error(`Failed to fetch ${sheetName}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  private async fetchCutQuantities(): Promise<Map<string, number>> {
    try {
      const rows = await this.fetchSheetData('STYLE SO DETAIL');
      console.log(`Fetched ${rows.length} rows from STYLE SO DETAIL sheet`);
      
      if (rows.length < 2) {
        console.log('No data rows found in STYLE SO DETAIL sheet');
        return new Map();
      }

      const headerRow = rows[0] || [];
      console.log('STYLE SO DETAIL header row:', headerRow);

      // Find PO and Cut Qty columns
      const findColumnIndex = (patterns: string[]) => {
        for (let i = 0; i < headerRow.length; i++) {
          const header = String(headerRow[i]).toLowerCase().trim();
          if (patterns.some(pattern => header.includes(pattern.toLowerCase()))) {
            return i;
          }
        }
        return -1;
      };

      const poIndex = findColumnIndex(['po', 'order']);
      const cutQtyIndex = findColumnIndex(['cut', 'qty', 'quantity']);

      console.log(`STYLE SO DETAIL column indices - PO: ${poIndex}, Cut Qty: ${cutQtyIndex}`);

      if (poIndex === -1 || cutQtyIndex === -1) {
        console.warn('Could not find PO or Cut Qty columns in STYLE SO DETAIL sheet');
        return new Map();
      }

      const cutQtyMap = new Map<string, number>();

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[poIndex]) continue;

        const poNumber = String(row[poIndex]).trim();
        const rawCutQty = row[cutQtyIndex];
        
        let cutQty = 0;
        if (rawCutQty !== undefined && rawCutQty !== null && rawCutQty !== '') {
          const cutQtyStr = String(rawCutQty).trim();
          const cleanCutQty = cutQtyStr.replace(/[^0-9.]/g, '');
          cutQty = parseInt(cleanCutQty) || 0;
        }

        if (cutQty > 0) {
          const existingQty = cutQtyMap.get(poNumber) || 0;
          cutQtyMap.set(poNumber, existingQty + cutQty);
          console.log(`Cut Qty for ${poNumber}: ${cutQty} (total: ${existingQty + cutQty})`);
        }
      }

      console.log(`Processed cut quantities for ${cutQtyMap.size} POs`);
      return cutQtyMap;
    } catch (error) {
      console.error('Error fetching cut quantities:', error);
      return new Map();
    }
  }

  private async fetchIssueQuantities(): Promise<Map<string, number>> {
    try {
      const rows = await this.fetchSheetData('ISSUE');
      console.log(`Fetched ${rows.length} rows from ISSUE sheet`);
      
      if (rows.length < 2) {
        console.log('No data rows found in ISSUE sheet');
        return new Map();
      }

      const headerRow = rows[0] || [];
      console.log('ISSUE header row:', headerRow);

      // Find PO and Issue Qty columns
      const findColumnIndex = (patterns: string[]) => {
        for (let i = 0; i < headerRow.length; i++) {
          const header = String(headerRow[i]).toLowerCase().trim();
          if (patterns.some(pattern => header.includes(pattern.toLowerCase()))) {
            return i;
          }
        }
        return -1;
      };

      const poIndex = findColumnIndex(['po', 'order']);
      const issueQtyIndex = findColumnIndex(['issue', 'qty', 'quantity']);

      console.log(`ISSUE column indices - PO: ${poIndex}, Issue Qty: ${issueQtyIndex}`);

      if (poIndex === -1 || issueQtyIndex === -1) {
        console.warn('Could not find PO or Issue Qty columns in ISSUE sheet');
        return new Map();
      }

      const issueQtyMap = new Map<string, number>();

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[poIndex]) continue;

        const poNumber = String(row[poIndex]).trim();
        const rawIssueQty = row[issueQtyIndex];
        
        let issueQty = 0;
        if (rawIssueQty !== undefined && rawIssueQty !== null && rawIssueQty !== '') {
          const issueQtyStr = String(rawIssueQty).trim();
          const cleanIssueQty = issueQtyStr.replace(/[^0-9.]/g, '');
          issueQty = parseInt(cleanIssueQty) || 0;
        }

        if (issueQty > 0) {
          const existingQty = issueQtyMap.get(poNumber) || 0;
          issueQtyMap.set(poNumber, existingQty + issueQty);
          console.log(`Issue Qty for ${poNumber}: ${issueQty} (total: ${existingQty + issueQty})`);
        }
      }

      console.log(`Processed issue quantities for ${issueQtyMap.size} POs`);
      return issueQtyMap;
    } catch (error) {
      console.error('Error fetching issue quantities:', error);
      return new Map();
    }
  }

  async fetchOrders(): Promise<SheetOrder[]> {
    try {
      // Fetch all data in parallel
      const [orderRows, cutQtyMap, issueQtyMap] = await Promise.all([
        this.fetchSheetData(this.orderSheetName),
        this.fetchCutQuantities(),
        this.fetchIssueQuantities()
      ]);

      console.log(`Fetched ${orderRows.length} rows from ${this.orderSheetName} sheet`);
      
      if (orderRows.length < 2) {
        console.log('No data rows found in order sheet');
        return [];
      }

      // Log the header row to understand the structure
      console.log('Order sheet header row:', orderRows[0]);

      const orders: SheetOrder[] = [];
      let totalCount = 0;
      let excludedCount = 0;
      
      // Try to find the correct column indices by examining the header
      const headerRow = orderRows[0] || [];
      
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
      
      for (let i = 1; i < orderRows.length; i++) {
        const row = orderRows[i];
        if (!row[poIndex]) continue;

        totalCount++;
        
        // Check if PED (Plan End Date) column has a value - if yes, exclude this order
        const planEndDate = row[pedIndex];
        if (planEndDate && planEndDate.trim() !== '') {
          excludedCount++;
          console.log(`Excluding order ${row[poIndex]} - already has PED: ${planEndDate}`);
          continue;
        }

        const poNumber = String(row[poIndex]).trim();

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

        // Get cut and issue quantities from the maps
        const cutQuantity = cutQtyMap.get(poNumber) || 0;
        const issueQuantity = issueQtyMap.get(poNumber) || 0;

        console.log(`Order ${poNumber}: Qty=${qty}, Cut=${cutQuantity}, Issue=${issueQuantity}`);

        // Only add orders with valid quantities
        if (qty > 0) {
          orders.push({
            poNumber: poNumber,
            styleName: row[styleIndex] || '',
            smv: smv,
            qty: qty,
            moCount: moCount,
            planStartDate: row[5] || undefined,
            planEndDate: row[pedIndex] || undefined,
            cutQuantity: cutQuantity,
            issueQuantity: issueQuantity,
          });
        } else {
          console.log(`Skipping order ${poNumber} - invalid quantity: ${qty}`);
        }
      }

      console.log(`Total orders in sheet: ${totalCount}`);
      console.log(`Orders excluded (have PED): ${excludedCount}`);
      console.log(`Orders loaded with valid quantities: ${orders.length}`);
      
      return orders;
    } catch (error) {
      console.error('Error in fetchOrders:', error);
      throw error;
    }
  }

  async updateOrderSchedule(order: Order, startDate: Date, endDate: Date): Promise<void> {
    console.log('Google Sheets update schedule called for order:', order.poNumber);
    // Note: This would require write permissions to the sheet
    // For now, we'll just log the update attempt
    console.log(`Would update order ${order.poNumber} with start: ${startDate.toISOString()}, end: ${endDate.toISOString()}`);
  }
}

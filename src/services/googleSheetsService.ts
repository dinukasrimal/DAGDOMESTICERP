
export interface SheetOrder {
  PO_Number: string;
  Style_Name: string;
  SMV: number;
  QTY: number;
  MO_Count: number;
  Plan_Start_Date?: string;
  Plan_End_Date?: string;
  Plan_Cut_Start?: string;
}

export class GoogleSheetsService {
  private apiKey: string;
  private spreadsheetId: string;
  private range: string;

  constructor(apiKey: string, spreadsheetId: string, range: string = 'ORDER SECTION!A:H') {
    this.apiKey = apiKey;
    this.spreadsheetId = spreadsheetId;
    this.range = range;
  }

  async fetchOrders(): Promise<SheetOrder[]> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${this.range}?key=${this.apiKey}`;
      
      console.log('Fetching from URL:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('API Error Response:', errorData);
        
        if (response.status === 403) {
          throw new Error(`Permission denied. Please check:
1. Your API key has Google Sheets API enabled
2. The spreadsheet is publicly accessible or shared with your API key
3. The API key is valid and not expired`);
        }
        
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rows = data.values || [];
      
      console.log('Raw sheet data:', rows);
      
      if (rows.length === 0) {
        console.log('No data found in sheet');
        return [];
      }

      // Assume first row is headers
      const headers = rows[0];
      console.log('Sheet headers:', headers);
      
      const orders: SheetOrder[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 0 || !row[0]) continue; // Skip empty rows

        const order: SheetOrder = {
          PO_Number: row[0] || '',
          Style_Name: row[1] || '',
          SMV: parseFloat(row[2]) || 0,
          QTY: parseInt(row[3]) || 0,
          MO_Count: parseInt(row[4]) || 0,
          Plan_Start_Date: row[5] || undefined,
          Plan_End_Date: row[6] || undefined,
          Plan_Cut_Start: row[7] || undefined,
        };

        console.log('Parsed order:', order);
        orders.push(order);
      }

      console.log('Total orders parsed:', orders.length);
      return orders;
    } catch (error) {
      console.error('Error fetching orders from Google Sheets:', error);
      throw error;
    }
  }

  async updateOrderSchedule(poNumber: string, planStartDate: string, planEndDate: string, planCutStart: string): Promise<void> {
    try {
      // First, find the row for this PO Number
      const orders = await this.fetchOrders();
      const orderIndex = orders.findIndex(order => order.PO_Number === poNumber);
      
      if (orderIndex === -1) {
        throw new Error(`Order with PO Number ${poNumber} not found`);
      }

      // Row index in sheet (accounting for header row)
      const rowIndex = orderIndex + 2; // +1 for header, +1 for 0-based to 1-based indexing

      const updateRange = `ORDER SECTION!F${rowIndex}:H${rowIndex}`;
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${updateRange}?valueInputOption=RAW&key=${this.apiKey}`;

      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [[planStartDate, planEndDate, planCutStart]]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Update error:', errorData);
        throw new Error(`Failed to update sheet: ${response.status} ${response.statusText}`);
      }

      console.log(`Updated schedule for PO ${poNumber}`);
    } catch (error) {
      console.error('Error updating Google Sheets:', error);
      throw error;
    }
  }
}


export interface SheetOrder {
  PO_Number: string;
  Style_ID: string;
  Order_Quantity: number;
  SMV: number;
  MO_Count: number;
  Cut_Quantity: number;
  Issue_Quantity: number;
  Plan_Start_Date?: string;
  Plan_End_Date?: string;
  Plan_Cut_Start?: string;
}

export class GoogleSheetsService {
  private apiKey: string;
  private spreadsheetId: string;
  private range: string;

  constructor(apiKey: string, spreadsheetId: string, range: string = 'Sheet1!A:J') {
    this.apiKey = apiKey;
    this.spreadsheetId = spreadsheetId;
    this.range = range;
  }

  async fetchOrders(): Promise<SheetOrder[]> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${this.range}?key=${this.apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }

      const data = await response.json();
      const rows = data.values || [];
      
      if (rows.length === 0) return [];

      // Assume first row is headers
      const headers = rows[0];
      const orders: SheetOrder[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length === 0 || !row[0]) continue; // Skip empty rows

        const order: SheetOrder = {
          PO_Number: row[0] || '',
          Style_ID: row[1] || '',
          Order_Quantity: parseInt(row[2]) || 0,
          SMV: parseFloat(row[3]) || 0,
          MO_Count: parseInt(row[4]) || 0,
          Cut_Quantity: parseInt(row[5]) || 0,
          Issue_Quantity: parseInt(row[6]) || 0,
          Plan_Start_Date: row[7] || undefined,
          Plan_End_Date: row[8] || undefined,
          Plan_Cut_Start: row[9] || undefined,
        };

        orders.push(order);
      }

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

      const updateRange = `Sheet1!H${rowIndex}:J${rowIndex}`;
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
        throw new Error(`Failed to update sheet: ${response.statusText}`);
      }

      console.log(`Updated schedule for PO ${poNumber}`);
    } catch (error) {
      console.error('Error updating Google Sheets:', error);
      throw error;
    }
  }
}

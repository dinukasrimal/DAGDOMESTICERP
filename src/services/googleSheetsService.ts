
export interface SheetOrder {
  poNumber: string;
  styleName: string;
  smv: number;
  qty: number;
  moCount: number;
  planStartDate?: string;
  planEndDate?: string;
  planCutStart?: string;
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
    const range = `${this.sheetName}!A:H`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
    
    console.log('Fetching from:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Sheets API Error:', errorText);
      throw new Error(`Google Sheets API error: ${response.status}`);
    }

    const data = await response.json();
    const rows = data.values || [];
    
    if (rows.length < 2) {
      return [];
    }

    // Skip header row and process data
    const orders: SheetOrder[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue; // Skip empty rows

      orders.push({
        poNumber: row[0] || '',
        styleName: row[1] || '',
        smv: parseFloat(row[2]) || 0,
        qty: parseInt(row[3]) || 0,
        moCount: parseInt(row[4]) || 0,
        planStartDate: row[5] || undefined,
        planEndDate: row[6] || undefined,
        planCutStart: row[7] || undefined,
      });
    }

    return orders;
  }
}

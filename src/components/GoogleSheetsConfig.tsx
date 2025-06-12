
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Sheet, CheckCircle, AlertCircle } from 'lucide-react';

interface GoogleSheetsConfigProps {
  onConfigured: () => void;
  isConfigured: boolean;
}

export const GoogleSheetsConfig: React.FC<GoogleSheetsConfigProps> = ({
  onConfigured,
  isConfigured
}) => {
  const [apiKey, setApiKey] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [range, setRange] = useState('Sheet1!A:J');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim() || !spreadsheetId.trim()) {
      setError('API Key and Spreadsheet ID are required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Store configuration in localStorage for now
      localStorage.setItem('googleSheets_apiKey', apiKey);
      localStorage.setItem('googleSheets_spreadsheetId', spreadsheetId);
      localStorage.setItem('googleSheets_range', range);
      
      onConfigured();
    } catch (err) {
      setError('Failed to save configuration');
    } finally {
      setIsLoading(false);
    }
  };

  if (isConfigured) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Sheet className="h-5 w-5" />
            <span>Google Sheets</span>
            <Badge variant="default" className="ml-auto">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Google Sheets integration is active. Orders will be synced automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Sheet className="h-5 w-5" />
          <span>Connect Google Sheets</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Google Sheets API Key</label>
          <Input
            type="password"
            placeholder="Enter your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        
        <div>
          <label className="text-sm font-medium">Spreadsheet ID</label>
          <Input
            placeholder="Enter spreadsheet ID from URL"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
          />
        </div>
        
        <div>
          <label className="text-sm font-medium">Range (optional)</label>
          <Input
            placeholder="Sheet1!A:J"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          />
        </div>
        
        {error && (
          <div className="flex items-center space-x-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
        
        <Button onClick={handleSave} disabled={isLoading} className="w-full">
          {isLoading ? 'Connecting...' : 'Connect to Google Sheets'}
        </Button>
        
        <p className="text-xs text-muted-foreground">
          Make sure your Google Sheet has columns: PO_Number, Style_ID, Order_Quantity, SMV, MO_Count, Cut_Quantity, Issue_Quantity
        </p>
      </CardContent>
    </Card>
  );
};

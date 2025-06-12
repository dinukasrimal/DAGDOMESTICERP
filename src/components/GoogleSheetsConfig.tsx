
import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Sheet, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';

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
  const [range, setRange] = useState('ORDER SECTION!A:H');
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
            Google Sheets integration is active. Orders will be synced from the "ORDER SECTION" tab.
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
        <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm">
          <p className="font-medium text-yellow-800 mb-2">Setup Requirements:</p>
          <ul className="text-yellow-700 space-y-1 text-xs">
            <li>1. Enable Google Sheets API in Google Cloud Console</li>
            <li>2. Create an API key with Sheets API access</li>
            <li>3. Make your sheet publicly viewable (anyone with link can view)</li>
            <li>4. Ensure your sheet has an "ORDER SECTION" tab</li>
          </ul>
          <a 
            href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center mt-2 text-blue-600 hover:text-blue-800"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Enable Google Sheets API
          </a>
        </div>
        
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
          <p className="text-xs text-muted-foreground mt-1">
            Found in the URL: docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
          </p>
        </div>
        
        <div>
          <label className="text-sm font-medium">Sheet Tab & Range</label>
          <Input
            placeholder="ORDER SECTION!A:H"
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
          Expected columns in ORDER SECTION tab: PO Number, Style Name, SMV, QTY, MO Count
        </p>
      </CardContent>
    </Card>
  );
};

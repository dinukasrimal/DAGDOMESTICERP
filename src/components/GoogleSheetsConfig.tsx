
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
      localStorage.setItem('googleSheets_apiKey', apiKey);
      localStorage.setItem('googleSheets_spreadsheetId', spreadsheetId);
      
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
            Connected to ORDER SECTION tab. Expected columns: PO Number, Style Name, SMV, QTY, MO Count
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
        <div className="p-3 bg-blue-50 border-l-4 border-blue-400 text-sm">
          <p className="font-medium text-blue-800 mb-1">Requirements:</p>
          <ul className="text-blue-700 space-y-1 text-xs">
            <li>• Sheet must have an "ORDER SECTION" tab</li>
            <li>• Columns: PO Number, Style Name, SMV, QTY, MO Count</li>
            <li>• Sheet must be publicly viewable</li>
            <li>• API key must have Google Sheets API enabled</li>
          </ul>
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
      </CardContent>
    </Card>
  );
};

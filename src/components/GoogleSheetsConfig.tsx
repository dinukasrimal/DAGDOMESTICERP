import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Sheet, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface GoogleSheetsConfigProps {
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  onSync: () => Promise<void>;
  onConfigure: () => void;
  onClearError: () => void;
}

export const GoogleSheetsConfig: React.FC<GoogleSheetsConfigProps> = ({
  isLoading,
  error,
  isConfigured,
  onSync,
  onConfigure,
  onClearError
}) => {
  const [apiKey, setApiKey] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');

  const handleSave = async () => {
    if (!apiKey.trim() || !spreadsheetId.trim()) {
      return;
    }

    try {
      localStorage.setItem('googleSheets_apiKey', apiKey);
      localStorage.setItem('googleSheets_spreadsheetId', spreadsheetId);
      
      onConfigure();
    } catch (err) {
      console.error('Failed to save configuration:', err);
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
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connected to ORDER SECTION tab. Expected columns: PO Number, Style Name, SMV, QTY, MO Count
          </p>
          
          {error && (
            <div className="flex items-center space-x-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={onClearError}>
                Clear
              </Button>
            </div>
          )}
          
          <Button 
            onClick={onSync} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Orders
              </>
            )}
          </Button>
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
        
        <Button onClick={handleSave} disabled={isLoading || !apiKey.trim() || !spreadsheetId.trim()} className="w-full">
          {isLoading ? 'Connecting...' : 'Connect to Google Sheets'}
        </Button>
      </CardContent>
    </Card>
  );
};

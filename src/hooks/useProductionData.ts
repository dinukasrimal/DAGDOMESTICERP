
import { useState, useEffect, useCallback } from 'react';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { dataService } from '../services/dataService';

export const useProductionData = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [rampUpPlans, setRampUpPlans] = useState<RampUpPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGoogleSheetsConfigured, setIsGoogleSheetsConfigured] = useState(false);

  useEffect(() => {
    const apiKey = localStorage.getItem('googleSheets_apiKey');
    const spreadsheetId = localStorage.getItem('googleSheets_spreadsheetId');
    
    if (apiKey && spreadsheetId) {
      dataService.initializeGoogleSheets(apiKey, spreadsheetId);
      setIsGoogleSheetsConfigured(true);
    }

    // Load initial data
    setOrders(dataService.getOrders());
    setProductionLines(dataService.getProductionLines());
    setHolidays(dataService.getHolidays());
    setRampUpPlans(dataService.getRampUpPlans());
  }, []);

  const fetchOrdersFromGoogleSheets = useCallback(async () => {
    if (!isGoogleSheetsConfigured) {
      setError('Google Sheets not configured');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const fetchedOrders = await dataService.fetchOrdersFromSheet();
      setOrders(fetchedOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setIsLoading(false);
    }
  }, [isGoogleSheetsConfigured]);

  const configureGoogleSheets = useCallback(() => {
    const apiKey = localStorage.getItem('googleSheets_apiKey');
    const spreadsheetId = localStorage.getItem('googleSheets_spreadsheetId');
    
    if (apiKey && spreadsheetId) {
      dataService.initializeGoogleSheets(apiKey, spreadsheetId);
      setIsGoogleSheetsConfigured(true);
      fetchOrdersFromGoogleSheets();
    }
  }, [fetchOrdersFromGoogleSheets]);

  const updateOrderStatus = useCallback((orderId: string, status: 'pending' | 'scheduled' | 'in_progress' | 'completed') => {
    setOrders(prev => prev.map(order => 
      order.id === orderId ? { ...order, status } : order
    ));
  }, []);

  // Removed updateOrderSchedule since we're no longer writing to Google Sheets
  // This was causing the TypeScript error

  return {
    orders,
    productionLines,
    holidays,
    rampUpPlans,
    isLoading,
    error,
    isGoogleSheetsConfigured,
    setOrders,
    setProductionLines,
    setHolidays,
    setRampUpPlans,
    fetchOrdersFromGoogleSheets,
    configureGoogleSheets,
    updateOrderStatus,
    clearError: () => setError(null)
  };
};

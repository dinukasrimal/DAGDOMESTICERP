
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
  }, []);

  useEffect(() => {
    setProductionLines(dataService.getProductionLines());
    setHolidays(dataService.getHolidays());
    setRampUpPlans(dataService.getRampUpPlans());
    setOrders(dataService.getOrders());
  }, []);

  const fetchOrdersFromGoogleSheets = useCallback(async () => {
    if (!isGoogleSheetsConfigured) return;

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

  const updateOrderSchedule = useCallback(async (order: Order, startDate: Date, endDate: Date) => {
    if (!isGoogleSheetsConfigured) return;

    try {
      await dataService.updateOrderSchedule(order, startDate, endDate);
    } catch (err) {
      console.error('Failed to update order schedule in Google Sheets:', err);
      throw err;
    }
  }, [isGoogleSheetsConfigured]);

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
    updateOrderSchedule,
    clearError: () => setError(null)
  };
};

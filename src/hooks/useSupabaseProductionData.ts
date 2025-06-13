
import { useState, useEffect, useCallback } from 'react';
import { Order, ProductionLine, Holiday, RampUpPlan } from '../types/scheduler';
import { supabaseDataService } from '../services/supabaseDataService';
import { dataService } from '../services/dataService';

export const useSupabaseProductionData = () => {
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

  // Load data from Supabase on component mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [
        fetchedProductionLines,
        fetchedHolidays,
        fetchedRampUpPlans,
        fetchedOrders
      ] = await Promise.all([
        supabaseDataService.getProductionLines(),
        supabaseDataService.getHolidays(),
        supabaseDataService.getRampUpPlans(),
        supabaseDataService.getOrders()
      ]);

      setProductionLines(fetchedProductionLines);
      setHolidays(fetchedHolidays);
      setRampUpPlans(fetchedRampUpPlans);
      setOrders(fetchedOrders);
      
      console.log('✅ Successfully loaded all data from Supabase');
    } catch (err) {
      console.error('❌ Error loading data from Supabase:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchOrdersFromGoogleSheets = useCallback(async () => {
    if (!isGoogleSheetsConfigured) {
      console.log('Google Sheets not configured');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Starting to fetch orders from Google Sheets...');
      const fetchedOrders = await dataService.fetchOrdersFromSheet();
      console.log(`✅ Successfully synced ${fetchedOrders.length} orders`);
      
      const pendingCount = fetchedOrders.filter(o => o.status === 'pending').length;
      const scheduledCount = fetchedOrders.filter(o => o.status === 'scheduled').length;
      
      console.log(`📊 Sync Summary: ${pendingCount} pending, ${scheduledCount} scheduled orders`);
      
      setOrders(fetchedOrders);
    } catch (err) {
      console.error('❌ Error in fetchOrdersFromGoogleSheets:', err);
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

  const updateOrderInDatabase = useCallback(async (orderId: string, updates: Partial<Order>) => {
    try {
      const updatedOrder = await supabaseDataService.updateOrder(orderId, updates);
      setOrders(prev => prev.map(order => 
        order.id === orderId ? updatedOrder : order
      ));
      return updatedOrder;
    } catch (err) {
      console.error('Failed to update order in database:', err);
      throw err;
    }
  }, []);

  const createOrderInDatabase = useCallback(async (orderData: Omit<Order, 'id'>) => {
    try {
      const newOrder = await supabaseDataService.createOrder(orderData);
      setOrders(prev => [newOrder, ...prev]);
      return newOrder;
    } catch (err) {
      console.error('Failed to create order in database:', err);
      throw err;
    }
  }, []);

  const deleteOrderFromDatabase = useCallback(async (orderId: string) => {
    try {
      await supabaseDataService.deleteOrder(orderId);
      setOrders(prev => prev.filter(order => order.id !== orderId));
    } catch (err) {
      console.error('Failed to delete order from database:', err);
      throw err;
    }
  }, []);

  const updateOrderStatus = useCallback(async (orderId: string, status: 'pending' | 'scheduled' | 'in_progress' | 'completed') => {
    await updateOrderInDatabase(orderId, { status });
  }, [updateOrderInDatabase]);

  const updateProductionLinesInDatabase = useCallback(async (lines: ProductionLine[]) => {
    try {
      // For simplicity, we'll just update the local state
      // In a real app, you might want to sync each line individually
      setProductionLines(lines);
    } catch (err) {
      console.error('Failed to update production lines:', err);
      throw err;
    }
  }, []);

  const updateHolidaysInDatabase = useCallback(async (holidays: Holiday[]) => {
    try {
      setHolidays(holidays);
    } catch (err) {
      console.error('Failed to update holidays:', err);
      throw err;
    }
  }, []);

  const updateRampUpPlansInDatabase = useCallback(async (plans: RampUpPlan[]) => {
    try {
      setRampUpPlans(plans);
    } catch (err) {
      console.error('Failed to update ramp up plans:', err);
      throw err;
    }
  }, []);

  return {
    orders,
    productionLines,
    holidays,
    rampUpPlans,
    isLoading,
    error,
    isGoogleSheetsConfigured,
    setOrders,
    setProductionLines: updateProductionLinesInDatabase,
    setHolidays: updateHolidaysInDatabase,
    setRampUpPlans: updateRampUpPlansInDatabase,
    fetchOrdersFromGoogleSheets,
    configureGoogleSheets,
    updateOrderSchedule,
    updateOrderStatus,
    updateOrderInDatabase,
    createOrderInDatabase,
    deleteOrderFromDatabase,
    loadAllData,
    clearError: () => setError(null)
  };
};

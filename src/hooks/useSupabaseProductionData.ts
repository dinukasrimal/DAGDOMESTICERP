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
      console.log(`📊 Loaded ${fetchedOrders.length} orders from database`);
    } catch (err) {
      console.error('❌ Error loading data from Supabase:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncOrderToDatabase = useCallback(async (order: Order) => {
    try {
      // Check if order already exists in database by PO number
      const existingOrders = await supabaseDataService.getOrders();
      const existingOrder = existingOrders.find(o => o.poNumber === order.poNumber);
      
      if (existingOrder) {
        console.log(`📝 Updating existing order: ${order.poNumber}`);
        return await supabaseDataService.updateOrder(existingOrder.id, {
          styleId: order.styleId,
          orderQuantity: order.orderQuantity,
          smv: order.smv,
          moCount: order.moCount,
          cutQuantity: order.cutQuantity,
          issueQuantity: order.issueQuantity,
          status: order.status,
          planStartDate: order.planStartDate,
          planEndDate: order.planEndDate,
          actualProduction: order.actualProduction || {},
          assignedLineId: order.assignedLineId
        });
      } else {
        console.log(`➕ Creating new order: ${order.poNumber}`);
        return await supabaseDataService.createOrder({
          poNumber: order.poNumber,
          styleId: order.styleId,
          orderQuantity: order.orderQuantity,
          smv: order.smv,
          moCount: order.moCount,
          cutQuantity: order.cutQuantity,
          issueQuantity: order.issueQuantity,
          status: order.status,
          planStartDate: order.planStartDate,
          planEndDate: order.planEndDate,
          actualProduction: order.actualProduction || {},
          assignedLineId: order.assignedLineId
        });
      }
    } catch (error) {
      console.error(`❌ Failed to sync order ${order.poNumber} to database:`, error);
      throw error;
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
      console.log('🔄 Starting to fetch orders from Google Sheets...');
      
      // Pass current orders to preserve scheduled ones
      const currentOrders = await supabaseDataService.getOrders();
      const fetchedOrders = await dataService.fetchOrdersFromSheet(currentOrders);
      
      console.log(`📥 Processed ${fetchedOrders.length} orders from Google Sheets sync`);
      
      if (fetchedOrders.length === 0) {
        console.log('⚠️ No orders processed from Google Sheets sync');
        return;
      }

      // Sync each order to Supabase database
      console.log('💾 Syncing orders to Supabase database...');
      const syncedOrders: Order[] = [];
      let successCount = 0;
      let errorCount = 0;

      for (const order of fetchedOrders) {
        try {
          const syncedOrder = await syncOrderToDatabase(order);
          syncedOrders.push(syncedOrder);
          successCount++;
        } catch (error) {
          console.error(`Failed to sync order ${order.poNumber}:`, error);
          errorCount++;
        }
      }

      console.log(`✅ Sync complete: ${successCount} successful, ${errorCount} failed`);
      
      // Reload all orders from database to get the latest state
      const allOrders = await supabaseDataService.getOrders();
      setOrders(allOrders);
      
      const pendingCount = allOrders.filter(o => o.status === 'pending').length;
      const scheduledCount = allOrders.filter(o => o.status === 'scheduled').length;
      
      console.log(`📊 Final state: ${allOrders.length} total orders (${pendingCount} pending, ${scheduledCount} scheduled)`);
      
    } catch (err) {
      console.error('❌ Error in fetchOrdersFromGoogleSheets:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch and sync orders');
    } finally {
      setIsLoading(false);
    }
  }, [isGoogleSheetsConfigured, syncOrderToDatabase]);

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
      console.log(`📝 Updating order ${orderId} in database with:`, updates);
      const updatedOrder = await supabaseDataService.updateOrder(orderId, updates);
      setOrders(prev => prev.map(order => 
        order.id === orderId ? updatedOrder : order
      ));
      console.log(`✅ Successfully updated order ${orderId}`);
      return updatedOrder;
    } catch (err) {
      console.error('Failed to update order in database:', err);
      throw err;
    }
  }, []);

  const createOrderInDatabase = useCallback(async (orderData: Omit<Order, 'id'>) => {
    try {
      console.log(`➕ Creating new order in database:`, orderData.poNumber);
      const newOrder = await supabaseDataService.createOrder(orderData);
      setOrders(prev => [newOrder, ...prev]);
      console.log(`✅ Successfully created order ${newOrder.poNumber}`);
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


import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import OdooIntegration from "./pages/OdooIntegration";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import { RawMaterialsManager } from "./components/materials/RawMaterialsManager";
import { BOMManager } from "./components/bom/BOMManager";
import { PurchaseOrderManager } from "./components/materials/PurchaseOrderManager";
import { GoodsReceivedManager } from "./components/materials/GoodsReceivedManager";
import { GoodsIssueManager } from "./components/materials/GoodsIssueManager";
import MarkerRequests from "./pages/MarkerRequests";
import CuttingRecords from "./pages/CuttingRecords";
import CutIssueRecords from "./pages/CutIssueRecords";
import SewingOutputRecords from "./pages/SewingOutputRecords";
import SewingOrderSummaryPage from "./pages/SewingOrderSummaryPage";
import Bills from "./pages/Bills";
import AccountingChartOfAccounts from "./pages/AccountingChartOfAccounts";
import AccountingManualJournals from "./pages/AccountingManualJournals";
import UserManagement from "./pages/UserManagement";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/odoo" element={
              <ProtectedRoute>
                <OdooIntegration />
              </ProtectedRoute>
            } />
            <Route path="/reports" element={
              <ProtectedRoute componentKey="reports">
                <Reports />
              </ProtectedRoute>
            } />
            <Route path="/materials" element={
              <ProtectedRoute componentKey="materials">
                <RawMaterialsManager />
              </ProtectedRoute>
            } />
            <Route path="/bom" element={
              <ProtectedRoute componentKey="bom">
                <BOMManager />
              </ProtectedRoute>
            } />
            <Route path="/purchase-orders" element={
              <ProtectedRoute componentKey="purchase-orders">
                <PurchaseOrderManager />
              </ProtectedRoute>
            } />
            <Route path="/goods-received" element={
              <ProtectedRoute componentKey="goods-received">
                <GoodsReceivedManager />
              </ProtectedRoute>
            } />
            <Route path="/goods-issue" element={
              <ProtectedRoute componentKey="goods-issue">
                <GoodsIssueManager />
              </ProtectedRoute>
            } />
            <Route path="/marker-requests" element={
              <ProtectedRoute componentKey="marker-requests">
                <MarkerRequests />
              </ProtectedRoute>
            } />
            <Route path="/cutting-records" element={
              <ProtectedRoute componentKey="cutting-records">
                <CuttingRecords />
              </ProtectedRoute>
            } />
            <Route path="/cut-issue-records" element={
              <ProtectedRoute componentKey="cut-issue-records">
                <CutIssueRecords />
              </ProtectedRoute>
            } />
            <Route path="/sewing-output" element={
              <ProtectedRoute componentKey="sewing-output">
                <SewingOutputRecords />
              </ProtectedRoute>
            } />
            <Route path="/sewing-order-summary" element={
              <ProtectedRoute componentKey="sewing-order-summary">
                <SewingOrderSummaryPage />
              </ProtectedRoute>
            } />
            <Route path="/bills" element={
              <ProtectedRoute componentKey="bills">
                <Bills />
              </ProtectedRoute>
            } />
            <Route path="/accounting/chart-of-accounts" element={
              <ProtectedRoute componentKey="accounting-chart">
                <AccountingChartOfAccounts />
              </ProtectedRoute>
            } />
            <Route path="/accounting/manual-journals" element={
              <ProtectedRoute componentKey="accounting-journals">
                <AccountingManualJournals />
              </ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute componentKey="user-management">
                <UserManagement />
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;

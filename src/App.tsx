
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
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            } />
            <Route path="/materials" element={
              <ProtectedRoute>
                <RawMaterialsManager />
              </ProtectedRoute>
            } />
            <Route path="/bom" element={
              <ProtectedRoute>
                <BOMManager />
              </ProtectedRoute>
            } />
            <Route path="/purchase-orders" element={
              <ProtectedRoute>
                <PurchaseOrderManager />
              </ProtectedRoute>
            } />
            <Route path="/goods-received" element={
              <ProtectedRoute>
                <GoodsReceivedManager />
              </ProtectedRoute>
            } />
            <Route path="/goods-issue" element={
              <ProtectedRoute>
                <GoodsIssueManager />
              </ProtectedRoute>
            } />
            <Route path="/marker-requests" element={
              <ProtectedRoute>
                <MarkerRequests />
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

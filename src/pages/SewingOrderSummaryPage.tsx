import React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { SewingOrderSummary } from '@/components/sewing/SewingOrderSummary';

const SewingOrderSummaryPage: React.FC = () => {
  return (
    <ModernLayout
      title="Sewing Order Summary"
      description="Search and review purchase orders with variant-level sewing metrics."
      icon={FileSpreadsheet}
      gradient="bg-gradient-to-r from-blue-500 to-emerald-500"
    >
      <SewingOrderSummary />
    </ModernLayout>
  );
};

export default SewingOrderSummaryPage;

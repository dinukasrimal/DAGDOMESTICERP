
import React from "react";
import { Order, ProductionLine } from "../types/scheduler";

interface SchedulingBoardLinePdfReportContainersProps {
  productionLines: ProductionLine[];
  orders: Order[];
  downloadElementAsPdf: (domId: string, fileName: string) => Promise<void>;
}

export const SchedulingBoardLinePdfReportContainers: React.FC<SchedulingBoardLinePdfReportContainersProps> = ({
  productionLines,
  orders,
  downloadElementAsPdf
}) => {
  // Helper: Get all scheduled orders (distinct by orderId) for a line
  const getScheduledOrdersForLine = (lineId: string) => {
    return orders
      .filter(order => order.status === 'scheduled' && order.assignedLineId === lineId)
      .sort((a, b) =>
        (a.planStartDate?.getTime() || 0) - (b.planStartDate?.getTime() || 0)
      );
  };

  return (
    <>
      {productionLines.map(line => {
        const scheduledOrders = getScheduledOrdersForLine(line.id);
        if (scheduledOrders.length === 0) return null;
        return (
          <div 
            id={`line-pdf-report-${line.id}`}
            key={`printable-${line.id}`}
            style={{ position: 'absolute', left: -9999, top: 0, width: '800px', background: '#fff', color: '#111', padding: 24, zIndex: -1000, fontSize: 14 }}
          >
            <div style={{ borderBottom: '2px solid #111', paddingBottom: 8, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>Production Plan Report</h2>
              <div>Line: <b>{line.name}</b></div>
              <div>Generated on: {new Date().toLocaleString()}</div>
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>Order #</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>Style</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #aaa', padding: 6 }}>Quantity</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>PSD (Plan Start)</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>PED (Plan End)</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #aaa', padding: 6 }}>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {scheduledOrders.map(order => (
                  <tr key={order.id}>
                    <td style={{ padding: 6 }}>{order.poNumber}</td>
                    <td style={{ padding: 6 }}>{order.styleId}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{order.orderQuantity.toLocaleString()}</td>
                    <td style={{ padding: 6 }}>
                      {order.planStartDate ? order.planStartDate.toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: 6 }}>
                      {order.planEndDate ? order.planEndDate.toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: 6 }}>
                      {order.planEndDate
                        ? (() => {
                            const d = new Date(order.planEndDate!);
                            d.setDate(d.getDate() + 1);
                            return d.toLocaleDateString();
                          })()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 24, fontStyle: 'italic', fontSize: 13 }}>
              * Delivery is estimated as one day after Plan End Date.
            </div>
          </div>
        );
      })}
    </>
  );
};

export default SchedulingBoardLinePdfReportContainers;

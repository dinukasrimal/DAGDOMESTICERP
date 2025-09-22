import React, { useEffect, useMemo, useState } from 'react';
import { ModernLayout } from '@/components/layout/ModernLayout';
import { MarkerRequestForm } from '@/components/marker/MarkerRequestForm';
import { markerRequestService, MarkerRequest } from '@/services/markerRequestService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Ruler, Plus, Loader2, RefreshCw, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MarkerFabricAssignment, MarkerPurchaseOrder, MarkerPurchaseOrderLine } from '@/types/marker';

const MarkerRequests: React.FC = () => {
  const { toast } = useToast();
  const [markerRequests, setMarkerRequests] = useState<MarkerRequest[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<MarkerPurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPoLoading, setIsPoLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formInstanceKey, setFormInstanceKey] = useState(() => Date.now());
  const [searchTerm, setSearchTerm] = useState('');

  const fetchMarkerRequests = async (withLoader: boolean = true) => {
    if (withLoader) setIsLoading(true);
    try {
      const requests = await markerRequestService.getMarkerRequests();
      setMarkerRequests(requests);
    } catch (error: any) {
      toast({
        title: 'Failed to load marker requests',
        description: error?.message || 'Unable to retrieve marker requests. Please try again later.',
        variant: 'destructive',
      });
    } finally {
      if (withLoader) setIsLoading(false);
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      setIsPoLoading(true);
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .not('state', 'eq', 'done')
        .not('state', 'eq', 'cancel')
        .order('date_order', { ascending: false })
        .limit(200);

      if (error) throw error;

      const mapped: MarkerPurchaseOrder[] = (data || []).map((order: any) => {
        let orderLines: MarkerPurchaseOrderLine[] = [];
        try {
          const rawLines = typeof order.order_lines === 'string'
            ? JSON.parse(order.order_lines)
            : order.order_lines;
          if (Array.isArray(rawLines)) {
            orderLines = rawLines.map((line: any, index: number) => {
              const qtyRaw = line.product_qty ?? line.product_uom_qty ?? line.qty ?? line.quantity ?? 0;
              const pendingRaw = line.pending_qty ?? line.to_deliver_qty ?? line.to_invoice_qty ?? null;
              return {
                id: line.id ?? `${order.id}-line-${index}`,
                product_name: line.product_name || line.name || 'Unknown Product',
                product_id: line.product_id || line.id,
                product_qty: Number(qtyRaw),
                qty_received: Number(line.qty_received ?? line.received_qty ?? line.qty_done ?? 0),
                qty_delivered: Number(line.qty_delivered ?? 0),
                qty_done: Number(line.qty_done ?? 0),
                pending_qty: pendingRaw != null ? Number(pendingRaw) : undefined,
                reference: line.reference || line.default_code || null,
              } as MarkerPurchaseOrderLine;
            });
          }
        } catch (e) {
          console.warn('Failed to parse order lines for PO', order.name, e);
        }

        return {
          id: order.id,
          name: order.name,
          partner_name: order.partner_name,
          date_order: order.date_order,
          state: order.state,
          po_number: order.name,
          pending_qty: order.pending_qty ?? 0,
          order_lines: orderLines,
        };
      });

      setPurchaseOrders(mapped);
    } catch (error: any) {
      toast({
        title: 'Failed to load purchase orders',
        description: error?.message || 'Unable to retrieve purchase orders. Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsPoLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchMarkerRequests(false), loadPurchaseOrders()]);
      setIsLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMarkerRequests = useMemo(() => {
    if (!searchTerm) return markerRequests;
    return markerRequests.filter(request => {
      const term = searchTerm.toLowerCase();
      return (
        request.marker_number.toLowerCase().includes(term) ||
        request.marker_type.toLowerCase().includes(term) ||
        (request.measurement_type || '').toLowerCase().includes(term) ||
        request.po_ids.some(po => po.toLowerCase().includes(term))
      );
    });
  }, [markerRequests, searchTerm]);

  const usedFabricAssignments = useMemo<MarkerFabricAssignment[]>(
    () =>
      markerRequests.flatMap(request => {
        const assignments: MarkerFabricAssignment[] = [];
        if (Array.isArray(request.fabric_assignments) && request.fabric_assignments.length) {
          assignments.push(...request.fabric_assignments);
        } else if (request.fabric_assignment) {
          assignments.push(request.fabric_assignment);
        }
        return assignments;
      }),
    [markerRequests]
  );

  const getBadgeVariantForType = (type: MarkerRequest['marker_type']) =>
    type === 'body' ? 'default' : 'secondary';

  const handleOpenDialog = () => {
    setFormInstanceKey(Date.now());
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setFormInstanceKey(Date.now());
  };

  const handleMarkerCreated = (marker: MarkerRequest) => {
    setMarkerRequests(prev => [marker, ...prev]);
    toast({ title: 'Marker Request Created', description: `Marker ${marker.marker_number} saved.` });
  };

  const computeTotalFabricYards = (request: MarkerRequest) => {
    if (request.measurement_type !== 'yard') return null;
    if (request.total_fabric_yards && request.total_fabric_yards > 0) return request.total_fabric_yards;
    const lengthYards = (request.marker_length_yards || 0) + (request.marker_length_inches || 0) / 36;
    return Number((lengthYards * (request.layers || 0)).toFixed(3));
  };

  const computeTotalFabricKg = (request: MarkerRequest) => {
    if (request.measurement_type !== 'kg') return null;
    if (request.total_fabric_kg && request.total_fabric_kg > 0) return request.total_fabric_kg;
    const widthMeters = (request.width || 0) * 0.0254;
    const lengthMeters = (request.marker_length_yards || 0) * 0.9144 + (request.marker_length_inches || 0) * 0.0254;
    const layers = request.layers || 0;
    const gsm = request.marker_gsm || 0;
    if (!widthMeters || !lengthMeters || !layers || !gsm) return null;
    return Number(((widthMeters * lengthMeters * layers * gsm) / 1000).toFixed(3));
  };

  const linePendingQuantity = (line: MarkerPurchaseOrderLine) => {
    if (typeof line.pending_qty === 'number' && !isNaN(line.pending_qty)) {
      return line.pending_qty;
    }
    const qty = Number(line.product_qty || 0);
    const received = Number(line.qty_received || line.qty_delivered || line.qty_done || 0);
    return Math.max(0, qty - received);
  };

  const totalPendingForPO = (po: MarkerPurchaseOrder) => {
    return (po.order_lines || []).reduce((sum, line) => sum + linePendingQuantity(line), 0);
  };

  const pendingLineCount = (po: MarkerPurchaseOrder) => {
    return (po.order_lines || []).filter(line => linePendingQuantity(line) > 0).length;
  };

  return (
    <ModernLayout
      title="Marker Requests"
      description="Plan and request fabric markers by combining purchase orders and layer details."
      icon={Ruler}
      gradient="bg-gradient-to-r from-red-500 to-orange-500"
    >
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search marker requests..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => fetchMarkerRequests(true)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
          <Button onClick={handleOpenDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Marker Request
          </Button>
        </div>

        <div className="bg-white/70 rounded-3xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Marker Requests</h2>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
          </div>
          <div className="p-6">
            {filteredMarkerRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No marker requests found. Create one to get started.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Marker No.</TableHead>
                      <TableHead>Marker Type</TableHead>
                      <TableHead>Measurement</TableHead>
                      <TableHead className="text-right">Layers</TableHead>
                      <TableHead className="text-right">Width (in)</TableHead>
                      <TableHead className="text-right">Efficiency %</TableHead>
                      <TableHead>Marker Length</TableHead>
                      <TableHead>Fabric Requirement</TableHead>
                      <TableHead className="text-right">Pieces / Marker</TableHead>
                      <TableHead>Purchase Orders</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMarkerRequests.map(request => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.marker_number}</TableCell>
                        <TableCell>
                          <Badge variant={getBadgeVariantForType(request.marker_type)} className="capitalize">
                            {request.marker_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{request.measurement_type || 'yard'}</TableCell>
                        <TableCell className="text-right">{request.layers}</TableCell>
                        <TableCell className="text-right">{request.width}</TableCell>
                        <TableCell className="text-right">{request.efficiency}</TableCell>
                        <TableCell>
                          <span>{(request.marker_length_yards || 0).toLocaleString()} yd {request.marker_length_inches || 0} in</span>
                        </TableCell>
                        <TableCell>
                          {request.measurement_type === 'kg'
                            ? (() => {
                                const kg = computeTotalFabricKg(request);
                                return kg ? `${kg.toLocaleString()} kg` : '—';
                              })()
                            : (() => {
                                const yards = computeTotalFabricYards(request);
                                return yards ? `${yards.toLocaleString()} yd` : '—';
                              })()}
                        </TableCell>
                        <TableCell className="text-right">{request.pieces_per_marker.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {request.po_ids.map(po => (
                              <Badge key={`${request.id}-${po}`} variant="outline" className="text-xs">
                                {po}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{request.created_at ? new Date(request.created_at).toLocaleString() : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsDialogOpen(true);
          } else {
            handleCloseDialog();
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Marker Request</DialogTitle>
          </DialogHeader>
          <MarkerRequestForm
            key={formInstanceKey}
            purchaseOrders={purchaseOrders}
            usedFabricAssignments={usedFabricAssignments}
            onRefreshPurchaseOrders={loadPurchaseOrders}
            onCreated={handleMarkerCreated}
            onClose={handleCloseDialog}
          />
        </DialogContent>
      </Dialog>
    </ModernLayout>
  );
};

export default MarkerRequests;

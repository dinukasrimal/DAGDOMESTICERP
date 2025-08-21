import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Plus, 
  Package, 
  Calendar, 
  Check, 
  X,
  Search,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Truck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  GoodsReceivedService, 
  GoodsReceived, 
  CreateGoodsReceived, 
  CreateGoodsReceivedLine 
} from '../../services/goodsReceivedService';
import { PurchaseOrderService, PurchaseOrder } from '../../services/purchaseOrderService';
import { ModernLayout } from '../layout/ModernLayout';

const goodsReceivedService = new GoodsReceivedService();
const purchaseOrderService = new PurchaseOrderService();

export const GoodsReceivedManager: React.FC = () => {
  const [goodsReceived, setGoodsReceived] = useState<GoodsReceived[]>([]);
  const [pendingPOs, setPendingPOs] = useState<PurchaseOrder[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedGRN, setSelectedGRN] = useState<GoodsReceived | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  // Form states
  const [formData, setFormData] = useState<CreateGoodsReceived>({
    purchase_order_id: '',
    received_date: new Date().toISOString().split('T')[0],
    notes: '',
    lines: []
  });

  const [receivingLines, setReceivingLines] = useState<{[key: string]: CreateGoodsReceivedLine}>({});
  const [showCloseLineDialog, setShowCloseLineDialog] = useState(false);
  const [linesToClose, setLinesToClose] = useState<{lineId: string, materialName: string, percentage: number}[]>([]);
  const [selectedLinesToClose, setSelectedLinesToClose] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [grnData, poData] = await Promise.all([
        goodsReceivedService.getAllGoodsReceived(),
        purchaseOrderService.getPendingPurchaseOrders()
      ]);
      setGoodsReceived(grnData);
      setPendingPOs(poData);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPO = (poId: string) => {
    const po = pendingPOs.find(p => p.id === poId);
    if (!po) return;

    setSelectedPO(po);
    setFormData(prev => ({ ...prev, purchase_order_id: poId }));

    // Initialize receiving lines with default values
    const initialLines: {[key: string]: CreateGoodsReceivedLine} = {};
    po.lines?.forEach(line => {
      const remainingQty = line.quantity - line.received_quantity;
      if (remainingQty > 0) {
        initialLines[line.id] = {
          purchase_order_line_id: line.id,
          raw_material_id: line.raw_material_id,
          quantity_received: remainingQty,
          unit_price: line.unit_price,
          batch_number: '',
          expiry_date: '',
          notes: ''
        };
      }
    });
    setReceivingLines(initialLines);
  };

  const handleUpdateReceivingLine = (lineId: string, field: keyof CreateGoodsReceivedLine, value: any) => {
    setReceivingLines(prev => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        [field]: value
      }
    }));
  };

  const handleCreateGRN = async () => {
    try {
      if (!formData.purchase_order_id || !selectedPO) {
        toast({
          title: 'Validation Error',
          description: 'Please select a purchase order',
          variant: 'destructive'
        });
        return;
      }

      // Filter lines that have quantity > 0
      const validLines = Object.values(receivingLines).filter(line => line.quantity_received > 0);
      
      if (validLines.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please specify quantities to receive for at least one line',
          variant: 'destructive'
        });
        return;
      }

      // Check for lines that will exceed 75% completion
      const linesToCloseCheck: {lineId: string, materialName: string, percentage: number}[] = [];
      
      validLines.forEach(receivingLine => {
        const poLine = selectedPO.lines?.find(line => line.id === receivingLine.purchase_order_line_id);
        if (poLine) {
          const totalReceived = poLine.received_quantity + receivingLine.quantity_received;
          const percentage = (totalReceived / poLine.quantity) * 100;
          
          if (percentage >= 75) {
            const material = poLine.raw_material;
            linesToCloseCheck.push({
              lineId: poLine.id,
              materialName: material?.name || 'Unknown Material',
              percentage: Math.round(percentage)
            });
          }
        }
      });

      // If lines exceed 75%, show confirmation dialog
      if (linesToCloseCheck.length > 0) {
        setLinesToClose(linesToCloseCheck);
        setSelectedLinesToClose(new Set(linesToCloseCheck.map(l => l.lineId)));
        setShowCloseLineDialog(true);
        return;
      }

      // Otherwise proceed with creating GRN
      await createGRNWithClosedLines([]);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create goods received note',
        variant: 'destructive'
      });
    }
  };

  const createGRNWithClosedLines = async (linesToClose: string[]) => {
    try {
      setLoading(true);
      
      // Filter lines that have quantity > 0
      const validLines = Object.values(receivingLines).filter(line => line.quantity_received > 0);
      
      const grnData: CreateGoodsReceived = {
        ...formData,
        lines: validLines
      };

      const newGRN = await goodsReceivedService.createGoodsReceived(grnData);
      
      // Close selected lines by marking remaining quantity as received
      for (const lineId of linesToClose) {
        const poLine = selectedPO?.lines?.find(line => line.id === lineId);
        if (poLine) {
          const remainingQty = poLine.quantity - poLine.received_quantity;
          if (remainingQty > 0) {
            // Update the received quantity to match the ordered quantity (close the line)
            await purchaseOrderService.updatePurchaseOrderLineReceived(lineId, remainingQty);
          }
        }
      }
      
      setGoodsReceived(prev => [newGRN, ...prev]);
      
      toast({
        title: 'Success',
        description: `Goods Received Note ${newGRN.grn_number} created successfully`
      });

      handleCloseCreateDialog();
      // Reload pending POs to reflect updated received quantities
      const updatedPOs = await purchaseOrderService.getPendingPurchaseOrders();
      setPendingPOs(updatedPOs);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create goods received note',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLineClose = (lineId: string) => {
    setSelectedLinesToClose(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lineId)) {
        newSet.delete(lineId);
      } else {
        newSet.add(lineId);
      }
      return newSet;
    });
  };

  const handleConfirmLineClosures = async () => {
    await createGRNWithClosedLines(Array.from(selectedLinesToClose));
    setShowCloseLineDialog(false);
    setLinesToClose([]);
    setSelectedLinesToClose(new Set());
  };

  const handleCloseCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setSelectedPO(null);
    setFormData({
      purchase_order_id: '',
      received_date: new Date().toISOString().split('T')[0],
      notes: '',
      lines: []
    });
    setReceivingLines({});
    setShowCloseLineDialog(false);
    setLinesToClose([]);
    setSelectedLinesToClose(new Set());
  };

  const handleViewGRN = (grn: GoodsReceived) => {
    setSelectedGRN(grn);
    setIsViewDialogOpen(true);
  };

  const handlePostGRN = async (id: string) => {
    try {
      await goodsReceivedService.postGoodsReceived(id);
      setGoodsReceived(prev => prev.map(grn => 
        grn.id === id ? { ...grn, status: 'posted' } : grn
      ));
      
      toast({
        title: 'Success',
        description: 'Goods received posted to inventory successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to post goods received',
        variant: 'destructive'
      });
    }
  };

  const getStatusColor = (status: GoodsReceived['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'verified': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'posted': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredGRNs = goodsReceived.filter(grn =>
    grn.grn_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    grn.purchase_order?.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    grn.purchase_order?.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <ModernLayout
      title="Goods Received"
      description="Receive and track incoming raw materials"
      icon={Truck}
      gradient="bg-gradient-to-r from-green-500 to-emerald-600"
    >
      <div className="space-y-6">
        {/* Action Button */}
        <div className="flex justify-end">
          <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg">
            <Plus className="h-4 w-4 mr-2" />
            Receive Goods
          </Button>
        </div>

      {/* Modern Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-green-50/80 to-green-100/80 border-green-200/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-semibold tracking-wide">Total GRNs</p>
                <p className="text-3xl font-bold text-green-800 mt-2">{goodsReceived.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-green-100/50 shadow-inner">
                <Package className="h-8 w-8 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50/80 to-yellow-100/80 border-yellow-200/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-600 font-semibold tracking-wide">Pending</p>
                <p className="text-3xl font-bold text-yellow-800 mt-2">
                  {goodsReceived.filter(grn => grn.status === 'pending').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-yellow-100/50 shadow-inner">
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50/80 to-blue-100/80 border-blue-200/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold tracking-wide">Verified</p>
                <p className="text-3xl font-bold text-blue-800 mt-2">
                  {goodsReceived.filter(grn => grn.status === 'verified').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-100/50 shadow-inner">
                <CheckCircle className="h-8 w-8 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50/80 to-purple-100/80 border-purple-200/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-semibold tracking-wide">Posted</p>
                <p className="text-3xl font-bold text-purple-800 mt-2">
                  {goodsReceived.filter(grn => grn.status === 'posted').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-purple-100/50 shadow-inner">
                <Truck className="h-8 w-8 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Goods Received List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Goods Received Notes</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search GRNs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>GRN Number</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Received Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGRNs.map((grn) => (
                <TableRow key={grn.id}>
                  <TableCell className="font-medium">{grn.grn_number}</TableCell>
                  <TableCell>{grn.purchase_order?.po_number}</TableCell>
                  <TableCell>{grn.purchase_order?.supplier?.name}</TableCell>
                  <TableCell>{new Date(grn.received_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(grn.status)}>
                      {grn.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleViewGRN(grn)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      {grn.status === 'verified' && (
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handlePostGRN(grn.id)}
                          className="text-green-600 hover:text-green-800"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Goods Received Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-green-600" />
              <span>Receive Goods</span>
            </DialogTitle>
            <DialogDescription>
              Create a goods received note for delivered materials
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Header Information */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="purchase_order">Purchase Order *</Label>
                <Select 
                  value={formData.purchase_order_id} 
                  onValueChange={handleSelectPO}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select purchase order" />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingPOs.map(po => (
                      <SelectItem key={po.id} value={po.id}>
                        {po.po_number} - {po.supplier?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="received_date">Received Date *</Label>
                <Input
                  type="date"
                  value={formData.received_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, received_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes for this goods received note..."
                rows={2}
              />
            </div>

            {/* Purchase Order Lines */}
            {selectedPO && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Purchase Order Lines - {selectedPO.po_number}
                  </CardTitle>
                  <CardDescription>
                    Specify quantities received for each line item
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Ordered</TableHead>
                        <TableHead>Previously Received</TableHead>
                        <TableHead>Pending</TableHead>
                        <TableHead>Receiving Now</TableHead>
                        <TableHead>Batch/Lot</TableHead>
                        <TableHead>Expiry Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPO.lines?.map((line) => {
                        const pendingQty = line.quantity - line.received_quantity;
                        const receivingLine = receivingLines[line.id];
                        
                        if (pendingQty <= 0) return null;

                        return (
                          <TableRow key={line.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{line.raw_material?.name}</div>
                                <div className="text-sm text-gray-500">{line.raw_material?.code}</div>
                              </div>
                            </TableCell>
                            <TableCell>{line.quantity} {line.raw_material?.purchase_unit}</TableCell>
                            <TableCell>{line.received_quantity}</TableCell>
                            <TableCell className="font-medium text-orange-600">{pendingQty}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max={pendingQty}
                                value={receivingLine?.quantity_received || 0}
                                onChange={(e) => handleUpdateReceivingLine(
                                  line.id, 
                                  'quantity_received', 
                                  parseFloat(e.target.value) || 0
                                )}
                                className="w-24"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="text"
                                value={receivingLine?.batch_number || ''}
                                onChange={(e) => handleUpdateReceivingLine(
                                  line.id, 
                                  'batch_number', 
                                  e.target.value
                                )}
                                placeholder="Batch/Lot"
                                className="w-28"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="date"
                                value={receivingLine?.expiry_date || ''}
                                onChange={(e) => handleUpdateReceivingLine(
                                  line.id, 
                                  'expiry_date', 
                                  e.target.value
                                )}
                                className="w-36"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseCreateDialog}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateGRN} 
              disabled={loading || !formData.purchase_order_id}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
            >
              {loading ? 'Creating...' : 'Create GRN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Goods Received Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-green-600" />
              <span>Goods Received Note {selectedGRN?.grn_number}</span>
            </DialogTitle>
          </DialogHeader>

          {selectedGRN && (
            <div className="space-y-6">
              {/* GRN Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Purchase Order</Label>
                  <p className="font-medium">{selectedGRN.purchase_order?.po_number}</p>
                </div>
                <div>
                  <Label>Supplier</Label>
                  <p className="font-medium">{selectedGRN.purchase_order?.supplier?.name}</p>
                </div>
                <div>
                  <Label>Received Date</Label>
                  <p>{new Date(selectedGRN.received_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge className={getStatusColor(selectedGRN.status)}>
                    {selectedGRN.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* Notes */}
              {selectedGRN.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-gray-700">{selectedGRN.notes}</p>
                </div>
              )}

              {/* Received Items */}
              <div>
                <Label>Received Items</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Quantity Received</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Batch/Lot</TableHead>
                      <TableHead>Expiry Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedGRN.lines?.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{line.raw_material?.name}</div>
                            <div className="text-sm text-gray-500">{line.raw_material?.code}</div>
                          </div>
                        </TableCell>
                        <TableCell>{line.quantity_received} {line.raw_material?.purchase_unit}</TableCell>
                        <TableCell>LKR {line.unit_price.toFixed(2)}</TableCell>
                        <TableCell>{line.batch_number || 'N/A'}</TableCell>
                        <TableCell>
                          {line.expiry_date 
                            ? new Date(line.expiry_date).toLocaleDateString() 
                            : 'N/A'
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
            {selectedGRN?.status === 'verified' && (
              <Button 
                onClick={() => {
                  handlePostGRN(selectedGRN.id);
                  setIsViewDialogOpen(false);
                }}
                className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
              >
                Post to Inventory
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Lines Confirmation Dialog */}
      <Dialog open={showCloseLineDialog} onOpenChange={setShowCloseLineDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <span>Close Purchase Order Lines?</span>
            </DialogTitle>
            <DialogDescription>
              The following lines have reached or exceeded 75% of their ordered quantity. 
              Would you like to close these lines to prevent further receiving?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {linesToClose.map((line) => (
              <div key={line.lineId} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={selectedLinesToClose.has(line.lineId)}
                    onChange={() => handleToggleLineClose(line.lineId)}
                    className="rounded"
                  />
                  <div>
                    <p className="font-medium">{line.materialName}</p>
                    <p className="text-sm text-gray-600">
                      {line.percentage}% received
                    </p>
                  </div>
                </div>
                <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                  {line.percentage}%
                </Badge>
              </div>
            ))}
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Closing a line will mark the remaining quantity as received and prevent further deliveries for that material on this PO.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCloseLineDialog(false);
                setLinesToClose([]);
                setSelectedLinesToClose(new Set());
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmLineClosures}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            >
              Create GRN & Close Selected Lines
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ModernLayout>
  );
};
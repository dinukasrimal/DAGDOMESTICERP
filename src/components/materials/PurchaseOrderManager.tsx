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
  Pencil, 
  Trash2, 
  FileText, 
  Calendar, 
  Package, 
  Building2, 
  AlertTriangle,
  Check,
  X,
  Search,
  DollarSign,
  ShoppingCart
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  PurchaseOrderService, 
  PurchaseOrder, 
  CreatePurchaseOrder, 
  CreatePurchaseOrderLine 
} from '../../services/purchaseOrderService';
import { RawMaterialsService, RawMaterialWithInventory } from '../../services/rawMaterialsService';
import { ModernLayout } from '../layout/ModernLayout';

const purchaseOrderService = new PurchaseOrderService();
const rawMaterialsService = new RawMaterialsService();

interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
}

export const PurchaseOrderManager: React.FC = () => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialWithInventory[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  // Form states
  const [formData, setFormData] = useState<CreatePurchaseOrder>({
    supplier_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    notes: '',
    lines: []
  });

  const [currentLine, setCurrentLine] = useState<CreatePurchaseOrderLine>({
    raw_material_id: '',
    quantity: 0,
    unit_price: 0
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [poData, suppliersData, materialsData] = await Promise.all([
        purchaseOrderService.getAllPurchaseOrders(),
        loadSuppliers(),
        rawMaterialsService.getRawMaterials()
      ]);
      setPurchaseOrders(poData);
      setSuppliers(suppliersData);
      setRawMaterials(materialsData);
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

  const loadSuppliers = async (): Promise<Supplier[]> => {
    // This would typically come from a suppliers service
    // For now, we'll use a mock or get from the existing suppliers table
    return [
      { id: '1', name: 'Supplier A', contact_person: 'John Doe', email: 'john@suppliera.com' },
      { id: '2', name: 'Supplier B', contact_person: 'Jane Smith', email: 'jane@supplierb.com' },
    ];
  };

  const handleCreatePO = async () => {
    try {
      if (!formData.supplier_id || formData.lines.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please select a supplier and add at least one line item',
          variant: 'destructive'
        });
        return;
      }

      setLoading(true);
      const newPO = await purchaseOrderService.createPurchaseOrder(formData);
      setPurchaseOrders(prev => [newPO, ...prev]);
      
      toast({
        title: 'Success',
        description: `Purchase Order ${newPO.po_number} created successfully`
      });

      handleCloseCreateDialog();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create purchase order',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddLine = () => {
    if (!currentLine.raw_material_id || currentLine.quantity <= 0 || currentLine.unit_price < 0) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all line fields with valid values',
        variant: 'destructive'
      });
      return;
    }

    const material = rawMaterials.find(m => m.id.toString() === currentLine.raw_material_id);
    if (!material) return;

    setFormData(prev => ({
      ...prev,
      lines: [...prev.lines, { ...currentLine }]
    }));

    setCurrentLine({
      raw_material_id: '',
      quantity: 0,
      unit_price: 0
    });
  };

  const handleRemoveLine = (index: number) => {
    setFormData(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index)
    }));
  };

  const handleCloseCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setFormData({
      supplier_id: '',
      order_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: '',
      notes: '',
      lines: []
    });
    setCurrentLine({
      raw_material_id: '',
      quantity: 0,
      unit_price: 0
    });
  };

  const handleViewPO = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setIsViewDialogOpen(true);
  };

  const handleUpdatePOStatus = async (id: string, status: PurchaseOrder['status']) => {
    try {
      await purchaseOrderService.updatePurchaseOrderStatus(id, status);
      setPurchaseOrders(prev => prev.map(po => 
        po.id === id ? { ...po, status } : po
      ));
      
      toast({
        title: 'Success',
        description: 'Purchase order status updated successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update status',
        variant: 'destructive'
      });
    }
  };

  const handleDeletePO = async (id: string, poNumber: string) => {
    if (!confirm(`Are you sure you want to delete Purchase Order ${poNumber}?`)) {
      return;
    }

    try {
      await purchaseOrderService.deletePurchaseOrder(id);
      setPurchaseOrders(prev => prev.filter(po => po.id !== id));
      
      toast({
        title: 'Success',
        description: 'Purchase order deleted successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete purchase order',
        variant: 'destructive'
      });
    }
  };

  const getStatusColor = (status: PurchaseOrder['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'approved': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'sent': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'partial_received': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'received': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredPOs = purchaseOrders.filter(po =>
    po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAmount = formData.lines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);

  return (
    <ModernLayout
      title="Purchase Orders"
      description="Manage purchase orders for raw materials"
      icon={ShoppingCart}
      gradient="bg-gradient-to-r from-blue-500 to-purple-600"
    >
      <div className="space-y-6">
        {/* Action Button */}
        <div className="flex justify-end">
          <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 shadow-lg">
            <Plus className="h-4 w-4 mr-2" />
            Create Purchase Order
          </Button>
        </div>

      {/* Modern Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-br from-blue-50/80 to-blue-100/80 border-blue-200/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-semibold tracking-wide">Total POs</p>
                <p className="text-3xl font-bold text-blue-800 mt-2">{purchaseOrders.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-100/50 shadow-inner">
                <FileText className="h-8 w-8 text-blue-600" />
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
                  {purchaseOrders.filter(po => po.status === 'pending').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-yellow-100/50 shadow-inner">
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50/80 to-purple-100/80 border-purple-200/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-semibold tracking-wide">Sent</p>
                <p className="text-3xl font-bold text-purple-800 mt-2">
                  {purchaseOrders.filter(po => po.status === 'sent').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-purple-100/50 shadow-inner">
                <Package className="h-8 w-8 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50/80 to-green-100/80 border-green-200/50 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-semibold tracking-wide">Received</p>
                <p className="text-3xl font-bold text-green-800 mt-2">
                  {purchaseOrders.filter(po => po.status === 'received').length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-green-100/50 shadow-inner">
                <Check className="h-8 w-8 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modern Data Table */}
      <Card className="backdrop-blur-sm bg-white/90 border-0 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 rounded-t-xl border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold text-slate-800">Purchase Orders</CardTitle>
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search purchase orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20 rounded-xl"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b-0 bg-slate-50/50">
                  <TableHead className="font-semibold text-slate-700 py-4">PO Number</TableHead>
                  <TableHead className="font-semibold text-slate-700">Supplier</TableHead>
                  <TableHead className="font-semibold text-slate-700">Order Date</TableHead>
                  <TableHead className="font-semibold text-slate-700">Expected Delivery</TableHead>
                  <TableHead className="font-semibold text-slate-700">Total Amount</TableHead>
                  <TableHead className="font-semibold text-slate-700">Status</TableHead>
                  <TableHead className="font-semibold text-slate-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPOs.map((po, index) => (
                  <TableRow 
                    key={po.id} 
                    className={`border-b border-slate-100/50 hover:bg-slate-50/30 transition-colors duration-200 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'
                    }`}
                  >
                    <TableCell className="font-medium text-slate-800 py-4">{po.po_number}</TableCell>
                    <TableCell className="text-slate-700">{po.supplier?.name || 'N/A'}</TableCell>
                    <TableCell className="text-slate-600">{new Date(po.order_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-slate-600">
                      {po.expected_delivery_date 
                        ? new Date(po.expected_delivery_date).toLocaleDateString() 
                        : 'N/A'
                      }
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                        LKR {po.total_amount?.toFixed(2) || '0.00'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getStatusColor(po.status)} shadow-sm`}>
                        {po.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleViewPO(po)}
                          className="h-8 w-8 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        {po.status === 'pending' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleUpdatePOStatus(po.id, 'approved')}
                              className="h-8 w-8 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => handleDeletePO(po.id, po.po_number)}
                              className="h-8 w-8 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Purchase Order Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
              <span>Create Purchase Order</span>
            </DialogTitle>
            <DialogDescription>
              Create a new purchase order for raw materials
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Header Information */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="supplier">Supplier *</Label>
                <Select 
                  value={formData.supplier_id} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, supplier_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="order_date">Order Date *</Label>
                <Input
                  type="date"
                  value={formData.order_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, order_date: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="expected_delivery">Expected Delivery Date</Label>
                <Input
                  type="date"
                  value={formData.expected_delivery_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Total Amount</Label>
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="font-semibold text-green-700">LKR {totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes for this purchase order..."
                rows={2}
              />
            </div>

            {/* Add Line Item */}
            <Card className="bg-blue-50/30 border-blue-200">
              <CardHeader>
                <CardTitle className="text-sm">Add Line Item</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label>Raw Material *</Label>
                    <Select
                      value={currentLine.raw_material_id}
                      onValueChange={(value) => setCurrentLine(prev => ({ ...prev, raw_material_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {rawMaterials.map(material => (
                          <SelectItem key={material.id} value={material.id.toString()}>
                            {material.name} ({material.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={currentLine.quantity}
                      onChange={(e) => setCurrentLine(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>Unit Price (LKR) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={currentLine.unit_price}
                      onChange={(e) => setCurrentLine(prev => ({ ...prev, unit_price: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddLine} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line Items List */}
            {formData.lines.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Line Items ({formData.lines.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formData.lines.map((line, index) => {
                        const material = rawMaterials.find(m => m.id.toString() === line.raw_material_id);
                        return (
                          <TableRow key={index}>
                            <TableCell>{material?.name}</TableCell>
                            <TableCell>{line.quantity}</TableCell>
                            <TableCell>LKR {line.unit_price.toFixed(2)}</TableCell>
                            <TableCell className="font-semibold">
                              LKR {(line.quantity * line.unit_price).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveLine(index)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <X className="h-4 w-4" />
                              </Button>
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
              onClick={handleCreatePO} 
              disabled={loading || !formData.supplier_id || formData.lines.length === 0}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
            >
              {loading ? 'Creating...' : 'Create Purchase Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Purchase Order Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <span>Purchase Order {selectedPO?.po_number}</span>
            </DialogTitle>
          </DialogHeader>

          {selectedPO && (
            <div className="space-y-6">
              {/* PO Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier</Label>
                  <p className="font-medium">{selectedPO.supplier?.name}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge className={getStatusColor(selectedPO.status)}>
                    {selectedPO.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <Label>Order Date</Label>
                  <p>{new Date(selectedPO.order_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label>Expected Delivery</Label>
                  <p>
                    {selectedPO.expected_delivery_date
                      ? new Date(selectedPO.expected_delivery_date).toLocaleDateString()
                      : 'N/A'
                    }
                  </p>
                </div>
                <div>
                  <Label>Total Amount</Label>
                  <p className="font-semibold text-green-700">
                    LKR {selectedPO.total_amount?.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>

              {/* Notes */}
              {selectedPO.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-gray-700">{selectedPO.notes}</p>
                </div>
              )}

              {/* Line Items */}
              <div>
                <Label>Line Items</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO.lines?.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{line.raw_material?.name}</div>
                            <div className="text-sm text-gray-500">{line.raw_material?.code}</div>
                          </div>
                        </TableCell>
                        <TableCell>{line.quantity} {line.raw_material?.purchase_unit}</TableCell>
                        <TableCell>LKR {line.unit_price.toFixed(2)}</TableCell>
                        <TableCell className="font-semibold">LKR {line.total_price.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span>{line.received_quantity}</span>
                            {line.received_quantity < line.quantity && (
                              <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                                Pending: {(line.quantity - line.received_quantity).toFixed(2)}
                              </Badge>
                            )}
                          </div>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ModernLayout>
  );
};
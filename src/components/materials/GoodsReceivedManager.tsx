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
  CreateGoodsReceivedLine,
  FabricRoll
} from '../../services/goodsReceivedService';
import { PurchaseOrderService, PurchaseOrder } from '../../services/purchaseOrderService';
import { ModernLayout } from '../layout/ModernLayout';
import { BarcodeScanner } from '../ui/BarcodeScanner';

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
  
  // Fabric scanning states
  const [fabricRolls, setFabricRolls] = useState<{[key: string]: FabricRoll[]}>({});
  const [showFabricScanner, setShowFabricScanner] = useState(false);
  const [currentScanningLine, setCurrentScanningLine] = useState<string | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [rollWeight, setRollWeight] = useState<number>(0);
  const [rollLength, setRollLength] = useState<number>(0);
  const [showBarcodeCamera, setShowBarcodeCamera] = useState(false);
  const [showWeightEntry, setShowWeightEntry] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);

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

  const isFabricMaterial = (poLine: any): boolean => {
    // Check if material belongs to fabric category (ID: 1)
    const material = poLine?.raw_material;
    if (material?.category_id === 1) {
      return true;
    }
    // Fallback to name check if category_id not available
    return material?.name?.toLowerCase().includes('fabric') || false;
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

  const handleFabricScanClick = (lineId: string) => {
    console.log('Starting fabric scan for line:', lineId);
    setCurrentScanningLine(lineId);
    setShowFabricScanner(true);
    setShowBarcodeCamera(true);
    setScannedBarcode('');
    setRollWeight(0);
    setRollLength(0);
    setShowWeightEntry(false);
    setIsManualEntry(false);
  };

  const handleBarcodeScanned = (barcode: string) => {
    console.log('Barcode scanned:', barcode);
    setScannedBarcode(barcode);
    // Don't close the scanner immediately, just show weight entry overlay
    setShowWeightEntry(true);
    setIsManualEntry(false);
  };

  const handleWeightConfirmed = () => {
    if (!scannedBarcode || rollWeight <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Please provide valid barcode and weight',
        variant: 'destructive'
      });
      return false;
    }
    
    // Store values before resetting state
    const currentBarcode = scannedBarcode;
    const currentWeight = rollWeight;
    
    const result = handleAddFabricRoll();
    
    if (result) {
      // Reset for next scan but keep scanner open
      setShowWeightEntry(false);
      setScannedBarcode('');
      setRollWeight(0);
      setRollLength(0);
      setIsManualEntry(false);
      
      // Show success message with stored values
      toast({
        title: 'Roll Added Successfully',
        description: `Barcode: ${currentBarcode} | Weight: ${currentWeight}kg`,
        variant: 'default'
      });
    }
  };

  const handleAddFabricRoll = () => {
    if (!currentScanningLine || !scannedBarcode || rollWeight <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Please provide barcode and weight for the roll',
        variant: 'destructive'
      });
      return false;
    }

    // Check if barcode already exists for this line
    const existingRolls = fabricRolls[currentScanningLine] || [];
    if (existingRolls.some(roll => roll.barcode === scannedBarcode)) {
      toast({
        title: 'Duplicate Barcode',
        description: 'This barcode has already been scanned for this material',
        variant: 'destructive'
      });
      return false;
    }

    const newRoll: FabricRoll = {
      barcode: scannedBarcode,
      weight: rollWeight,
      length: rollLength > 0 ? rollLength : undefined,
    };

    setFabricRolls(prev => ({
      ...prev,
      [currentScanningLine]: [...(prev[currentScanningLine] || []), newRoll]
    }));

    // Update total weight in receiving line
    const totalWeight = [...existingRolls, newRoll].reduce((sum, roll) => sum + roll.weight, 0);
    handleUpdateReceivingLine(currentScanningLine, 'quantity_received', totalWeight);

    return true;
  };

  const handleCompleteReceiving = async () => {
    if (!currentScanningLine || !selectedPO) return;

    try {
      // Update the receiving line with the total scanned weight
      const scannedRolls = fabricRolls[currentScanningLine] || [];
      const totalWeight = scannedRolls.reduce((sum, roll) => sum + roll.weight, 0);
      
      if (totalWeight > 0) {
        handleUpdateReceivingLine(currentScanningLine, 'quantity_received', totalWeight);
        
        toast({
          title: 'Receiving Completed',
          description: `${scannedRolls.length} rolls (${totalWeight}kg) marked as received. You can continue with other materials.`,
          variant: 'default'
        });
      }

      // Close the scanner but keep the receive goods dialog open
      setShowBarcodeCamera(false);
      setIsManualEntry(false);
      setShowWeightEntry(false);
      setScannedBarcode('');
      setRollWeight(0);
      setRollLength(0);
      
      // Clear the fabric rolls for this line since they've been processed
      if (currentScanningLine) {
        setFabricRolls(prev => ({
          ...prev,
          [currentScanningLine]: []
        }));
      }
      
      setCurrentScanningLine(null);
      setShowFabricScanner(false);
      // Keep showGoodsReceived dialog open so user can continue with other materials

    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to complete receiving',
        variant: 'destructive'
      });
    }
  };

  const handleRemoveFabricRoll = (lineId: string, barcode: string) => {
    setFabricRolls(prev => {
      const updatedRolls = (prev[lineId] || []).filter(roll => roll.barcode !== barcode);
      const totalWeight = updatedRolls.reduce((sum, roll) => sum + roll.weight, 0);
      
      // Update total weight in receiving line
      handleUpdateReceivingLine(lineId, 'quantity_received', totalWeight);
      
      return {
        ...prev,
        [lineId]: updatedRolls
      };
    });
  };

  const handleCreateGRN = async () => {
    try {
      if (!formData.purchase_order_id || !selectedPO) {
        toast({
          title: 'Validation Error',
          description: 'Please select a purchase order',
          variant: 'destructive'
        });
        return false;
      }

      // Filter lines that have quantity > 0
      const validLines = Object.values(receivingLines).filter(line => line.quantity_received > 0);
      
      if (validLines.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please specify quantities to receive for at least one line',
          variant: 'destructive'
        });
        return false;
      }

      // Validate fabric materials have scanned rolls
      const fabricLinesWithoutScans: string[] = [];
      
      Object.entries(receivingLines).forEach(([lineId, receivingLine]) => {
        const poLine = selectedPO.lines?.find(line => line.id === lineId);
        if (poLine && isFabricMaterial(poLine)) {
          const rolls = fabricRolls[lineId] || [];
          if (rolls.length === 0) {
            fabricLinesWithoutScans.push(poLine.raw_material?.name || 'Unknown Fabric');
          }
        }
      });

      if (fabricLinesWithoutScans.length > 0) {
        toast({
          title: 'Fabric Scanning Required',
          description: `Please scan barcodes for: ${fabricLinesWithoutScans.join(', ')}`,
          variant: 'destructive'
        });
        return false;
      }

      // Check for lines that will exceed 75% completion or auto-close due to over-receiving
      const linesToCloseCheck: {lineId: string, materialName: string, percentage: number}[] = [];
      const autoCloseLines: string[] = [];
      
      validLines.forEach(receivingLine => {
        const poLine = selectedPO.lines?.find(line => line.id === receivingLine.purchase_order_line_id);
        if (poLine) {
          const totalReceived = poLine.received_quantity + receivingLine.quantity_received;
          const percentage = (totalReceived / poLine.quantity) * 100;
          
          if (totalReceived > poLine.quantity) {
            // Auto-close lines that receive more than ordered
            autoCloseLines.push(poLine.id);
          } else if (percentage >= 75) {
            // Ask for confirmation on lines reaching 75%
            const material = poLine.raw_material;
            linesToCloseCheck.push({
              lineId: poLine.id,
              materialName: material?.name || 'Unknown Material',
              percentage: Math.round(percentage)
            });
          }
        }
      });

      // If there are over-received lines, auto-close them and proceed
      if (autoCloseLines.length > 0) {
        const overReceivedMaterials = autoCloseLines.map(lineId => {
          const poLine = selectedPO.lines?.find(line => line.id === lineId);
          return poLine?.raw_material?.name || 'Unknown Material';
        });
        
        toast({
          title: 'Over-Receiving Detected',
          description: `Auto-closing lines for: ${overReceivedMaterials.join(', ')} (received more than ordered)`,
        });
        
        await createGRNWithClosedLines(autoCloseLines);
        return false;
      }

      // If lines exceed 75%, show confirmation dialog
      if (linesToCloseCheck.length > 0) {
        setLinesToClose(linesToCloseCheck);
        setSelectedLinesToClose(new Set(linesToCloseCheck.map(l => l.lineId)));
        setShowCloseLineDialog(true);
        return false;
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
      
      // Process fabric and non-fabric lines differently
      const allLines: CreateGoodsReceivedLine[] = [];
      
      Object.entries(receivingLines).forEach(([lineId, receivingLine]) => {
        if (receivingLine.quantity_received <= 0) return;
        
        const poLine = selectedPO?.lines?.find(line => line.raw_material_id === receivingLine.raw_material_id);
        const isFabric = poLine ? isFabricMaterial(poLine) : false;
        
        if (isFabric) {
          // For fabric materials, create separate entries for each roll
          const rolls = fabricRolls[lineId] || [];
          rolls.forEach(roll => {
            allLines.push({
              ...receivingLine,
              quantity_received: roll.weight,
              roll_barcode: roll.barcode,
              roll_weight: roll.weight,
              roll_length: roll.length,
              batch_number: roll.batch_number,
            });
          });
        } else {
          // For non-fabric materials, single entry
          allLines.push(receivingLine);
        }
      });
      
      if (allLines.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'No valid items to receive',
          variant: 'destructive'
        });
        return false;
      }
      
      const grnData: CreateGoodsReceived = {
        ...formData,
        lines: allLines
      };

      const newGRN = await goodsReceivedService.createGoodsReceived(grnData);
      
      // Close selected lines by setting received quantity to ordered quantity
      for (const lineId of linesToClose) {
        const poLine = selectedPO?.lines?.find(line => line.id === lineId);
        if (poLine) {
          const currentReceived = poLine.received_quantity;
          const orderedQty = poLine.quantity;
          
          // Calculate how much we've already received in this GRN for this line
          const receivedInThisGRN = allLines
            .filter(line => line.purchase_order_line_id === lineId)
            .reduce((sum, line) => sum + line.quantity_received, 0);
          
          // Set total received to ordered quantity (effectively closing the line)
          const targetReceived = orderedQty;
          const additionalToRecord = targetReceived - currentReceived - receivedInThisGRN;
          
          if (additionalToRecord > 0) {
            await purchaseOrderService.updatePurchaseOrderLineReceived(lineId, additionalToRecord);
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
    <div>
      {/* Main Content */}
      <div style={{ 
        pointerEvents: showBarcodeCamera ? 'none' : 'auto',
        opacity: showBarcodeCamera ? 0.3 : 1,
        transition: 'opacity 0.2s'
      }}>
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
      </div>
    </ModernLayout>
    </div>

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
                        const isFabric = isFabricMaterial(line);
                        const fabricRollsForLine = fabricRolls[line.id] || [];
                        const totalScannedWeight = fabricRollsForLine.reduce((sum, roll) => sum + roll.weight, 0);
                        
                        if (pendingQty <= 0) return null;

                        return (
                          <TableRow key={line.id} className={isFabric ? 'bg-purple-50' : ''}>
                            <TableCell>
                              <div>
                                <div className="font-medium flex items-center space-x-2">
                                  <span>{line.raw_material?.name}</span>
                                  {isFabric && (
                                    <Badge className="bg-purple-100 text-purple-800 text-xs">
                                      FABRIC
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500">{line.raw_material?.code}</div>
                              </div>
                            </TableCell>
                            <TableCell>{line.quantity} {line.raw_material?.purchase_unit}</TableCell>
                            <TableCell>{line.received_quantity}</TableCell>
                            <TableCell className="font-medium text-orange-600">{pendingQty}</TableCell>
                            <TableCell>
                              {isFabric ? (
                                <div className="flex items-center space-x-3">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleFabricScanClick(line.id)}
                                    className="bg-purple-500 hover:bg-purple-600 text-white"
                                  >
                                    Scan Rolls
                                  </Button>
                                  <div className="text-right">
                                    <div className="font-semibold text-green-700">
                                      {totalScannedWeight.toFixed(2)} kg
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      {fabricRollsForLine.length} rolls
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={receivingLine?.quantity_received || 0}
                                  onChange={(e) => handleUpdateReceivingLine(
                                    line.id, 
                                    'quantity_received', 
                                    parseFloat(e.target.value) || 0
                                  )}
                                  className="w-24"
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              {isFabric ? (
                                <span className="text-sm text-gray-400 italic">
                                  Set via barcode scan
                                </span>
                              ) : (
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
                              )}
                            </TableCell>
                            <TableCell>
                              {isFabric ? (
                                <span className="text-sm text-gray-400 italic">
                                  N/A for fabrics
                                </span>
                              ) : (
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
                              )}
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

      {/* Fabric Scanner Dialog */}
      <Dialog open={showFabricScanner} onOpenChange={setShowFabricScanner}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Scan Fabric Rolls</DialogTitle>
            <DialogDescription>
              Scan each fabric roll barcode and enter its weight
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current Material */}
            {currentScanningLine && selectedPO && (
              <div className="bg-gray-50 p-3 rounded">
                <h4 className="font-medium">
                  {selectedPO.lines?.find(l => l.id === currentScanningLine)?.raw_material?.name}
                </h4>
              </div>
            )}


            {/* Scan Button */}
            {!showWeightEntry && (
              <Button 
                onClick={() => {
                  setShowBarcodeCamera(true);
                  setIsManualEntry(false);
                }}
                className="w-full"
              >
                Scan Another Roll
              </Button>
            )}

            {/* Rolls List */}
            {currentScanningLine && fabricRolls[currentScanningLine]?.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium mb-2">Scanned Rolls</h4>
                {fabricRolls[currentScanningLine].map((roll, index) => (
                  <div key={roll.barcode} className="flex justify-between items-center p-2 border rounded mb-2">
                    <span className="font-mono">{roll.barcode}</span>
                    <span>{roll.weight} kg</span>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => handleRemoveFabricRoll(currentScanningLine!, roll.barcode)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFabricScanner(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-Screen Barcode Scanner with Weight Entry Overlay */}
      <BarcodeScanner
        isOpen={showBarcodeCamera}
        onScan={handleBarcodeScanned}
        scannedRolls={currentScanningLine ? fabricRolls[currentScanningLine] || [] : []}
        currentScanningLine={
          currentScanningLine 
            ? selectedPO?.lines?.find(line => line.id === currentScanningLine)?.raw_material?.name || 'Material'
            : 'Material'
        }
        onRemoveRoll={(barcode) => {
          if (currentScanningLine) {
            handleRemoveFabricRoll(currentScanningLine, barcode);
          }
        }}
        onDone={() => {
          // Complete receiving and close scanner
          handleCompleteReceiving();
        }}
        onClose={() => {
          setShowBarcodeCamera(false);
          setIsManualEntry(false);
          setShowWeightEntry(false);
          setScannedBarcode('');
          setRollWeight(0);
          setRollLength(0);
          setCurrentScanningLine(null);
          setShowFabricScanner(false);
        }}
      >
        {/* Weight Entry Overlay */}
        {showWeightEntry && scannedBarcode && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black/50" 
            style={{ 
              zIndex: 2147483646,
              pointerEvents: 'none' // Allow clicks to pass through background
            }}
            onClick={(e) => {
              // Don't close overlay when clicking background
            }}
          >
            <Card 
              className="w-full max-w-md mx-4 bg-white" 
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'relative', zIndex: 2147483647, pointerEvents: 'auto' }}
            >
              <CardHeader>
                <CardTitle className="text-lg">Enter Roll Details</CardTitle>
                <CardDescription>
                  Barcode: <strong>{scannedBarcode}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="weight">Weight (kg) *</Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.01"
                      value={rollWeight || ''}
                      onChange={(e) => setRollWeight(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label htmlFor="length">Length (m)</Label>
                    <Input
                      id="length"
                      type="number"
                      step="0.01"
                      value={rollLength || ''}
                      onChange={(e) => setRollLength(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <Button 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleWeightConfirmed();
                    }} 
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    style={{ 
                      position: 'relative', 
                      zIndex: 2147483647, 
                      pointerEvents: 'auto',
                      cursor: 'pointer'
                    }}
                    disabled={!rollWeight || rollWeight <= 0}
                    type="button"
                  >
                    Add Roll
                  </Button>
                  <Button 
                    onClick={() => {
                      setShowWeightEntry(false);
                      setScannedBarcode('');
                      setRollWeight(0);
                      setRollLength(0);
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </BarcodeScanner>
    </div>
  );
};
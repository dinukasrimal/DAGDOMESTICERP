import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
  Truck,
  Receipt,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  GoodsReceivedService,
  GoodsReceived,
  CreateGoodsReceived,
  CreateGoodsReceivedLine,
  FabricRoll,
} from '../../services/goodsReceivedService';
import { PurchaseOrderService, PurchaseOrder } from '../../services/purchaseOrderService';
import { ModernLayout } from '../layout/ModernLayout';
import { BarcodeScanner } from '../ui/BarcodeScanner';
import type { BarcodeScannerHandle } from '../ui/BarcodeScanner';
import { accountingService, type ChartOfAccount } from '@/services/accountingService';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

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
  const { user } = useAuth();

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
  const showFabricScannerRef = useRef(showFabricScanner);
  const [currentScanningLine, setCurrentScanningLine] = useState<string | null>(null);
  const currentScanningLineRef = useRef<string | null>(currentScanningLine);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [rollWeightInput, setRollWeightInput] = useState('');
  const [rollLengthInput, setRollLengthInput] = useState('');
  const decimalInputPattern = /^\d*(?:\.\d*)?$/;
  const parsedRollWeight = parseFloat(rollWeightInput);
  const canAddRoll = !Number.isNaN(parsedRollWeight) && parsedRollWeight > 0;
  const [showBarcodeCamera, setShowBarcodeCamera] = useState(false);
  const [showWeightEntry, setShowWeightEntry] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const weightFocusTimeoutRef = useRef<number | null>(null);
  const barcodeScannerRef = useRef<BarcodeScannerHandle | null>(null);
  const requestWeightInputFocus = useCallback((delay = 10) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (weightFocusTimeoutRef.current !== null) {
      window.clearTimeout(weightFocusTimeoutRef.current);
      weightFocusTimeoutRef.current = null;
    }

    weightFocusTimeoutRef.current = window.setTimeout(() => {
      if (weightInputRef.current) {
        weightInputRef.current.focus({ preventScroll: true });
        weightInputRef.current.select();
      }
      weightFocusTimeoutRef.current = null;
    }, delay);
  }, []);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [convertGRN, setConvertGRN] = useState<GoodsReceived | null>(null);
  const [convertDefaultAccountId, setConvertDefaultAccountId] = useState('');
  const [convertPayableAccountId, setConvertPayableAccountId] = useState('');
  const [convertDueDate, setConvertDueDate] = useState('');
  const [convertPerLineAccounts, setConvertPerLineAccounts] = useState<Record<string, string>>({});
  const [convertLoading, setConvertLoading] = useState(false);

  const restartBarcodeScanner = useCallback(() => {
    if (!showFabricScannerRef.current) return;
    setShowWeightEntry(false);
    setScannedBarcode('');
    setRollWeightInput('');
    setRollLengthInput('');
    setIsManualEntry(false);
    // Smoothly resume the camera without unmounting the overlay
    try { barcodeScannerRef.current?.resume(); } catch {}
  }, []);

  const accountOptions = useMemo(() => accounts.map((account) => ({
    value: account.id,
    label: `${account.code} · ${account.name}`,
    description: account.accountType,
  })), [accounts]);

  const payableOptions = useMemo(() => accountOptions.filter((option) => {
    const account = accounts.find((acc) => acc.id === option.value);
    return account?.isPayable;
  }), [accountOptions, accounts]);

  useEffect(() => {
    showFabricScannerRef.current = showFabricScanner;
  }, [showFabricScanner]);

  useEffect(() => {
    currentScanningLineRef.current = currentScanningLine;
  }, [currentScanningLine]);

  useEffect(() => {
    if (!convertDefaultAccountId && accounts.length) {
      const firstExpense = accounts.find((account) => !account.isPayable);
      if (firstExpense) {
        setConvertDefaultAccountId(firstExpense.id);
      }
    }
  }, [accounts, convertDefaultAccountId]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!showWeightEntry) {
      if (weightFocusTimeoutRef.current !== null) {
        window.clearTimeout(weightFocusTimeoutRef.current);
        weightFocusTimeoutRef.current = null;
      }
      return;
    }

    if (weightFocusTimeoutRef.current === null) {
      requestWeightInputFocus();
    }

    return () => {
      if (weightFocusTimeoutRef.current !== null) {
        window.clearTimeout(weightFocusTimeoutRef.current);
        weightFocusTimeoutRef.current = null;
      }
    };
  }, [showWeightEntry, scannedBarcode, requestWeightInputFocus]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setAccountsLoading(true);
      const [grnData, poData, accountData] = await Promise.all([
        goodsReceivedService.getAllGoodsReceived(),
        purchaseOrderService.getPendingPurchaseOrders(),
        accountingService.listChartOfAccounts(),
      ]);
      setGoodsReceived(grnData);
      setPendingPOs(poData);
      setAccounts(accountData);
      const payableAccount = accountData.find((account) => account.isPayable);
      if (payableAccount && !convertPayableAccountId) {
        setConvertPayableAccountId(payableAccount.id);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
      setAccountsLoading(false);
    }
  };

  const handleOpenConvertDialog = (grn: GoodsReceived) => {
    setConvertGRN(grn);
    setConvertDueDate(grn.received_date);
    const defaults = grn.lines?.reduce<Record<string, string>>((acc, line) => {
      if (line?.id) {
        acc[line.id] = convertDefaultAccountId || acc[line.id] || '';
      }
      return acc;
    }, {}) ?? {};
    setConvertPerLineAccounts(defaults);
    setIsConvertDialogOpen(true);
  };

  const convertLineTotal = (quantity?: number, unitPrice?: number) => {
    return Number(quantity || 0) * Number(unitPrice || 0);
  };

  const handleConvertToBill = async () => {
    if (!convertGRN) {
      toast({
        title: 'No goods received selected',
        description: 'Choose a goods received note to convert.',
        variant: 'destructive',
      });
      return;
    }
    if (!convertPayableAccountId) {
      toast({
        title: 'Payable account required',
        description: 'Choose a payable account for the bill.',
        variant: 'destructive',
      });
      return;
    }
    setConvertLoading(true);
    try {
      const perLine = convertGRN.lines?.reduce<Record<string, string>>((acc, line) => {
        if (line?.id) {
          acc[line.id] = convertPerLineAccounts[line.id] || convertDefaultAccountId;
        }
        return acc;
      }, {}) ?? {};

      await accountingService.convertGoodsReceivedToBill({
        goodsReceivedId: convertGRN.id,
        defaultAccountId: convertDefaultAccountId || undefined,
        payableAccountId: convertPayableAccountId,
        dueDate: convertDueDate || undefined,
        createdBy: user?.id,
        perLineAccounts: perLine,
      });

      toast({
        title: 'Bill created',
        description: `Goods received ${convertGRN.grn_number} converted successfully.`,
      });
      setIsConvertDialogOpen(false);
      setConvertPerLineAccounts({});
      await loadInitialData();
    } catch (error: any) {
      toast({
        title: 'Conversion failed',
        description: error?.message || 'Unable to convert goods received to bill.',
        variant: 'destructive'
      });
    } finally {
      setConvertLoading(false);
    }
  };

  const handleSelectPO = (poId: string) => {
    const po = pendingPOs.find(p => String(p.id) === poId);
    if (!po) return;

    setSelectedPO(po);
    setFormData(prev => ({ ...prev, purchase_order_id: poId }));

    // Initialize receiving lines with default values
    const initialLines: {[key: string]: CreateGoodsReceivedLine} = {};
    po.lines?.forEach(line => {
      const remainingQty = line.quantity - line.received_quantity;
      if (remainingQty > 0) {
        const material = line.raw_material;
        const materialName = typeof material?.name === 'string' ? material.name.toLowerCase() : '';
        const isFabric = material?.category_id === 1 || materialName.includes('fabric');
        initialLines[line.id] = {
          purchase_order_line_id: line.id,
          raw_material_id: line.raw_material_id,
          quantity_received: isFabric ? 0 : remainingQty,
          unit_price: line.unit_price,
          batch_number: '',
          expiry_date: '',
          notes: ''
        };
      }
    });
    setReceivingLines(initialLines);
    setFabricRolls({});
  };

  const isFabricMaterial = (poLine: any): boolean => {
    // Check if material belongs to fabric category (ID: 1)
    const material = poLine?.raw_material;
    if (material?.category_id === 1) {
      return true;
    }
    // Fallback to name check if category_id not available
    const materialName = typeof material?.name === 'string' ? material.name.toLowerCase() : '';
    return materialName.includes('fabric');
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
    setRollWeightInput('');
    setRollLengthInput('');
    setShowWeightEntry(false);
    setIsManualEntry(false);
  };

  const handleBarcodeScanned = (barcode: string) => {
    if (!currentScanningLine) {
      return;
    }

    const targetLine = currentScanningLine;
    const sanitizedBarcode = barcode.trim();
    if (!sanitizedBarcode) {
      toast({
        title: 'Invalid Barcode',
        description: 'Scanned barcode is empty. Please try again.',
        variant: 'destructive'
      });
      restartBarcodeScanner();
      return;
    }

    // Prevent duplicates within this GRN (any line)
    const duplicateInSession = Object.values(fabricRolls).some(rolls =>
      Array.isArray(rolls) && rolls.some(roll => roll.barcode === sanitizedBarcode)
    );

    if (duplicateInSession) {
      toast({
        title: 'Duplicate Barcode',
        description: 'This barcode has already been scanned in this GRN.',
        variant: 'destructive'
      });
      restartBarcodeScanner();
      return;
    }

    (async () => {
      try {
        const { data: existingRolls, error } = await supabase
          .from('goods_received_lines')
          .select('id')
          .eq('roll_barcode', sanitizedBarcode)
          .limit(1);

        if (error) {
          console.error('Failed to validate barcode against Goods Received records:', error);
          toast({
            title: 'Scan Error',
            description: 'Could not validate the barcode. Please try again.',
            variant: 'destructive'
          });
          restartBarcodeScanner();
          return;
        }

        if (existingRolls && existingRolls.length > 0) {
          toast({
            title: 'Duplicate Barcode',
            description: 'This barcode already exists in Goods Received records.',
            variant: 'destructive'
          });
          restartBarcodeScanner();
          return;
        }

        if (currentScanningLineRef.current !== targetLine) {
          return;
        }

        if (!showFabricScannerRef.current) {
          return;
        }

        console.log('Barcode scanned:', sanitizedBarcode);
        setScannedBarcode(sanitizedBarcode);
        setRollWeightInput('');
        setRollLengthInput('');
        // Don't close the scanner immediately, just show weight entry overlay
        setShowWeightEntry(true);
        setIsManualEntry(false);
        requestWeightInputFocus(50);
      } catch (err) {
        console.error('Unexpected error while validating barcode:', err);
        toast({
          title: 'Scan Error',
          description: 'Could not validate the barcode. Please try again.',
          variant: 'destructive'
        });
        restartBarcodeScanner();
      }
    })();
  };

  const handleWeightConfirmed = () => {
    const unit = currentScanningLine 
      ? (selectedPO?.lines?.find(l => l.id === currentScanningLine)?.raw_material?.purchase_unit || 'kg')
      : 'kg';
    const isWeightMode = unit.toLowerCase().includes('kg');
    const parsedPrimary = parseFloat(rollWeightInput);
    if (!scannedBarcode || Number.isNaN(parsedPrimary) || parsedPrimary <= 0) {
      toast({
        title: 'Validation Error',
        description: `Please provide valid ${isWeightMode ? 'weight' : 'length'} (${unit})`,
        variant: 'destructive'
      });
      return false;
    }

    // Store values before resetting state
    const currentBarcode = scannedBarcode.trim();
    const currentQty = parsedPrimary;
    
    const result = handleAddFabricRoll();
    
    if (result) {
      // Reset for next scan but keep scanner open
      setShowWeightEntry(false);
      setScannedBarcode('');
      setRollWeightInput('');
      setRollLengthInput('');
      setIsManualEntry(false);
      
      // Show success message with stored values
      toast({
        title: 'Roll Added Successfully',
        description: `Barcode: ${currentBarcode} | ${isWeightMode ? 'Weight' : 'Length'}: ${currentQty}${unit}`,
        variant: 'default'
      });
    }
  };

  const handleAddFabricRoll = () => {
    const unit = currentScanningLine 
      ? (selectedPO?.lines?.find(l => l.id === currentScanningLine)?.raw_material?.purchase_unit || 'kg')
      : 'kg';
    const isWeightMode = unit.toLowerCase().includes('kg');
    const parsedPrimary = parseFloat(rollWeightInput);
    const sanitizedBarcode = scannedBarcode.trim();
    let parsedLength: number | undefined;
    if (rollLengthInput) {
      const maybeLength = parseFloat(rollLengthInput);
      if (Number.isNaN(maybeLength) || maybeLength < 0) {
        toast({
          title: 'Validation Error',
          description: 'Please provide a valid length for the roll',
          variant: 'destructive'
        });
        return false;
      }
      parsedLength = maybeLength;
    }

    if (!currentScanningLine || !sanitizedBarcode || Number.isNaN(parsedPrimary) || parsedPrimary <= 0) {
      toast({
        title: 'Validation Error',
        description: `Please provide barcode and ${isWeightMode ? 'weight' : 'length'} (${unit}) for the roll`,
        variant: 'destructive'
      });
      return false;
    }

    // Check if barcode already exists for this line
    const existingRolls = fabricRolls[currentScanningLine] || [];
    if (existingRolls.some(roll => roll.barcode === sanitizedBarcode)) {
      toast({
        title: 'Duplicate Barcode',
        description: 'This barcode has already been scanned for this material',
        variant: 'destructive'
      });
      return false;
    }

    // Prevent duplicate barcodes across other purchase order lines
    const duplicateElsewhere = Object.entries(fabricRolls).some(([lineId, rolls]) => {
      if (lineId === currentScanningLine) return false;
      return rolls.some(roll => roll.barcode === sanitizedBarcode);
    });

    if (duplicateElsewhere) {
      toast({
        title: 'Duplicate Barcode',
        description: 'This barcode has already been scanned for another material in this GRN',
        variant: 'destructive'
      });
      return false;
    }

    const newRoll: FabricRoll = isWeightMode
      ? { barcode: sanitizedBarcode, weight: parsedPrimary, length: parsedLength !== undefined && parsedLength > 0 ? parsedLength : undefined }
      : { barcode: sanitizedBarcode, weight: 0 as any, length: parsedPrimary };

    setFabricRolls(prev => ({
      ...prev,
      [currentScanningLine]: [...(prev[currentScanningLine] || []), newRoll]
    }));

    // Update total quantity in receiving line
    const totalQty = [...existingRolls, newRoll].reduce((sum, roll) => sum + (isWeightMode ? (roll.weight || 0) : (roll.length || 0)), 0);
    handleUpdateReceivingLine(currentScanningLine, 'quantity_received', totalQty);

    return true;
  };

  const closeFabricScanner = () => {
    setShowBarcodeCamera(false);
    setIsManualEntry(false);
    setShowWeightEntry(false);
    setScannedBarcode('');
    setRollWeightInput('');
    setRollLengthInput('');
    setCurrentScanningLine(null);
    setShowFabricScanner(false);
    if (selectedPO) {
      setIsCreateDialogOpen(true);
    }
  };

  const handleCompleteReceiving = async () => {
    if (!currentScanningLine || !selectedPO) {
      closeFabricScanner();
      return;
    }

    try {
      // Update the receiving line with the total scanned quantity based on unit
      const unit = selectedPO?.lines?.find(l => l.id === currentScanningLine)?.raw_material?.purchase_unit || 'kg';
      const isWeightMode = unit.toLowerCase().includes('kg');
      const scannedRolls = fabricRolls[currentScanningLine] || [];
      const totalQty = scannedRolls.reduce((sum, roll) => sum + (isWeightMode ? (roll.weight || 0) : (roll.length || 0)), 0);
      
      if (totalQty > 0) {
        handleUpdateReceivingLine(currentScanningLine, 'quantity_received', totalQty);
        
        toast({
          title: 'Receiving Completed',
          description: `${scannedRolls.length} rolls (${totalQty}${unit}) marked as received. You can continue with other materials.`,
          variant: 'default'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to complete receiving',
        variant: 'destructive'
      });
    } finally {
      closeFabricScanner();
    }
  };

  const handleRemoveFabricRoll = (lineId: string, barcode: string) => {
    setFabricRolls(prev => {
      const updatedRolls = (prev[lineId] || []).filter(roll => roll.barcode !== barcode);
      const unit = selectedPO?.lines?.find(l => l.id === lineId)?.raw_material?.purchase_unit || 'kg';
      const isWeightMode = unit.toLowerCase().includes('kg');
      const totalQty = updatedRolls.reduce((sum, roll) => sum + (isWeightMode ? (roll.weight || 0) : (roll.length || 0)), 0);
      
      // Update total quantity in receiving line
      handleUpdateReceivingLine(lineId, 'quantity_received', totalQty);
      
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
          title: 'Fabric Scanning Optional',
          description: `No barcode scans recorded for: ${fabricLinesWithoutScans.join(', ')}. You can continue without scanning if needed.`,
          variant: 'default'
        });
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
          const unit = poLine?.raw_material?.purchase_unit || 'kg';
          const weightMode = unit.toLowerCase().includes('kg');
          const rolls = fabricRolls[lineId] || [];
          rolls.forEach(roll => {
            allLines.push({
              ...receivingLine,
              quantity_received: weightMode ? (roll.weight || 0) : (roll.length || 0),
              roll_barcode: roll.barcode,
              roll_weight: weightMode ? (roll.weight || 0) : null as any,
              roll_length: !weightMode ? (roll.length || 0) : null as any,
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

  const handleCreateDialogChange = (open: boolean) => {
    if (open) {
      setIsCreateDialogOpen(true);
      return;
    }

    if (showFabricScanner || showBarcodeCamera || showCloseLineDialog) {
      // Ignore close attempts while auxiliary flows are active
      return;
    }

    handleCloseCreateDialog();
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

  const handleVerifyGRN = async (id: string) => {
    try {
      await goodsReceivedService.verifyGoodsReceived(id);
      setGoodsReceived(prev => prev.map(grn =>
        grn.id === id ? { ...grn, status: 'verified' } : grn
      ));
      toast({ title: 'Verified', description: 'GRN verified successfully.' });
      // Broadcast inventory update so other screens can refresh
      window.dispatchEvent(new CustomEvent('inventory-updated'));
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to verify GRN', variant: 'destructive' });
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
                  0
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenConvertDialog(grn)}
                        disabled={accountsLoading}
                        className="text-purple-600 hover:text-purple-800"
                      >
                        <Receipt className="h-4 w-4" />
                      </Button>
                      {grn.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleVerifyGRN(grn.id)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Auto-post on verify; no separate post button */}
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

    <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-purple-600" />
            Convert to Bill
          </DialogTitle>
          <DialogDescription>
            Create a supplier bill directly from this goods received note.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SearchableSelect
              options={accountOptions}
              value={convertDefaultAccountId}
              onChange={setConvertDefaultAccountId}
              placeholder="Default expense account"
            />
            <SearchableSelect
              options={payableOptions}
              value={convertPayableAccountId}
              onChange={setConvertPayableAccountId}
              placeholder="Payable account"
            />
            <Input
              type="date"
              value={convertDueDate}
              onChange={(event) => setConvertDueDate(event.target.value)}
              placeholder="Due date"
            />
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {convertGRN?.lines?.map((line) => (
              <div key={line.id} className="grid grid-cols-12 gap-3 rounded-lg border p-3 bg-slate-50/70">
                <div className="col-span-5">
                  <div className="font-semibold">{line.raw_material?.name ?? 'Material'}</div>
                  <div className="text-xs text-muted-foreground">Qty {Number(line.quantity_received ?? 0).toFixed(2)}</div>
                </div>
                <div className="col-span-3 flex flex-col">
                  <span className="text-xs text-muted-foreground">Unit</span>
                  <span className="font-medium">{Number(line.unit_price ?? 0).toFixed(2)}</span>
                </div>
                <div className="col-span-2 flex flex-col">
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <span className="font-semibold">{convertLineTotal(line.quantity_received, line.unit_price).toFixed(2)}</span>
                </div>
                <div className="col-span-4">
                  <SearchableSelect
                    options={accountOptions}
                    value={convertPerLineAccounts[line.id] ?? convertDefaultAccountId}
                    onChange={(value) => setConvertPerLineAccounts((prev) => ({ ...prev, [line.id]: value }))}
                    placeholder="Assign account"
                  />
                </div>
              </div>
            ))}
            {!convertGRN?.lines?.length && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No line items found for this goods received note.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsConvertDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleConvertToBill} disabled={convertLoading}>
              {convertLoading ? 'Creating bill…' : 'Create Bill'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>

    {/* Create Goods Received Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange} modal={false}>
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
                <SearchableSelect
                  value={formData.purchase_order_id}
                  onChange={handleSelectPO}
                  placeholder="Select purchase order"
                  searchPlaceholder="Search purchase orders..."
                  options={pendingPOs.map(po => ({
                    value: String(po.id),
                    label: po.po_number || 'Unnamed PO',
                    description: po.supplier?.name || 'Unknown supplier'
                  }))}
                />
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
                                      {(() => {
                                        const unit = line.raw_material?.purchase_unit || 'kg';
                                        const isWeightMode = (unit || '').toLowerCase().includes('kg');
                                        const qty = isWeightMode 
                                          ? totalScannedWeight
                                          : fabricRollsForLine.reduce((s, r) => s + (r.length || 0), 0);
                                        return `${qty.toFixed(2)} ${unit}`;
                                      })()}
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
            {selectedGRN?.status === 'pending' && (
              <Button
                onClick={() => {
                  handleVerifyGRN(selectedGRN.id);
                  setIsViewDialogOpen(false);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Verify
              </Button>
            )}
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
      <Dialog open={showFabricScanner} onOpenChange={setShowFabricScanner} modal={false}>
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
                {fabricRolls[currentScanningLine].map((roll, index) => {
                  const unit = selectedPO?.lines?.find(l => l.id === currentScanningLine)?.raw_material?.purchase_unit || 'kg';
                  const isWeightMode = unit.toLowerCase().includes('kg');
                  const qty = isWeightMode ? (roll.weight || 0) : (roll.length || 0);
                  return (
                    <div key={roll.barcode} className="flex justify-between items-center p-2 border rounded mb-2">
                      <span className="font-mono">{roll.barcode}</span>
                      <span>{qty} {unit}</span>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleRemoveFabricRoll(currentScanningLine!, roll.barcode)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
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
        ref={barcodeScannerRef}
        isOpen={showBarcodeCamera}
        onScan={handleBarcodeScanned}
        scannedRolls={currentScanningLine ? fabricRolls[currentScanningLine] || [] : []}
        currentScanningLine={
          currentScanningLine 
            ? selectedPO?.lines?.find(line => line.id === currentScanningLine)?.raw_material?.name || 'Material'
            : 'Material'
        }
        unitLabel={(currentScanningLine ? (selectedPO?.lines?.find(line => line.id === currentScanningLine)?.raw_material?.purchase_unit) : '') || 'kg'}
        quantityMetric={(currentScanningLine ? ((selectedPO?.lines?.find(line => line.id === currentScanningLine)?.raw_material?.purchase_unit || 'kg').toLowerCase().includes('kg') ? 'weight' : 'length') : 'weight')}
        onRemoveRoll={(barcode) => {
          if (currentScanningLine) {
            handleRemoveFabricRoll(currentScanningLine, barcode);
          }
        }}
        onDone={handleCompleteReceiving}
        onClose={() => {
          closeFabricScanner();
        }}
      >
        {/* Weight Entry Overlay */}
        {showWeightEntry && scannedBarcode && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black/50 p-4 md:p-8 overflow-y-auto" 
            style={{ 
              zIndex: 2147483646,
              pointerEvents: 'auto'
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Card 
              className="w-full max-w-full md:max-w-lg bg-white max-h-[90vh] overflow-y-auto" 
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="weight">{(() => {
                      const unit = currentScanningLine ? (selectedPO?.lines?.find(l => l.id === currentScanningLine)?.raw_material?.purchase_unit || 'kg') : 'kg';
                      const isWeightMode = unit.toLowerCase().includes('kg');
                      return `${isWeightMode ? 'Weight' : 'Length'} (${unit}) *`;
                    })()}</Label>
                    <Input
                      id="weight"
                      ref={weightInputRef}
                      type="text"
                      inputMode="decimal"
                      value={rollWeightInput}
                      onChange={(e) => {
                        const raw = e.target.value.replace(',', '.');
                        if (raw === '' || decimalInputPattern.test(raw)) {
                          setRollWeightInput(raw);
                        }
                      }}
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                  {/* Optional secondary field remains available but unlabeled per unit */}
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
                    disabled={!canAddRoll}
                    type="button"
                  >
                    Add Roll
                  </Button>
                  <Button 
                    onClick={() => {
                      setShowWeightEntry(false);
                      setScannedBarcode('');
                      setRollWeightInput('');
                      setRollLengthInput('');
                      setIsManualEntry(false);
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

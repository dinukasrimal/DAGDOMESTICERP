import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Button } from './button';
import { Input } from './input';
import { X, Keyboard, QrCode, Flashlight, FlashlightOff, Trash2, CheckCircle } from 'lucide-react';

interface FabricRoll {
  barcode: string;
  weight: number;
  length?: number;
}

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  isOpen: boolean;
  children?: React.ReactNode; // For overlay content like weight entry
  scannedRolls?: FabricRoll[]; // List of scanned rolls to display
  currentScanningLine?: string; // Current material line name
  onRemoveRoll?: (barcode: string) => void; // Remove roll callback
  onDone?: () => void; // Complete receiving callback
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ 
  onScan, 
  onClose, 
  isOpen, 
  children, 
  scannedRolls = [], 
  currentScanningLine = 'Material',
  onRemoveRoll,
  onDone
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [flashOn, setFlashOn] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);

  // Start camera when scanner opens
  useEffect(() => {
    if (isOpen && !showManualEntry) {
      initializeScanner();
    } else {
      cleanup();
    }

    return cleanup;
  }, [isOpen, showManualEntry]);

  const cleanup = () => {
    console.log('Cleaning up scanner...');
    
    // Stop the reader
    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch (err) {
        console.warn('Error resetting reader:', err);
      }
      readerRef.current = null;
    }

    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }

    setIsScanning(false);
    setFlashOn(false);
  };

  const initializeScanner = async () => {
    try {
      console.log('Initializing scanner...');
      setError(null);
      setIsScanning(true);

      // Check if camera is available
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported');
      }

      // Request camera permission and get stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 }
        }
      });

      streamRef.current = stream;

      // Check if flash is available
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as any;
      if (capabilities?.torch) {
        setHasFlash(true);
      }

      // Set up video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Create barcode reader
      readerRef.current = new BrowserMultiFormatReader();
      
      // Start continuous scanning
      const scanResult = await readerRef.current.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, error) => {
          if (result) {
            const scannedCode = result.getText().trim();
            console.log('Barcode detected:', scannedCode);
            
            // Vibrate on successful scan
            if (navigator.vibrate) {
              navigator.vibrate([100, 50, 100]);
            }
            
            // Call the onScan callback but don't close the scanner
            onScan(scannedCode);
            
            // Show visual feedback
            showScanSuccess();
          }
        }
      );

    } catch (err: any) {
      console.error('Scanner initialization failed:', err);
      setError(err.message || 'Failed to start camera');
      setIsScanning(false);
    }
  };

  const showScanSuccess = () => {
    // Add a brief visual feedback for successful scan
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 255, 0, 0.3);
      z-index: 9999;
      pointer-events: none;
    `;
    document.body.appendChild(overlay);
    
    setTimeout(() => {
      document.body.removeChild(overlay);
    }, 200);
  };

  const toggleFlash = async () => {
    if (streamRef.current && hasFlash) {
      const track = streamRef.current.getVideoTracks()[0];
      try {
        await track.applyConstraints({
          advanced: [{ torch: !flashOn } as any]
        });
        setFlashOn(!flashOn);
      } catch (err) {
        console.warn('Flash toggle failed:', err);
      }
    }
  };

  const handleManualSubmit = () => {
    if (manualBarcode.trim()) {
      console.log('Manual barcode entered:', manualBarcode.trim());
      onScan(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  const switchToManual = () => {
    cleanup();
    setShowManualEntry(true);
  };

  const switchToCamera = () => {
    setShowManualEntry(false);
    setManualBarcode('');
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black flex flex-col barcode-scanner-overlay" 
      style={{ 
        zIndex: 2147483647, // Maximum z-index value
        position: 'fixed !important' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80 text-white">
        <h1 className="text-lg font-semibold">Scan Barcode</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-white hover:bg-white/20"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Main Content - Split Screen */}
      <div className="flex-1 relative flex">
        {/* Left Side - Camera/Manual Entry */}
        <div className="flex-1 relative">
          {showManualEntry ? (
            // Manual Entry Mode
            <div className="flex flex-col items-center justify-center h-full p-6 bg-gray-900">
              <div className="w-full max-w-md space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-white mb-2">Manual Entry</h2>
                  <p className="text-gray-300">Type or paste your barcode below</p>
                </div>
                
                <div className="space-y-4">
                  <Input
                    type="text"
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleManualSubmit();
                      }
                    }}
                    placeholder="Enter barcode here..."
                    className="text-lg p-4 bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                    autoFocus
                  />
                  
                  <Button
                    onClick={handleManualSubmit}
                    disabled={!manualBarcode.trim()}
                    className="w-full py-4 text-lg bg-blue-600 hover:bg-blue-700"
                  >
                    Submit Barcode
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // Camera Mode
            <div className="relative h-full">
              {error ? (
                <div className="flex flex-col items-center justify-center h-full p-6 bg-gray-900">
                  <div className="text-center">
                    <p className="text-red-400 text-lg mb-4">{error}</p>
                    <Button
                      onClick={initializeScanner}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Video Stream */}
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />

                  {/* Scanning Overlay */}
                  {isScanning && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      {/* Scanning Frame */}
                      <div className="relative">
                        <div className="w-80 h-48 border-4 border-red-500 rounded-lg relative">
                          {/* Corner indicators */}
                          <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
                          <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
                          <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
                          <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg"></div>
                          
                          {/* Scanning line animation */}
                          <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>
                        </div>
                        
                        <p className="text-white text-center mt-4 text-lg font-medium">
                          Position barcode within the frame
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Status indicator */}
                  {isScanning && (
                    <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                      🔴 SCANNING
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Side - Scanned Rolls List */}
        <div className="w-80 bg-gray-800 border-l border-gray-600 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{currentScanningLine}</h3>
                <p className="text-sm text-gray-300">Scanned Rolls</p>
              </div>
              {scannedRolls.length > 0 && onDone && (
                <Button
                  onClick={() => {
                    if (confirm(`Complete receiving ${scannedRolls.length} rolls (${scannedRolls.reduce((sum, roll) => sum + roll.weight, 0).toFixed(1)}kg)?`)) {
                      onDone();
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 text-sm"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Done
                </Button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="p-4 border-b border-gray-600 bg-gray-750">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-400">{scannedRolls.length}</div>
                <div className="text-xs text-gray-400">Total Rolls</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">
                  {scannedRolls.reduce((sum, roll) => sum + roll.weight, 0).toFixed(1)}kg
                </div>
                <div className="text-xs text-gray-400">Total Weight</div>
              </div>
            </div>
          </div>

          {/* Rolls List */}
          <div className="flex-1 overflow-y-auto">
            {scannedRolls.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
                <QrCode className="h-8 w-8 mb-2 opacity-50" />
                <p>No rolls scanned yet</p>
                <p className="text-xs mt-1">Scan barcodes to add rolls</p>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {scannedRolls.map((roll, index) => (
                  <div key={roll.barcode} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {roll.barcode}
                        </div>
                        <div className="text-xs text-gray-400">
                          Roll #{index + 1}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-right">
                          <div className="text-sm font-semibold text-green-400">
                            {roll.weight}kg
                          </div>
                          {roll.length && (
                            <div className="text-xs text-blue-400">
                              {roll.length}m
                            </div>
                          )}
                        </div>
                        {onRemoveRoll && (
                          <Button
                            onClick={() => {
                              if (confirm(`Remove roll ${roll.barcode} (${roll.weight}kg)?`)) {
                                onRemoveRoll(roll.barcode);
                              }
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                            title="Remove this roll"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overlay Content (e.g., weight entry) */}
      {children}

      {/* Bottom Controls */}
      <div className="p-4 bg-black/80 space-y-4">
        {/* Mode Toggle */}
        <div className="flex space-x-2">
          <Button
            onClick={switchToCamera}
            variant={!showManualEntry ? "default" : "outline"}
            className="flex-1 py-3"
          >
            <QrCode className="h-5 w-5 mr-2" />
            Camera
          </Button>
          <Button
            onClick={switchToManual}
            variant={showManualEntry ? "default" : "outline"}
            className="flex-1 py-3"
          >
            <Keyboard className="h-5 w-5 mr-2" />
            Manual
          </Button>
        </div>

        {/* Additional Controls for Camera Mode */}
        {!showManualEntry && (
          <div className="flex justify-center space-x-4">
            {hasFlash && (
              <Button
                onClick={toggleFlash}
                variant="outline"
                size="lg"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                {flashOn ? <FlashlightOff className="h-6 w-6" /> : <Flashlight className="h-6 w-6" />}
              </Button>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="text-center">
          <p className="text-gray-300 text-sm">
            {showManualEntry 
              ? "Type your barcode manually or switch to camera mode"
              : "Scanner stays open - scan multiple barcodes consecutively"
            }
          </p>
        </div>
      </div>
    </div>
  );
};
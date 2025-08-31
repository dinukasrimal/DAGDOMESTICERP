import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Alert, AlertDescription } from './alert';
import { Input } from './input';
import { Label } from './label';
import { Camera, X, RotateCcw, Keyboard, QrCode, Check } from 'lucide-react';


interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  isOpen: boolean;
  onManualEntryChange?: (isManual: boolean) => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose, isOpen, onManualEntryChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset all states when scanner opens
      setManualBarcode('');
      setShowManualEntry(false);
      setError(null);
      startScanning();
    } else {
      stopScanning();
      // Reset states when scanner closes
      setManualBarcode('');
      setShowManualEntry(false);
      setError(null);
    }

    return () => {
      stopScanning();
      // Clean up the portal container when component unmounts
      const container = document.getElementById('barcode-scanner-portal');
      if (container && !isOpen) {
        container.remove();
      }
    };
  }, [isOpen]);

  // Force focus for manual entry with direct DOM manipulation
  useEffect(() => {
    if (showManualEntry && isOpen) {
      console.log('Manual entry mode activated, forcing focus with DOM manipulation');
      
      const focusInput = () => {
        // Use document.querySelector to find the input
        const input = document.querySelector('#manual-barcode') as HTMLInputElement;
        if (input) {
          console.log('Found input via querySelector, forcing focus and enabling');
          
          // Remove any potential blocks
          input.removeAttribute('readonly');
          input.removeAttribute('disabled');
          input.style.pointerEvents = 'auto';
          input.style.userSelect = 'text';
          input.tabIndex = 0;
          
          // Clear and focus
          input.value = '';
          input.focus();
          input.click();
          
          console.log('Input focus attempt completed, activeElement:', document.activeElement);
          console.log('Input has focus:', document.activeElement === input);
        } else {
          console.log('Input not found yet');
        }
      };
      
      // Try multiple times with increasing delays
      setTimeout(focusInput, 100);
      setTimeout(focusInput, 200);
      setTimeout(focusInput, 400);
      setTimeout(focusInput, 800);
    }
  }, [showManualEntry, isOpen]);

  const startScanning = async () => {
    try {
      console.log('Starting camera scanning...');
      setError(null);
      setIsScanning(true);
      setShowManualEntry(false);

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported by this browser');
      }

      // Request camera permission with better constraints
      console.log('Requesting camera permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Prefer back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      setHasPermission(true);
      console.log('Camera permission granted');
      
      // Stop the stream immediately, ZXing will handle it
      stream.getTracks().forEach(track => track.stop());

      // Initialize barcode reader
      if (!readerRef.current) {
        console.log('Initializing barcode reader...');
        readerRef.current = new BrowserMultiFormatReader();
        // Set scanning hints for better performance
        readerRef.current.timeBetweenDecodingAttempts = 300;
      }

      if (videoRef.current) {
        console.log('Starting video decoding...');
        // Start decoding from video device
        await readerRef.current.decodeFromVideoDevice(
          undefined, // Use default camera
          videoRef.current,
          (result, error) => {
            if (result) {
              const barcode = result.getText().trim();
              console.log('Scanned code:', barcode, 'Format:', result.getBarcodeFormat());
              
              // Vibrate on successful scan (if supported)
              if ('vibrate' in navigator) {
                navigator.vibrate(200);
              }
              
              console.log('Calling onScan with scanned code');
              onScan(barcode);
              // Don't automatically stop scanning - let the parent component close the scanner
              // This prevents the scanner from closing before parent can update state
            }
            // Only log non-NotFoundException errors to reduce console spam
            if (error && !error.name?.includes('NotFoundException') && !error.message?.includes('NotFoundException')) {
              console.warn('Scanning error:', error.name, error.message);
            }
          }
        );
        console.log('Video decoding started successfully');
      }
    } catch (err: any) {
      console.error('Failed to start camera:', err);
      setHasPermission(false);
      setError(err.message || 'Failed to access camera');
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    console.log('Stopping camera scanning...');
    if (readerRef.current) {
      try {
        // Try different methods to stop the scanner
        if (typeof readerRef.current.reset === 'function') {
          readerRef.current.reset();
        } else if (typeof readerRef.current.stopAsyncDecode === 'function') {
          readerRef.current.stopAsyncDecode();
        } else if (typeof readerRef.current.stopContinuousDecode === 'function') {
          readerRef.current.stopContinuousDecode();
        }
        console.log('Barcode reader stopped successfully');
      } catch (err) {
        console.warn('Error stopping barcode reader:', err);
      }
    }
    setIsScanning(false);
  };

  const handleRetry = () => {
    setError(null);
    setHasPermission(null);
    setShowManualEntry(false);
    startScanning();
  };

  const handleManualEntry = () => {
    console.log('Manual entry clicked, barcode:', manualBarcode);
    if (manualBarcode.trim()) {
      console.log('Calling onScan with:', manualBarcode.trim());
      onScan(manualBarcode.trim());
      setManualBarcode('');
      setShowManualEntry(false);
      // Don't close the scanner here - let parent component handle it
    }
  };

  const switchToManual = () => {
    console.log('Switching to manual entry');
    stopScanning();
    setShowManualEntry(true);
    onManualEntryChange?.(true);
  };

  const switchToCamera = () => {
    console.log('Switching to camera');
    setShowManualEntry(false);
    onManualEntryChange?.(false);
    startScanning();
  };

  const handleClose = () => {
    console.log('Scanner close clicked');
    stopScanning();
    onManualEntryChange?.(false);
    onClose();
  };

  const handleRetryClick = () => {
    console.log('Retry clicked');
    setError(null);
    setHasPermission(null);
    setShowManualEntry(false);
    startScanning();
  };



  if (!isOpen) return null;

  const scannerContent = (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center"
      style={{ zIndex: 999999 }}
      onClick={(e) => {
        console.log('Backdrop clicked, target:', e.target, 'currentTarget:', e.currentTarget);
        // Only close if clicking the backdrop, not the card
        if (e.target === e.currentTarget) {
          console.log('Closing scanner from backdrop click');
          handleClose();
        }
      }}
    >
      <Card 
        className="w-full max-w-md mx-4 shadow-2xl border-2"
        onClick={(e) => {
          // Only prevent event bubbling to parent, but allow normal form interactions
          e.stopPropagation();
        }}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Camera className="h-5 w-5" />
              <span>Scan Barcode</span>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                console.log('Close button clicked');
                handleClose();
              }}
              className="h-8 w-8 rounded-full"
              type="button"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex space-x-2">
            <Button
              onClick={(e) => {
                e.preventDefault();
                console.log('Manual entry button clicked');
                switchToManual();
              }}
              variant={showManualEntry ? "default" : "outline"}
              className="flex-1"
              type="button"
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Manual Entry
            </Button>
            <Button
              onClick={(e) => {
                e.preventDefault();
                console.log('Camera scan button clicked');
                switchToCamera();
              }}
              variant={!showManualEntry ? "default" : "outline"}
              className="flex-1"
              type="button"
            >
              <QrCode className="h-4 w-4 mr-2" />
              Camera Scan
            </Button>
          </div>

          {showManualEntry ? (
            /* Manual Entry Mode */
            <div className="space-y-4">
              <div>
                <Label htmlFor="manual-barcode">Enter Barcode/QR Code</Label>
                <Input
                  key={`manual-input-${showManualEntry}-${isOpen}`} // Force remount each time
                  id="manual-barcode"
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => {
                    console.log('Input changed:', e.target.value);
                    setManualBarcode(e.target.value);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && manualBarcode.trim()) {
                      e.preventDefault();
                      handleManualEntry();
                    }
                  }}
                  placeholder="Type or paste barcode/QR code here"
                  className="font-mono text-lg p-3"
                  autoFocus
                />
              </div>
              <Button 
                onClick={(e) => {
                  e.preventDefault();
                  console.log('Use This Code button clicked');
                  handleManualEntry();
                }}
                className="w-full py-3 text-lg" 
                disabled={!manualBarcode.trim()}
                type="button"
              >
                <Check className="h-5 w-5 mr-2" />
                Use This Code
              </Button>
            </div>
          ) : (
            /* Camera Scanning Mode */
            <div className="space-y-4">
              {hasPermission === false && (
                <Alert>
                  <AlertDescription>
                    Camera permission is required to scan barcodes. Please allow camera access and try again.
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert>
                  <AlertDescription className="flex items-center justify-between">
                    <span>{error}</span>
                    <Button 
                      size="sm" 
                      onClick={(e) => {
                        e.preventDefault();
                        console.log('Retry button clicked');
                        handleRetryClick();
                      }}
                      variant="outline" 
                      type="button"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-64 object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                
                {isScanning && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div 
                        className="border-2 border-red-500 rounded-lg bg-transparent" 
                        style={{
                          width: '250px',
                          height: '100px',
                          animation: 'pulse 2s infinite'
                        }}
                      >
                        <div className="w-full h-full border border-red-300 rounded-lg opacity-30"></div>
                      </div>
                    </div>
                    <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                      🔴 Scanning...
                    </div>
                  </>
                )}
                
                {!isScanning && hasPermission && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="text-white text-center">
                      <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Camera Loading...</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm text-gray-600">
                  Position barcode/QR code within the red frame
                </p>
                <p className="text-xs text-gray-500">
                  Supports: Code128, Code39, EAN, UPC, QR Codes
                </p>
                <p className="text-xs text-blue-500">
                  💡 For testing: Try switching to "Manual Entry" mode
                </p>
              </div>
            </div>
          )}

          <div className="flex space-x-2">
            <Button 
              onClick={(e) => {
                e.preventDefault();
                console.log('Cancel button clicked');
                handleClose();
              }}
              variant="outline" 
              className="flex-1" 
              type="button"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            {!showManualEntry && (
              <Button 
                onClick={(e) => {
                  e.preventDefault();
                  console.log('Restart Camera button clicked');
                  handleRetryClick();
                }}
                variant="outline" 
                className="flex-1" 
                type="button"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Restart Camera
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Render using portal directly to document.body with isolation
  return createPortal(
    <div
      data-barcode-scanner="true"
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 999999,
        pointerEvents: isOpen ? 'auto' : 'none'
      }}
    >
      {scannerContent}
    </div>,
    document.body
  );
};
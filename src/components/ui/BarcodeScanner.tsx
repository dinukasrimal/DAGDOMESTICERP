import React, { useEffect, useRef, useState, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { X, Keyboard, QrCode, Flashlight, FlashlightOff, Trash2, CheckCircle } from 'lucide-react';

/**
 * Replace these with your actual UI components if you have shadcn/ui etc.
 * Otherwise keep them as very small fallbacks.
 */
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost'; size?: 'sm' | 'lg' } > = ({
  className = '',
  variant = 'default',
  size,
  ...props
}) => (
  <button
    {...props}
    className={[
      'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
      variant === 'outline' && 'border border-white/20 bg-transparent hover:bg-white/10 text-white',
      variant === 'ghost' && 'bg-transparent hover:bg-white/10 text-white',
      variant === 'default' && 'bg-blue-600 text-white hover:bg-blue-700',
      size === 'sm' && 'h-8 px-2 text-sm',
      size === 'lg' && 'h-12 px-6 text-lg',
      !size && 'h-10 px-4 text-sm',
      className,
    ].join(' ')}
  />
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input
    {...props}
    className={[
      'w-full rounded-md border px-3 py-2 outline-none',
      'bg-white/10 border-white/20 text-white placeholder:text-gray-400',
      className,
    ].join(' ')}
  />
);

interface FabricRoll {
  barcode: string;
  weight: number;
  length?: number;
}

export interface BarcodeScannerHandle {
  resume: () => void;
  pause: () => void;
}

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  isOpen: boolean;
  children?: React.ReactNode; // For overlay content like weight entry
  scannedRolls?: FabricRoll[]; // List of scanned rolls to display
  currentScanningLine?: string; // Current material line name
  onRemoveRoll?: (barcode: string) => void; // Remove roll callback
  onDone?: () => void | Promise<void>; // Complete receiving callback
  /**
   * If true, pause camera scanning immediately after a successful scan.
   * Call resumeScanning() (exposed via ref) or toggle back to camera to resume.
   */
  autoPauseOnScan?: boolean;
  /**
   * Cooldown in ms to ignore repeated scans. Default 1000ms.
   */
  scanCooldownMs?: number;
  /**
   * Label for unit to display in totals (e.g., 'kg', 'yd').
   */
  unitLabel?: string;
  /**
   * Which roll field to aggregate for totals: 'weight' or 'length'.
   * Defaults to 'weight'.
   */
  quantityMetric?: 'weight' | 'length';
}

export const BarcodeScanner = React.forwardRef<BarcodeScannerHandle, BarcodeScannerProps>(({ 
  onScan,
  onClose,
  isOpen,
  children,
  scannedRolls = [],
  currentScanningLine = 'Material',
  onRemoveRoll,
  onDone,
  autoPauseOnScan = false,
  scanCooldownMs = 1000,
  unitLabel = 'kg',
  quantityMetric = 'weight',
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hintsRef = useRef<Map<DecodeHintType, any> | null>(null);

  const lastCodeRef = useRef<string | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [flashOn, setFlashOn] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);

  const requestCameraStream = async (): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
      },
    };

    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices?.getUserMedia) {
      return mediaDevices.getUserMedia(constraints);
    }

    const anyNavigator = navigator as any;
    const legacyGetUserMedia =
      anyNavigator?.getUserMedia ||
      anyNavigator?.webkitGetUserMedia ||
      anyNavigator?.mozGetUserMedia ||
      anyNavigator?.msGetUserMedia;

    if (legacyGetUserMedia) {
      return new Promise<MediaStream>((resolve, reject) => {
        try {
          legacyGetUserMedia.call(navigator, constraints, resolve, reject);
        } catch (legacyErr) {
          reject(legacyErr);
        }
      });
    }

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      throw new Error('Camera access requires HTTPS or running from localhost.');
    }

    throw new Error('Camera not supported on this device or browser.');
  };

  const getFriendlyCameraError = (err: any): string => {
    if (!err) return 'Failed to start camera';
    const name = err.name || '';
    const message: string = err.message || '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera permission denied. Please allow camera access in your browser settings and try again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera device detected. Connect a camera and try again.';
    }
    if (name === 'NotReadableError') {
      return 'Camera is already in use by another application.';
    }
    if (message.toLowerCase().includes('secure') || message.toLowerCase().includes('https')) {
      return 'Camera access requires HTTPS or running from localhost.';
    }

    return message || 'Failed to start camera';
  };

  // —————————————— Lifecycle ——————————————
  useEffect(() => {
    if (isOpen && !showManualEntry) {
      initializeScanner();
    } else {
      cleanup();
    }
    return cleanup;
  }, [isOpen, showManualEntry]);

  const cleanup = () => {
    // Clear cooldown timer
    if (cooldownTimerRef.current) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    lastCodeRef.current = null;

    // Stop the reader
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
      readerRef.current = null;
    }

    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setIsScanning(false);
    setFlashOn(false);
  };

  const initializeScanner = async () => {
    try {
      setError(null);
      setIsScanning(true);

      const stream = await requestCameraStream();

      streamRef.current = stream;

      // Flash support
      const track = stream.getVideoTracks()[0];
      const capabilities = (track.getCapabilities?.() as any) || {};
      setHasFlash(!!capabilities.torch);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // ZXing reader with support for 1D + QR formats
      if (!hintsRef.current) {
        const hints = new Map<DecodeHintType, any>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.ITF,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.PDF_417,
          BarcodeFormat.QR_CODE,
        ]);
        hintsRef.current = hints;
      }

      readerRef.current = new BrowserMultiFormatReader(hintsRef.current, 350);

      await readerRef.current.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, _err) => {
          if (!result) return;
          const code = result.getText().trim();

          // 1) Debounce current code
          if (lastCodeRef.current === code) return;
          lastCodeRef.current = code;

          // 2) Haptics + visual
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          showScanSuccess();

          // 3) Deliver up
          onScan(code);

          // 4) Optionally pause the scanner to let user type weight/width
          // 5) Cooldown to allow next code
          cooldownTimerRef.current = window.setTimeout(() => {
            lastCodeRef.current = null;
            cooldownTimerRef.current = null;
            if (autoPauseOnScan) {
              pauseScanning();
            }
          }, Math.max(250, scanCooldownMs));
        }
      );
    } catch (err: any) {
      setError(getFriendlyCameraError(err));
      setIsScanning(false);
    }
  };

  // —————————————— Controls ——————————————
  const pauseScanning = () => {
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
    }
    setIsScanning(false);
  };

  const resumeScanning = () => {
    if (!isOpen || showManualEntry) return;
    initializeScanner();
  };

  // Expose imperative pause/resume to parent
  useImperativeHandle(ref, () => ({
    resume: resumeScanning,
    pause: pauseScanning,
  }), [isOpen, showManualEntry]);

  const toggleFlash = async () => {
    if (!streamRef.current || !hasFlash) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      await track.applyConstraints({ advanced: [{ torch: !flashOn } as any] });
      setFlashOn((f) => !f);
    } catch {
      // ignore
    }
  };

  const handleManualSubmit = () => {
    const code = manualBarcode.trim();
    if (!code) return;
    onScan(code);
    setManualBarcode('');
  };

  const switchToManual = () => {
    cleanup();
    setShowManualEntry(true);
  };

  const switchToCamera = () => {
    setShowManualEntry(false);
    // when switching back, resume scanning
    setTimeout(resumeScanning, 0);
  };

  const handleCloseClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onClose?.();
  };

  const handleDoneClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onDone) {
      onClose?.();
      return;
    }
    try {
      await onDone();
    } finally {
      if (onClose && onClose !== onDone) onClose();
    }
  };

  const showScanSuccess = () => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; width: 100%; height: 100%;
      background: rgba(0,255,0,0.3); z-index: 9999; pointer-events: none;`;
    document.body.appendChild(overlay);
    setTimeout(() => {
      try { document.body.removeChild(overlay); } catch {}
    }, 200);
  };

  if (!isOpen) return null;

  const overlay = (
    <div
      className="fixed inset-0 bg-black flex flex-col barcode-scanner-overlay"
      style={{
        zIndex: 2147483647,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80 text-white relative z-[2147483647] pointer-events-auto">
        <h1 className="text-lg font-semibold">Scan Barcode</h1>
        <div className="flex items-center gap-2">
          {/* Expose pause/resume controls if desired */}
          {isScanning ? (
            <Button variant="outline" size="sm" onClick={pauseScanning}>Pause</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={resumeScanning}>Resume</Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleCloseClick} className="text-white hover:bg-white/20">
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex">
        {/* Left: Camera / Manual */}
        <div className="flex-1 relative">
          {showManualEntry ? (
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
                    onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }}
                    placeholder="Enter barcode here..."
                    className="text-lg p-4"
                    autoFocus
                  />
                  <Button onClick={handleManualSubmit} disabled={!manualBarcode.trim()} className="w-full py-4 text-lg">
                    Submit Barcode
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative h-full">
              {error ? (
                <div className="flex flex-col items-center justify-center h-full p-6 bg-gray-900">
                  <div className="text-center">
                    <p className="text-red-400 text-lg mb-4">{error}</p>
                    <Button onClick={initializeScanner}>Try Again</Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Video */}
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover pointer-events-none"
                    playsInline
                    muted
                  />

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

        {/* Right: List */}
        <div className="w-80 bg-gray-800 border-l border-gray-600 flex flex-col relative z-[2147483647] pointer-events-auto">
          <div className="p-4 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{currentScanningLine}</h3>
                <p className="text-sm text-gray-300">Scanned Rolls</p>
              </div>
              {onDone && (
                <Button type="button" onClick={handleDoneClick} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 text-sm">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Done
                </Button>
              )}
            </div>
          </div>

          <div className="p-4 border-b border-gray-600 bg-gray-750">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-400">{scannedRolls.length}</div>
                <div className="text-xs text-gray-400">Total Rolls</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">
                  {(
                    scannedRolls.reduce((s, r) => {
                      const v = quantityMetric === 'length' ? (Number(r.length) || 0) : (Number(r.weight) || 0);
                      return s + v;
                    }, 0)
                  ).toFixed(1)}{unitLabel}
                </div>
                <div className="text-xs text-gray-400">Total {unitLabel}</div>
              </div>
            </div>
          </div>

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
                  <div key={`${roll.barcode}-${index}`} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{roll.barcode}</div>
                        <div className="text-xs text-gray-400">Roll #{index + 1}</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-right">
                          <div className="text-sm font-semibold text-green-400">
                            {quantityMetric === 'length' ? (roll.length ?? 0) : (roll.weight ?? 0)}{unitLabel}
                          </div>
                        </div>
                        {onRemoveRoll && (
                          <Button
                            onClick={() => {
                              const qty = quantityMetric === 'length' ? (roll.length ?? 0) : (roll.weight ?? 0);
                              if (confirm(`Remove roll ${roll.barcode} (${qty}${unitLabel})?`)) onRemoveRoll(roll.barcode);
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

      {/* Overlay Content (weight/width form, etc.) */}
      {children}

      {/* Bottom Controls */}
      <div className="p-4 bg-black/80 space-y-4">
        <div className="flex space-x-2">
          <Button onClick={switchToCamera} variant={!showManualEntry ? 'default' : 'outline'} className="flex-1 py-3">
            <QrCode className="h-5 w-5 mr-2" />
            Camera
          </Button>
          <Button onClick={switchToManual} variant={showManualEntry ? 'default' : 'outline'} className="flex-1 py-3">
            <Keyboard className="h-5 w-5 mr-2" />
            Manual
          </Button>
        </div>

        {!showManualEntry && (
          <div className="flex justify-center space-x-4">
            {hasFlash && (
              <Button onClick={toggleFlash} variant="outline" size="lg" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                {flashOn ? <FlashlightOff className="h-6 w-6" /> : <Flashlight className="h-6 w-6" />}
              </Button>
            )}
          </div>
        )}

        <div className="text-center">
          <p className="text-gray-300 text-sm">
            {showManualEntry
              ? 'Type your barcode manually or switch to camera mode'
              : (autoPauseOnScan
                  ? 'Scanner pauses after each scan so you can enter weight/width'
                  : 'Scanner stays open - scan multiple barcodes consecutively')}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
});

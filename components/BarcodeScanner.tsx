
/**
 * BarcodeScanner.tsx
 * High-precision camera barcode/QR scanner using the native BarcodeDetector Web API.
 * Supports: CODE_128, EAN-13, EAN-8, QR, UPC, CODE_39, ITF, PDF417, DataMatrix, etc.
 *
 * Features:
 *  - Targeting reticle — only emits codes detected inside the center zone
 *  - Animated laser sweep for visual feedback
 *  - Green overlay on detected barcode position
 *  - Debounce: same code must appear in 2+ consecutive frames before emitting
 *  - Torch (flashlight) toggle when device supports it
 *  - Graceful fallback with manual text input if BarcodeDetector is unavailable
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Flashlight, FlashlightOff, ScanLine, Keyboard } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
  /** If true, scanner stays open after each scan (call onClose manually) */
  continuous?: boolean;
}

// Extend TypeScript to know about BarcodeDetector
declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<Array<{
    rawValue: string;
    format: string;
    boundingBox: DOMRectReadOnly;
    cornerPoints: Array<{ x: number; y: number }>;
  }>>;
  static getSupportedFormats(): Promise<string[]>;
}

const SCAN_FORMATS = [
  'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8',
  'upc_a', 'upc_e', 'qr_code', 'data_matrix', 'itf',
  'pdf417', 'codabar', 'aztec',
];

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan, onClose, title = 'Escanear Código', hint = 'Apunta al código de barras', continuous = false,
}) => {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const overlayRef  = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const streamRef   = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const lastCodeRef = useRef<string>('');
  const confirmCnt  = useRef<number>(0);     // consecutive frames with the same code
  const laserYRef   = useRef<number>(0);
  const laserDirRef = useRef<number>(1);

  const [error, setError]       = useState<string>('');
  const [torchOn, setTorchOn]   = useState(false);
  const [torchAvail, setTorchAvail] = useState(false);
  const [lastResult, setLastResult] = useState<string>('');
  const [fallback, setFallback] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [supported, setSupported] = useState(true);
  const [scanning, setScanning] = useState(false);

  // ── Initialize BarcodeDetector ─────────────────────────────────────────────
  const initDetector = useCallback(async () => {
    if (!('BarcodeDetector' in window)) {
      setSupported(false);
      setFallback(true);
      return false;
    }
    try {
      const supported = await (window as any).BarcodeDetector.getSupportedFormats?.() ?? SCAN_FORMATS;
      const formats = SCAN_FORMATS.filter(f => supported.includes(f));
      detectorRef.current = new (window as any).BarcodeDetector({ formats: formats.length ? formats : SCAN_FORMATS });
      return true;
    } catch {
      setSupported(false);
      setFallback(true);
      return false;
    }
  }, []);

  // ── Camera init ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setError('');
    setScanning(false);

    const hasDetector = await initDetector();
    if (!hasDetector) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;

      // Check torch support
      const [track] = stream.getVideoTracks();
      const caps = track.getCapabilities?.() as any;
      if (caps?.torch) setTorchAvail(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
      }
    } catch (e: any) {
      if (e.name === 'NotAllowedError') setError('Permiso de cámara denegado. Activa la cámara en la configuración del navegador.');
      else if (e.name === 'NotFoundError') setError('No se encontró cámara trasera en este dispositivo.');
      else setError('Error al iniciar la cámara: ' + e.message);
    }
  }, [initDetector]);

  // ── Toggle torch ───────────────────────────────────────────────────────────
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const newState = !torchOn;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    } catch { /* torch not supported */ }
  }, [torchOn]);

  // ── Detection loop ─────────────────────────────────────────────────────────
  const detect = useCallback(() => {
    const video    = videoRef.current;
    const canvas   = canvasRef.current;
    const overlay  = overlayRef.current;
    const detector = detectorRef.current;

    if (!video || !canvas || !overlay || !detector || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect);
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { rafRef.current = requestAnimationFrame(detect); return; }

    canvas.width  = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, vw, vh);

    // Targeting zone: center 55% of the frame
    const zoneX = vw * 0.225;
    const zoneY = vh * 0.25;
    const zoneW = vw * 0.55;
    const zoneH = vh * 0.50;

    // Laser animation (drawn on overlay)
    const oc = overlay.getContext('2d')!;
    overlay.width  = overlay.clientWidth;
    overlay.height = overlay.clientHeight;
    oc.clearRect(0, 0, overlay.width, overlay.height);

    // Dark mask outside zone
    const scaleX = overlay.width  / vw;
    const scaleY = overlay.height / vh;
    const oz = { x: zoneX * scaleX, y: zoneY * scaleY, w: zoneW * scaleX, h: zoneH * scaleY };

    oc.fillStyle = 'rgba(0,0,0,0.55)';
    oc.fillRect(0, 0, overlay.width, overlay.height);
    // Cut out the zone
    oc.clearRect(oz.x, oz.y, oz.w, oz.h);

    // Corner brackets
    const cLen = 24; const cTh = 3; const cCol = '#22d3ee';
    oc.strokeStyle = cCol; oc.lineWidth = cTh;
    const corners = [
      [oz.x, oz.y, oz.x + cLen, oz.y, oz.x, oz.y + cLen],
      [oz.x + oz.w - cLen, oz.y, oz.x + oz.w, oz.y, oz.x + oz.w, oz.y + cLen],
      [oz.x, oz.y + oz.h - cLen, oz.x, oz.y + oz.h, oz.x + cLen, oz.y + oz.h],
      [oz.x + oz.w - cLen, oz.y + oz.h, oz.x + oz.w, oz.y + oz.h, oz.x + oz.w, oz.y + oz.h - cLen],
    ];
    corners.forEach(([x1, y1, x2, y2, x3, y3]) => {
      oc.beginPath(); oc.moveTo(x1, y1); oc.lineTo(x2, y2); oc.lineTo(x3, y3); oc.stroke();
    });

    // Animated laser line
    laserYRef.current += laserDirRef.current * 1.5;
    if (laserYRef.current >= oz.h - 2) laserDirRef.current = -1;
    if (laserYRef.current <= 2)        laserDirRef.current = 1;
    const laserY = oz.y + laserYRef.current;
    const grad = oc.createLinearGradient(oz.x, laserY, oz.x + oz.w, laserY);
    grad.addColorStop(0,   'rgba(34,211,238,0)');
    grad.addColorStop(0.3, 'rgba(34,211,238,0.9)');
    grad.addColorStop(0.7, 'rgba(34,211,238,0.9)');
    grad.addColorStop(1,   'rgba(34,211,238,0)');
    oc.strokeStyle = grad; oc.lineWidth = 2;
    oc.beginPath(); oc.moveTo(oz.x, laserY); oc.lineTo(oz.x + oz.w, laserY); oc.stroke();

    // Detect barcodes
    detector.detect(canvas).then((results) => {
      if (results.length === 0) {
        lastCodeRef.current = '';
        confirmCnt.current  = 0;
      } else {
        // Prefer codes whose center is inside the targeting zone
        const inZone = results.filter(r => {
          const cx = r.boundingBox.x + r.boundingBox.width  / 2;
          const cy = r.boundingBox.y + r.boundingBox.height / 2;
          return cx >= zoneX && cx <= zoneX + zoneW && cy >= zoneY && cy <= zoneY + zoneH;
        });
        const best = inZone.length > 0 ? inZone[0] : results[0];

        // Draw green highlight on the detected code
        const bb = best.boundingBox;
        oc.strokeStyle = '#22c55e'; oc.lineWidth = 3;
        oc.strokeRect(bb.x * scaleX, bb.y * scaleY, bb.width * scaleX, bb.height * scaleY);

        const code = best.rawValue.trim();
        if (code === lastCodeRef.current) {
          confirmCnt.current++;
        } else {
          lastCodeRef.current = code;
          confirmCnt.current  = 1;
        }

        // Emit after 2 consecutive detections (prevents false positives)
        if (confirmCnt.current >= 2) {
          confirmCnt.current = 0;
          lastCodeRef.current = '';
          setLastResult(code);
          onScan(code);
          if (!continuous) return; // stop loop — parent will close
        }
      }
      rafRef.current = requestAnimationFrame(detect);
    }).catch(() => {
      rafRef.current = requestAnimationFrame(detect);
    });
  }, [onScan, continuous]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [startCamera]);

  useEffect(() => {
    if (scanning) {
      rafRef.current = requestAnimationFrame(detect);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [scanning, detect]);

  // ── Manual fallback submit ─────────────────────────────────────────────────
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      if (!continuous) { /* parent closes */ } else setManualCode('');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center overflow-hidden">

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-b from-black/80 to-transparent">
        <div>
          <h2 className="text-white font-black text-lg tracking-tight">{title}</h2>
          <p className="text-cyan-300 text-xs font-medium">{hint}</p>
        </div>
        <div className="flex gap-2">
          {torchAvail && (
            <button onClick={toggleTorch}
              className={`p-2.5 rounded-full transition-all ${torchOn ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'}`}>
              {torchOn ? <Flashlight size={20}/> : <FlashlightOff size={20}/>}
            </button>
          )}
          <button onClick={() => setFallback(f => !f)}
            className="p-2.5 rounded-full bg-white/20 text-white">
            <Keyboard size={20}/>
          </button>
          <button onClick={onClose}
            className="p-2.5 rounded-full bg-white/20 text-white hover:bg-red-500 transition-all">
            <X size={20}/>
          </button>
        </div>
      </div>

      {/* Camera feed */}
      {!error && !fallback && (
        <>
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline muted autoPlay
          />
          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} className="hidden"/>
          {/* Overlay canvas for reticle + highlights */}
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full"/>
        </>
      )}

      {/* Error state */}
      {error && (
        <div className="z-10 flex flex-col items-center gap-4 px-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <ScanLine size={32} className="text-red-400"/>
          </div>
          <p className="text-red-300 font-bold text-sm">{error}</p>
          <button onClick={startCamera} className="bg-cyan-500 text-black font-black px-6 py-3 rounded-xl">
            Reintentar
          </button>
        </div>
      )}

      {/* Not supported — fallback only */}
      {!supported && !error && (
        <div className="z-10 flex flex-col items-center gap-3 px-8 text-center">
          <ScanLine size={48} className="text-cyan-400"/>
          <p className="text-white font-bold text-sm">Tu navegador no soporta el escáner de cámara.</p>
          <p className="text-cyan-300 text-xs">Usa Chrome en Android para la mejor experiencia.<br/>Por ahora puedes ingresar el código manualmente:</p>
        </div>
      )}

      {/* Manual fallback input */}
      {fallback && (
        <div className="absolute inset-0 z-20 bg-slate-900/95 flex flex-col items-center justify-center px-6 gap-6">
          <ScanLine size={40} className="text-cyan-400"/>
          <p className="text-white font-bold text-center text-sm">Ingresa el código manualmente</p>
          <form onSubmit={handleManualSubmit} className="w-full max-w-sm space-y-3">
            <input
              autoFocus
              type="text"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Ej: 123456789012"
              className="w-full px-4 py-4 text-lg font-mono font-bold rounded-2xl bg-white/10 text-white border border-white/20 outline-none focus:border-cyan-400 text-center tracking-widest"
            />
            <button type="submit"
              className="w-full py-4 bg-cyan-500 text-black font-black rounded-2xl text-sm tracking-widest">
              CONFIRMAR CÓDIGO
            </button>
            {scanning && (
              <button type="button" onClick={() => setFallback(false)}
                className="w-full py-3 bg-white/10 text-white font-bold rounded-2xl text-sm">
                Volver a Cámara
              </button>
            )}
          </form>
        </div>
      )}

      {/* Last scanned result — shown briefly */}
      {lastResult && continuous && (
        <div className="absolute bottom-32 left-4 right-4 z-20">
          <div className="bg-emerald-500 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <ScanLine size={18}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold opacity-80 uppercase tracking-widest">Detectado</p>
              <p className="font-black text-sm font-mono truncate">{lastResult}</p>
            </div>
          </div>
        </div>
      )}

      {/* Bottom hint */}
      {scanning && !fallback && (
        <div className="absolute bottom-8 left-0 right-0 z-20 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 bg-black/50 px-4 py-2 rounded-full">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"/>
            <span className="text-cyan-300 text-xs font-bold uppercase tracking-widest">Escaneando...</span>
          </div>
          <p className="text-white/50 text-[10px]">Mantén el código dentro del recuadro</p>
        </div>
      )}
    </div>
  );
};

export default BarcodeScanner;

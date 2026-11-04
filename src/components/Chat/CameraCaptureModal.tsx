import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RotateCcw, Send, RefreshCw, AlertCircle } from 'lucide-react';
import { compressImage } from '../../utils/image';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapturePhoto: (photoBase64: string) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapturePhoto,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileFallbackRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && !capturedPhoto) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, capturedPhoto]);

  const startCamera = async () => {
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Câmera não suportada neste navegador. Você pode usar a câmera nativa do aparelho.');
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: unknown) {
      console.warn('Camera access failed, falling back to device capture', err);
      setCameraError('Não foi possível acessar a câmera diretamente. Clique abaixo para abrir a câmera do seu celular.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const handleTakePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const maxDim = 1024;
    let w = video.videoWidth || 640;
    let h = video.videoHeight || 480;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, w, h);
      const photoData = canvas.toDataURL('image/jpeg', 0.72);
      setCapturedPhoto(photoData);
      stopCamera();
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
  };

  const handleSendPhoto = () => {
    if (capturedPhoto) {
      onCapturePhoto(capturedPhoto);
      onClose();
      setCapturedPhoto(null);
    }
  };

  const handleNativeCameraFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, 1024, 1024, 0.72);
      setCapturedPhoto(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setCapturedPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900/90 text-white border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Tirar Foto Agora</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative bg-black aspect-4/3 flex items-center justify-center overflow-hidden">
          {capturedPhoto ? (
            /* Snapped preview */
            <img
              src={capturedPhoto}
              alt="Foto tirada"
              className="w-full h-full object-cover"
            />
          ) : cameraError ? (
            /* Error & Fallback button */
            <div className="p-6 text-center text-white space-y-4 max-w-xs">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-300">{cameraError}</p>
              <input
                ref={fileFallbackRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleNativeCameraFallback}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileFallbackRef.current?.click()}
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Abrir Câmera do Celular</span>
              </button>
            </div>
          ) : (
            /* Live Camera Stream */
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Switch camera button */}
              <button
                type="button"
                onClick={() => setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
                title="Trocar câmera"
                className="absolute top-4 right-4 p-2.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition backdrop-blur-xs cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          {capturedPhoto ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition inline-flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Tirar Outra</span>
              </button>

              <button
                type="button"
                onClick={handleSendPhoto}
                className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition inline-flex items-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Foto</span>
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-center">
              <button
                type="button"
                disabled={Boolean(cameraError)}
                onClick={handleTakePhoto}
                title="Tirar Foto"
                className="w-16 h-16 rounded-full border-4 border-white/80 bg-blue-600 hover:bg-blue-500 active:scale-95 transition flex items-center justify-center text-white shadow-lg cursor-pointer disabled:opacity-40"
              >
                <Camera className="w-7 h-7" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

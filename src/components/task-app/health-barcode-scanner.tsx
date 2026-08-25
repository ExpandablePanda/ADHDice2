"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

type HealthBarcodeScannerProps = {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
};

export function HealthBarcodeScanner({ isOpen, onClose, onDetected }: HealthBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState("");
  const [support, setSupport] = useState<"checking" | "ready" | "unsupported">("checking");

  useEffect(() => {
    onCloseRef.current = onClose;
    onDetectedRef.current = onDetected;
  }, [onClose, onDetected]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      const detector = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      const hasCamera = !!navigator.mediaDevices?.getUserMedia;
      setSupport(detector && hasCamera ? "ready" : "unsupported");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!isOpen || support !== "ready") {
      return;
    }

    const detectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    const video = videoRef.current;
    if (!detectorCtor || !video || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera barcode scanning is not supported in this browser.");
      return;
    }
    const videoElement = video;

    const detector = new detectorCtor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    let stream: MediaStream | null = null;
    let cancelled = false;
    let frameId = 0;

    const stopCamera = () => {
      cancelled = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
      if (videoElement.srcObject) {
        const mediaStream = videoElement.srcObject as MediaStream;
        mediaStream.getTracks().forEach((track) => track.stop());
        videoElement.srcObject = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
    };

    async function startScanner() {
      try {
        setError("");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stopCamera();
          return;
        }
        videoElement.srcObject = stream;
        await videoElement.play();

        const scanFrame = async () => {
          if (cancelled) {
            return;
          }
          try {
            const barcodes = await detector.detect(videoElement);
            const firstCode = barcodes.find((entry) => typeof entry.rawValue === "string" && entry.rawValue.trim().length > 0)?.rawValue?.trim();
            if (firstCode) {
              stopCamera();
              onCloseRef.current();
              onDetectedRef.current(firstCode);
              return;
            }
          } catch {
            setError("Camera is open, but a barcode has not been detected yet.");
          }
          if (!cancelled) {
            frameId = window.requestAnimationFrame(() => {
              void scanFrame();
            });
          }
        };

        await scanFrame();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to start the camera scanner.");
      }
    }

    void startScanner();

    return () => {
      stopCamera();
    };
  }, [isOpen, support]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="grid gap-2 rounded-[1rem] border border-[#dfe6fb] bg-white/90 p-3 dark:border-white/10 dark:bg-white/[0.05]">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#26324f] dark:text-white"><Camera aria-hidden="true" className="h-3.5 w-3.5" />Scan barcode</p>
        <button
          aria-label="Close barcode scanner"
          className="rounded-full bg-[#fff1f3] p-1.5 text-[#d64b5f] dark:bg-[#44232f] dark:text-[#ff9eaf]"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      {support === "unsupported" ? (
        <p className="text-xs text-[#73809c] dark:text-white/50">Camera barcode scanning is not available in this browser.</p>
      ) : (
        <>
          <video
            aria-label="Barcode camera preview"
            className="max-h-48 min-h-24 w-full overflow-hidden rounded-[0.9rem] border border-[#e5e9f7] bg-[#111827] object-cover dark:border-white/10"
            muted
            playsInline
            ref={videoRef}
          />
          <p className="text-xs text-[#73809c] dark:text-white/50">Point the rear camera at a UPC or EAN barcode.</p>
        </>
      )}
      {error ? <p aria-live="polite" className="text-xs text-[#a25b50] dark:text-[#ffb3a9]" role="status">{error}</p> : null}
    </div>
  );
}

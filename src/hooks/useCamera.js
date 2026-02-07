import { useState, useRef, useCallback, useEffect } from 'react';

export function useCamera() {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const videoRef = useRef(null);

  const start = useCallback(async (facingMode = 'environment') => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode === 'user' ? 'user' : 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setStream(mediaStream);
      setReady(true);
      return mediaStream;
    } catch (err) {
      let message = err.name === 'NotAllowedError'
        ? 'Camera access was denied. Click the lock/info icon in the address bar and allow Camera.'
        : err.name === 'NotFoundError'
          ? 'No camera found.'
          : err.name === 'SecurityError' || err.name === 'NotSupportedError'
            ? 'Camera only works on secure context. Use http://localhost:5174 or http://127.0.0.1:5174 (not your network IP).'
            : err.message || 'Could not access camera.';
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        message = 'Camera requires a secure context. Open http://localhost:5174 or http://127.0.0.1:5174 in the address bar (do not use your computer\'s IP like 192.168.x.x).';
      }
      setError(message);
      setReady(false);
      return null;
    }
  }, []);

  const stop = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setReady(false);
    }
  }, [stream]);

  useEffect(() => {
    if (stream && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  return { videoRef, start, stop, stream, error, ready };
}

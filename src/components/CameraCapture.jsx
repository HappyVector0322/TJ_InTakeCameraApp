import React, { useRef, useCallback, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { captureCoveredScreenshot, cropScreenshotToOverlay } from '../utils/captureCoveredScreenshot';
import { processForOCR, processCroppedForOCR, normalizeOrientationForOCR } from '../utils/imageProcessor';
import styles from './CameraCapture.module.css';

const videoConstraints = {
  facingMode: 'environment',
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

/**
 * Frame type for overlay: license (2:1) or vin (6:1).
 * Matches 99workflow EnhancedCamera – different sizes/cropping for LIC vs VIN.
 */
function getFrameClass(stepId) {
  if (stepId === 'license') return styles.frameLicense;
  if (stepId === 'vin') return styles.frameVin;
  return null;
}

export function CameraCapture({ onCapture, onSkip, onBack, onNext, step, optional }) {
  const webcamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [flash, setFlash] = useState(false);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270 (degrees clockwise)
  const [capturedPreview, setCapturedPreview] = useState(null);
  const [capturing, setCapturing] = useState(false);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.2;

  /** Toggle between two states only: bottom (0° horizontal) and right side (-90° vertical). */
  const handleRotate = useCallback(() => {
    setRotation((r) => (r === 0 ? -90 : 0));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setFlash(false);
  }, []);

  const handleUserMedia = useCallback(() => {
    setReady(true);
    setError(null);
  }, []);

  const handleUserMediaError = useCallback((err) => {
    setReady(false);
    if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
      setError('Camera access was denied. Use the lock icon in the address bar to allow Camera.');
    } else if (err?.name === 'NotFoundError') {
      setError('No camera found.');
    } else {
      setError(err?.message || 'Could not access camera. Use http://localhost:3000 or http://127.0.0.1:3000');
    }
  }, []);

  // Torch control — robust for Android/Samsung (e.g. Galaxy Xcover Pro)
  const torchTrackRef = useRef(null);
  useEffect(() => {
    if (!flash) {
      const turnOff = (track) => {
        if (!track?.getCapabilities?.()?.torch) return;
        track.applyConstraints({ torch: false }).catch(() => {});
        track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      };
      if (torchTrackRef.current) {
        turnOff(torchTrackRef.current);
        torchTrackRef.current = null;
      }
      return;
    }
    if (!ready) return;

    const applyTorch = (track, on) => {
      if (!track?.getCapabilities?.()?.torch) return false;
      const value = !!on;
      // Some Android/Samsung devices need the simple form first
      return track
        .applyConstraints({ torch: value })
        .then(() => true)
        .catch(() => track.applyConstraints({ advanced: [{ torch: value }] }).then(() => true))
        .catch(() => false);
    };

    const tryTorch = () => {
      const video = webcamRef.current?.video;
      const stream = video?.srcObject;
      const track = stream?.getVideoTracks?.()?.[0];
      if (!track) return;
      torchTrackRef.current = track;
      applyTorch(track, true);
    };

    tryTorch();
    // Retry after a short delay — on some devices (e.g. Samsung Xcover Pro) srcObject isn't ready immediately
    const t = setTimeout(tryTorch, 200);

    return () => {
      clearTimeout(t);
      const track = torchTrackRef.current;
      if (track?.getCapabilities?.()?.torch) {
        track.applyConstraints({ torch: false }).catch(() => {});
        track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      }
      torchTrackRef.current = null;
    };
  }, [ready, flash]);

  const handleCapture = useCallback(async () => {
    if (!webcamRef.current?.video || !ready || capturing) return;
    setCapturing(true);
    try {
      // Same as 99workflow: take screenshot with NO rotation so overlay position matches.
      // When green box is rotated, we crop to the overlay's getBoundingClientRect() instead of rotating the screenshot.
      const dataUrl = await captureCoveredScreenshot(webcamRef.current.video, 0, zoom);
      if (step?.id === 'license' || step?.id === 'vin') {
        const overlay = document.querySelector('[data-testid="scanner-overlay"]');
        let cropped;
        if (overlay) {
          const croppedToBox = await cropScreenshotToOverlay(dataUrl, webcamRef.current.video, overlay, zoom);
          cropped = await processCroppedForOCR(croppedToBox, step.id);
        } else {
          cropped = await processForOCR(dataUrl, step.id);
        }
        const oriented = await normalizeOrientationForOCR(cropped, rotation);
        setCapturedPreview(oriented);
      } else {
        setCapturedPreview(dataUrl);
      }
    } catch (e) {
      const fallback = webcamRef.current.getScreenshot?.({ type: 'image/jpeg', quality: 0.92 });
      if (fallback) {
        if (step?.id === 'license' || step?.id === 'vin') {
          try {
            const cropped = await processForOCR(fallback, step.id);
            const oriented = await normalizeOrientationForOCR(cropped, rotation);
            setCapturedPreview(oriented);
          } catch (_) {
            setCapturedPreview(fallback);
          }
        } else {
          setCapturedPreview(fallback);
        }
      }
    } finally {
      setCapturing(false);
    }
  }, [ready, capturing, zoom, rotation, step?.id]);

  const handleConfirmPhoto = useCallback(() => {
    if (capturedPreview) {
      onCapture(capturedPreview);
      setCapturedPreview(null);
    }
  }, [capturedPreview, onCapture]);

  const handleRetake = useCallback(() => {
    setCapturedPreview(null);
  }, []);

  const showPreview = !!capturedPreview;

  return (
    <div className={styles.wrapper}>
      {/* Camera stays mounted so returning from confirm (Retake) is instant – no re-init. Hidden when overlay is shown. */}
      <div
        className={showPreview ? styles.cameraSectionHidden : styles.cameraSection}
        aria-hidden={showPreview}
      >
      {/* Camera image screen box: the dark rectangle showing the live feed + green frame (nothing else) */}
      <div className={styles.videoWrap} data-camera-image-box aria-label="Camera view">
        <div className={styles.videoRotateWrap}>
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            onUserMedia={handleUserMedia}
            onUserMediaError={handleUserMediaError}
            className={styles.video}
            style={{ transform: `scale(${zoom})` }}
            playsInline
            mirrored={false}
          />
        </div>
        {/* Green frame (overlay) rotates like TJ_99glide; video stays fixed; capture applies rotation to output */}
        {(step?.id === 'license' || step?.id === 'vin') && getFrameClass(step?.id) && (
          <div
            data-testid="scanner-overlay"
            className={`${styles.frameOverlay} ${getFrameClass(step?.id)}`}
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <div className={styles.scanLine} aria-hidden="true" />
            <div className={styles.cornerGuide} data-position="top-left" />
            <div className={styles.cornerGuide} data-position="top-right" />
            <div className={styles.cornerGuide} data-position="bottom-left" />
            <div className={styles.cornerGuide} data-position="bottom-right" />
          </div>
        )}
      </div>
      {/* Hint text is outside the green box so it doesn’t overlap the capture area */}
      {(step?.id === 'license' || step?.id === 'vin') && (
        <p className={styles.controlHint}>
          {step?.hint || (step?.id === 'license' ? 'Align license plate in frame' : 'Position the VIN inside the green frame')}
        </p>
      )}
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z - ZOOM_STEP)))}
          disabled={!ready}
          aria-label="Zoom out"
        >
          −
        </button>
        <input
          type="range"
          className={styles.zoomSlider}
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(e) => setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(e.target.value))))}
          disabled={!ready}
          aria-label="Zoom"
        />
        <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + ZOOM_STEP)))}
          disabled={!ready}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className={`${styles.controlBtn} ${flash ? styles.controlBtnActive : ''}`}
          onClick={() => setFlash((f) => !f)}
          disabled={!ready}
          aria-label={flash ? 'Flash off' : 'Flash on'}
        >
          Flash
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={handleRotate}
          aria-label="Rotate frame 90°"
        >
          Rotate
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={handleReset}
          disabled={!ready}
          aria-label="Reset zoom, rotation and flash"
        >
          Reset
        </button>
      </div>
      <div className={styles.actions}>
        {onBack ? (
          <button type="button" className={styles.navIconBtn} onClick={onBack} aria-label="Previous">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
        ) : (
          <span className={styles.navIconBtnPlaceholder} />
        )}
        <button
          type="button"
          className={styles.captureBtn}
          onClick={handleCapture}
          disabled={!ready || capturing}
        >
          {capturing ? 'Capturing…' : 'Capture'}
        </button>
        {onNext ? (
          <button type="button" className={styles.navIconBtn} onClick={onNext} aria-label="Next">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        ) : (
          <span className={styles.navIconBtnPlaceholder} />
        )}
      </div>
      </div>

      {/* Confirm overlay: keep camera mounted underneath so Retake returns instantly */}
      {showPreview && (
        <div className={styles.previewOverlay}>
          <p className={styles.previewHeading}>Cropped image</p>
          <div className={styles.previewWrap} aria-label="Cropped capture preview">
            <img src={capturedPreview} alt="Cropped capture" className={styles.previewImg} />
          </div>
          <p className={styles.previewLabel}>
            {step?.id === 'license'
              ? 'We\'ll read the license plate from this photo. Look good?'
              : step?.id === 'vin'
              ? 'We\'ll read the VIN from this photo. Look good?'
              : 'Look good?'}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.retakeBtn} onClick={handleRetake}>
              Retake
            </button>
            <button type="button" className={styles.captureBtn} onClick={handleConfirmPhoto}>
              Use photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

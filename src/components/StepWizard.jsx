import React from 'react';
import { STEPS } from '../steps';
import { CameraCapture } from './CameraCapture';
import styles from './StepWizard.module.css';

export function StepWizard({ stepIndex, photos, onPhoto, onSkip, onNext, onBack, reCapturingVIN, onReCaptureComplete }) {
  const step = STEPS[stepIndex];
  if (!step) return null;

  const handleCapture = (dataUrl) => {
    if (reCapturingVIN && step.id === 'vin' && onReCaptureComplete) {
      onReCaptureComplete(step.id, dataUrl);
      return;
    }
    onPhoto(step.id, dataUrl);
    onNext();
  };

  const handleSkip = () => {
    if (reCapturingVIN && step.id === 'vin' && onReCaptureComplete) {
      onReCaptureComplete(step.id, null);
      return;
    }
    onPhoto(step.id, null);
    onNext();
  };

  const isReCapturingVIN = reCapturingVIN && step.id === 'vin';

  return (
    <div className={styles.wizard}>
      <div className={styles.header}>
        <span className={styles.stepNum}>{isReCapturingVIN ? 'Re-capture VIN' : `Step ${stepIndex + 1} of ${STEPS.length}`}</span>
        <h1 className={styles.title}>{isReCapturingVIN ? 'VIN' : step.title}</h1>
        <p className={styles.desc}>{isReCapturingVIN ? 'Take a new picture of the VIN. You\'ll return to review after capturing.' : step.description}</p>
      </div>
      <div className={styles.cameraArea}>
        <CameraCapture
          step={step}
          onCapture={handleCapture}
          onSkip={handleSkip}
          optional={step.optional}
          onBack={reCapturingVIN || stepIndex > 0 ? onBack : undefined}
          onNext={handleSkip}
        />
      </div>
    </div>
  );
}

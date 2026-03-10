import React, { useState, useEffect } from 'react';
import { STEPS } from '../steps';
import { CameraCapture } from './CameraCapture';
import styles from './StepWizard.module.css';

export function StepWizard({ stepIndex, photos, onPhoto, onSkip, onNext, onBack, reCapturingVIN, onReCaptureComplete, onIntakeChange, intake }) {
  const step = STEPS[stepIndex];
  const [selectedUnitType, setSelectedUnitType] = useState('Truck');

  // Sync selection with intake when on unitType step (e.g. when user navigates back)
  useEffect(() => {
    if (step?.id === 'unitType' && intake?.unitType) {
      setSelectedUnitType(intake.unitType);
    }
  }, [step?.id, intake?.unitType]);

  if (!step) return null;

  const handleCapture = (dataUrl) => {
    if (reCapturingVIN && step.id === 'vin' && onReCaptureComplete) {
      onReCaptureComplete(step.id, dataUrl);
      return;
    }
    onPhoto(step.id, dataUrl);
    onNext(dataUrl);
  };

  const handleSkip = () => {
    if (reCapturingVIN && step.id === 'vin' && onReCaptureComplete) {
      onReCaptureComplete(step.id, null);
      return;
    }
    onPhoto(step.id, null);
    onNext(null);
  };

  const isReCapturingVIN = reCapturingVIN && step.id === 'vin';

  // Non-camera selection step (e.g. unitType)
  if (step.noCamera) {
    return (
      <div className={styles.wizard}>
        <div className={styles.header}>
          <span className={styles.stepNum}>{`Step ${stepIndex + 1} of ${STEPS.length}`}</span>
          <h1 className={styles.title}>{step.title}</h1>
          <p className={styles.desc}>{step.description}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0', flex: 1 }}>
          {step.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => {
                setSelectedUnitType(choice);
                if (onIntakeChange) onIntakeChange(step.field, choice);
              }}
              style={{
                padding: '18px 24px',
                fontSize: 17,
                fontWeight: 600,
                borderRadius: 12,
                border: selectedUnitType === choice ? '2px solid var(--accent)' : '2px solid var(--border)',
                background: selectedUnitType === choice ? 'var(--accent)' : 'var(--surface)',
                color: selectedUnitType === choice ? '#fff' : 'var(--text)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {choice}
            </button>
          ))}
        </div>
        <div className={styles.unitTypeActions}>
          {stepIndex > 0 ? (
            <button type="button" className={styles.navIconBtn} onClick={onBack} aria-label="Previous">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
          ) : (
            <span className={styles.navIconBtnPlaceholder} />
          )}
          <button type="button" className={styles.captureBtn} onClick={() => onNext(selectedUnitType)}>
            Next
          </button>
          <span className={styles.navIconBtnPlaceholder} />
        </div>
      </div>
    );
  }

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

import React from 'react';
import { STEPS } from '../steps';
import { CameraCapture } from './CameraCapture';
import styles from './StepWizard.module.css';

export function StepWizard({ stepIndex, photos, onPhoto, onSkip, onNext, onBack }) {
  const step = STEPS[stepIndex];
  if (!step) return null;

  const handleCapture = (dataUrl) => {
    onPhoto(step.id, dataUrl);
    onNext();
  };

  const handleSkip = () => {
    onPhoto(step.id, null);
    onNext();
  };

  return (
    <div className={styles.wizard}>
      <div className={styles.header}>
        <span className={styles.stepNum}>Step {stepIndex + 1} of {STEPS.length}</span>
        <h1 className={styles.title}>{step.title}</h1>
        <p className={styles.desc}>{step.description}</p>
      </div>
      <div className={styles.cameraArea}>
        <CameraCapture
          step={step}
          onCapture={handleCapture}
          onSkip={handleSkip}
          optional={step.optional}
          onBack={stepIndex > 0 ? onBack : undefined}
          onNext={handleSkip}
        />
      </div>
    </div>
  );
}

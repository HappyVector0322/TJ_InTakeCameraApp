import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import CloseIcon from '@mui/icons-material/Close';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import styles from './IntakeReview.module.css';
import { getCustomersList } from '../api/client';

const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY',
];

const CARRIER_ID_TYPES = [
  { value: 'dot', label: 'DOT#' },
  { value: 'ca', label: 'CA#' },
  { value: 'mc', label: 'MC#' },
];

function FieldImage({ src, alt, onOpenFullScreen }) {
  if (!src) return null;
  return (
    <Box
      className={styles.fieldImageWrap}
      onClick={() => onOpenFullScreen && onOpenFullScreen(src, alt)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpenFullScreen?.(src, alt)}
      aria-label={`View ${alt} full screen`}
    >
      <img src={src} alt={alt} className={styles.fieldImage} draggable={false} />
    </Box>
  );
}

function FullScreenImageViewer({ open, src, alt, onClose }) {
  const [rotation, setRotation] = useState(0);
  const touchStart = React.useRef({ y: 0, fingers: 0, onZoomArea: false });

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleTouchStart = (e) => {
    const target = e.target;
    const onZoomArea = !!target?.closest?.('[data-zoom-area]');
    touchStart.current = {
      y: e.touches?.[0]?.clientY ?? 0,
      fingers: e.touches?.length ?? 0,
      onZoomArea,
    };
  };

  const handleTouchEnd = (e) => {
    const touch = e.changedTouches?.[0];
    if (!touch || touchStart.current.fingers !== 1) return;
    if (touchStart.current.onZoomArea) return;
    const deltaY = touch.clientY - touchStart.current.y;
    if (deltaY > 80) onClose();
  };

  useEffect(() => {
    if (open) {
      const html = document.documentElement;
      const body = document.body;
      html.style.overflow = 'hidden';
      html.style.height = '100%';
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = '0';
      body.style.left = '0';
      body.style.right = '0';
      body.style.bottom = '0';
      body.style.width = '100%';
      body.style.height = '100%';
      body.style.touchAction = 'none';
      body.style.overscrollBehavior = 'none';
    }
    return () => {
      const html = document.documentElement;
      const body = document.body;
      html.style.overflow = '';
      html.style.height = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.bottom = '';
      body.style.width = '';
      body.style.height = '';
      body.style.touchAction = '';
      body.style.overscrollBehavior = '';
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const content = (
    <div
      className={styles.fullScreenOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={styles.fullScreenBackdrop}
        aria-hidden="true"
      />
      <Box className={styles.fullScreenControls} onClick={(e) => e.stopPropagation()}>
        <IconButton
          onClick={handleRotate}
          className={styles.fullScreenControlBtn}
          aria-label="Rotate"
        >
          <RotateRightIcon />
        </IconButton>
        <IconButton
          onClick={onClose}
          className={styles.fullScreenControlBtn}
          aria-label="Close"
        >
          <CloseIcon />
        </IconButton>
      </Box>
      <div className={styles.fullScreenContent} onClick={(e) => e.stopPropagation()}>
        <div data-zoom-area style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={8}
          centerOnInit
          wheel={{ step: 0.2 }}
          pinch={{ step: 5 }}
          doubleClick={{ mode: 'toggle' }}
        >
          <TransformComponent
            contentStyle={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              minWidth: '100%',
              minHeight: '100%',
            }}
          >
            <Box
              sx={{
                transform: `rotate(${rotation}deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                bgcolor: 'transparent',
              }}
            >
              <img
                src={src}
                alt={alt}
                draggable={false}
                className={styles.fullScreenImage}
              />
            </Box>
          </TransformComponent>
        </TransformWrapper>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}

export function IntakeReview({ data, photos = {}, onChange, onCreateIntake, creating, createError, onStartOver }) {
  const [customerOptions, setCustomerOptions] = useState([]);
  const [fullScreenImage, setFullScreenImage] = useState({ open: false, src: null, alt: '' });

  useEffect(() => {
    getCustomersList()
      .then((list) => setCustomerOptions(list))
      .catch(() => setCustomerOptions([]));
  }, []);

  const licenseRegionValue = data.licenseRegion
    ? { label: data.licenseRegion, code: data.licenseRegion }
    : null;

  const handleCustomerChange = (_, newValue) => {
    if (newValue && typeof newValue === 'object' && newValue.name) {
      onChange('companyName', newValue.name);
      if (newValue.carrierIdType) onChange('carrierIdType', newValue.carrierIdType);
      if (newValue.carrierIdNum != null) onChange('carrierIdNum', newValue.carrierIdNum || '');
    } else {
      onChange('companyName', typeof newValue === 'string' ? newValue : '');
    }
  };

  return (
    <Box className={styles.wrapper}>
      <Paper elevation={0} className={styles.card} sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
        <h1 className={styles.title}>Review intake</h1>
        <p className={styles.subtitle}>
          Edit any field if OCR was wrong, then create your job file.
        </p>
        {createError && <p className={styles.createError}>{createError}</p>}
        <Box
          component="form"
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!creating) onCreateIntake();
          }}
        >
          <Box className={styles.fieldWithImage}>
            <Autocomplete
              freeSolo
              options={customerOptions}
              getOptionLabel={(opt) => (opt && typeof opt === 'object' ? opt.name ?? '' : String(opt ?? ''))}
              inputValue={data.companyName ?? ''}
              onInputChange={(_, v) => onChange('companyName', v ?? '')}
              onChange={handleCustomerChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Company name"
                  placeholder="Choose or type customer name"
                  autoComplete="off"
                  size="medium"
                  sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                />
              )}
            />
            <FieldImage src={photos.company} alt="Company sign" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Box className={styles.fieldWithImage}>
            <Box className={styles.dotMcRow}>
              <TextField
                select
                label="Type"
                value={data.carrierIdType ?? 'dot'}
                onChange={(e) => onChange('carrierIdType', e.target.value)}
                sx={{ flex: '0 0 120px', '& .MuiInputBase-root': { borderRadius: 2 } }}
                size="medium"
              >
                {CARRIER_ID_TYPES.map(({ value, label }) => (
                  <MenuItem key={value} value={value}>{label}</MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                label="Number"
                value={data.carrierIdNum ?? ''}
                onChange={(e) => onChange('carrierIdNum', e.target.value)}
                placeholder="DOT or MC number"
                inputProps={{ inputMode: 'numeric' }}
                sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                size="medium"
              />
            </Box>
            <FieldImage src={photos.dotmc} alt="DOT or MC" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Box className={styles.fieldWithImage}>
            <Autocomplete
              options={US_STATE_CODES.map((code) => ({ label: code, code }))}
              value={licenseRegionValue}
              onChange={(_, val) => onChange('licenseRegion', val?.code ?? '')}
              getOptionLabel={(opt) => opt.label}
              isOptionEqualToValue={(a, b) => a?.code === b?.code}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="License region (state)"
                  placeholder="Select or search state"
                  size="medium"
                  sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
                />
              )}
              size="small"
            />
            <TextField
              fullWidth
              label="License plate"
              value={data.licensePlate ?? ''}
              onChange={(e) => onChange('licensePlate', e.target.value)}
              placeholder="Enter license plate"
              autoComplete="off"
              sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
              size="medium"
            />
            <FieldImage src={photos.license} alt="License plate" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Box className={styles.fieldWithImage}>
            <TextField
              fullWidth
              label="VIN"
              value={data.vin ?? ''}
              onChange={(e) => onChange('vin', e.target.value)}
              placeholder="Enter VIN (17 characters)"
              autoComplete="off"
              inputProps={{ maxLength: 17 }}
              sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
              size="medium"
            />
            <FieldImage src={photos.vin} alt="VIN" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Box className={styles.fieldWithImage}>
            <TextField
              fullWidth
              label="Odometer"
              value={data.odometer ?? ''}
              onChange={(e) => onChange('odometer', e.target.value)}
              placeholder="Enter odometer reading"
              inputProps={{ inputMode: 'numeric' }}
              sx={{ '& .MuiInputBase-root': { borderRadius: 2 } }}
              size="medium"
            />
            <FieldImage src={photos.odometer} alt="Odometer" onOpenFullScreen={(src, alt) => setFullScreenImage({ open: true, src, alt })} />
          </Box>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={creating}
            className={styles.createBtn}
            sx={{
              mt: 1,
              py: 1.5,
              fontSize: 16,
              fontWeight: 600,
              bgcolor: 'secondary.main',
              color: '#fff',
              borderRadius: 2,
              boxShadow: '0 2px 12px rgba(6, 214, 160, 0.25)',
              '&:hover': { bgcolor: 'secondary.dark', boxShadow: '0 4px 16px rgba(6, 214, 160, 0.3)' },
            }}
          >
            {creating ? 'Creating…' : 'Create job file'}
          </Button>
        </Box>
      </Paper>
      <FullScreenImageViewer
        open={fullScreenImage.open}
        src={fullScreenImage.src}
        alt={fullScreenImage.alt}
        onClose={() => setFullScreenImage({ open: false, src: null, alt: '' })}
      />
      {onStartOver && (
        <Button
          type="button"
          onClick={onStartOver}
          className={styles.startOver}
          sx={{ mt: 2.5, color: 'text.secondary', textTransform: 'none' }}
        >
          Start over
        </Button>
      )}
    </Box>
  );
}

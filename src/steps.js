export const STEPS = [
  {
    id: 'company',
    title: 'Company name',
    description: 'Take a picture of the company name (e.g. on the truck or paperwork)',
    field: 'companyName',
  },
  {
    id: 'dotmc',
    title: 'DOT or MC',
    description: 'Take a picture of the DOT or MC number (skip if it was in the first picture)',
    field: 'dotOrMc',
    optional: true,
  },
  {
    id: 'license',
    title: 'License plate',
    description: 'Take a picture of the license plate. We\'ll read the plate number and state (OCR).',
    hint: 'Position the license plate inside the green frame',
    field: 'licensePlate',
  },
  {
    id: 'vin',
    title: 'VIN',
    description: 'Take a picture of the VIN (e.g. on door jamb or dashboard). We\'ll read it automatically.',
    hint: 'Position the VIN inside the green frame',
    field: 'vin',
  },
  {
    id: 'odometer',
    title: 'Odometer',
    description: 'Take a picture of the odometer reading',
    field: 'odometer',
  },
];

export const STEP_IDS = STEPS.map((s) => s.id);

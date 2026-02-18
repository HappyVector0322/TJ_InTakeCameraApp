/** Step order: license first, then new-unit steps (company, dot/mc/ca, vin, unit), then odometer. */
export const STEPS = [
  {
    id: 'license',
    title: 'License plate',
    description: 'Take a picture of the license plate. We\'ll read the plate number and state, then look up the unit.',
    hint: 'Position the license plate inside the green frame',
    field: 'licensePlate',
  },
  {
    id: 'company',
    title: 'Company name',
    description: 'Take a picture of the company name (e.g. on the truck or paperwork)',
    field: 'companyName',
  },
  {
    id: 'dotmc',
    title: 'DOT / MC / CA',
    description: 'Take a picture of the DOT, MC, or CA number (skip if it was in the company picture)',
    field: 'dotOrMc',
    optional: true,
  },
  {
    id: 'vin',
    title: 'VIN',
    description: 'Take a picture of the VIN (e.g. on door jamb or dashboard). We\'ll read it automatically.',
    hint: 'Position the VIN inside the green frame',
    field: 'vin',
  },
  {
    id: 'unit',
    title: 'Unit number',
    description: 'Take a picture of the unit number (e.g. on the door or paperwork). We\'ll try to read it, or you can type it on the next screen.',
    field: 'unitNumber',
  },
  {
    id: 'odometer',
    title: 'Odometer',
    description: 'Take a picture of the odometer reading, or skip if not available.',
    field: 'odometer',
    optional: true,
  },
];

export const STEP_IDS = STEPS.map((s) => s.id);

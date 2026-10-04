export interface CipChecklistStep {
  id: string;
  label: string;
  required?: boolean;
}

// Daily cleaning is the SH8000 cycle performed at every shift change.
export const dailyCipChecklist: CipChecklistStep[] = [
  { id: 'daily-rinse-vat-1', label: 'Rinse Vat 1' },
  { id: 'daily-rinse-until-clear', label: 'Rinse all vats until the water output is clear' },
  { id: 'daily-prepare-sh8000', label: 'Heat 200 L water to 80°C and add 5 L SH8000' },
  { id: 'daily-circulate-sh8000', label: 'Run the SH8000 solution through the system for 45 minutes' },
  { id: 'daily-check-vats', label: 'Check that Vat 1 and Vat 2 are clean' },
  { id: 'daily-drain-sh8000', label: 'Drain the SH8000 solution' },
  { id: 'daily-rinse-after-sh8000', label: 'Rinse the vats with water' },
  { id: 'daily-check-return-line', label: 'Check that the return line is clean' },
];

export const dailyCipOptionalSteps: CipChecklistStep[] = [
  { id: 'daily-extra-10-minutes', label: 'If vats were not clean, run SH8000 for an additional 10 minutes', required: false },
];

// The conditional extension belongs immediately after checking Vat 1 and
// Vat 2, before the solution is drained or the vats are rinsed.
export const dailyCipSteps: CipChecklistStep[] = [
  ...dailyCipChecklist.slice(0, 5),
  ...dailyCipOptionalSteps,
  ...dailyCipChecklist.slice(5),
];

// The weekly acid cycle repeats the same checks with Scale Bright in place of
// SH8000, using 200 L water at 65°C and 2 L Scale Bright.
export const weeklyAcidCipChecklist: CipChecklistStep[] = [
  { id: 'weekly-acid-prepare', label: 'Heat 200 L water to 65°C and add 2 L Scale Bright' },
  { id: 'weekly-acid-circulate', label: 'Run the Scale Bright solution through the system for 45 minutes' },
  { id: 'weekly-acid-check-vats', label: 'Check that Vat 1 and Vat 2 are clean' },
  { id: 'weekly-acid-drain', label: 'Drain the Scale Bright solution' },
  { id: 'weekly-acid-rinse', label: 'Rinse the vats with water' },
  { id: 'weekly-acid-check-return-line', label: 'Check that the return line is clean' },
];

export const weeklyAcidCipOptionalSteps: CipChecklistStep[] = [
  { id: 'weekly-acid-extra-10-minutes', label: 'If vats were not clean, run Scale Bright for an additional 10 minutes', required: false },
];

export const weeklyAcidCipSteps: CipChecklistStep[] = [
  ...weeklyAcidCipChecklist.slice(0, 3),
  ...weeklyAcidCipOptionalSteps,
  ...weeklyAcidCipChecklist.slice(3),
];

import { useState } from 'react';

export function useUnits() {
  const [unit, setUnit] = useState('mm');
  const isMm = unit === 'mm';
  return {
    unit,
    setUnit,
    suffix: isMm ? 'mm' : 'm',
    toDisplay: (mm) => (isMm ? +mm.toFixed(1) : +(mm / 1000).toFixed(4)),
    fromDisplay: (v) => (isMm ? v : v * 1000),
    step: (mmStep) => (isMm ? mmStep : mmStep / 1000),
  };
}

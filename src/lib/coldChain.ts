export const RAW_MILK_TEMP_MIN_C = 2;
export const RAW_MILK_TEMP_MAX_C = 6;

export function temperatureTargetLabel(reading: { targetMin: number; targetMax: number; upperLimitOnly?: boolean; rangeNotConfigured?: boolean }) {
  if (reading.rangeNotConfigured) return 'Limits not configured';
  return reading.upperLimitOnly ? `At or below ${reading.targetMax}°C` : `${reading.targetMin}–${reading.targetMax}°C`;
}

export function isRawMilkTemperatureInRange(temperature: number) {
  return Number.isFinite(temperature)
    && temperature >= RAW_MILK_TEMP_MIN_C
    && temperature <= RAW_MILK_TEMP_MAX_C;
}

export const RAW_MILK_TEMP_MIN_C = 2;
export const RAW_MILK_TEMP_MAX_C = 6;

export function isRawMilkTemperatureInRange(temperature: number) {
  return Number.isFinite(temperature)
    && temperature >= RAW_MILK_TEMP_MIN_C
    && temperature <= RAW_MILK_TEMP_MAX_C;
}

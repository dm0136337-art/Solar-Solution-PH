export type AssessmentMethod = 'device' | 'electricity_bill';

export interface StandardizedConsumption {
  assessmentMethod: AssessmentMethod;
  dailyConsumptionKwh: number;
  estimated30DayConsumptionKwh: number;
}

export interface DeviceEntry {
  id: string;
  name: string;
  powerWatts: string;
  quantity: string;
  hoursPerDay: string;
  simultaneousQuantity: string;
  startingPowerWatts: string;
}

export type InverterSuitabilityStatus = 'suitable' | 'insufficient_continuous' | 'insufficient_surge' | 'insufficient_capacity';

export interface InverterSizingResult {
  assessmentMethod: 'device';
  totalSimultaneousRunningLoadW: number;
  inverterSafetyMargin: number;
  requiredContinuousCapacityW: number;
  requiredContinuousCapacityKw: number;
  totalAdditionalSurgeDemandW: number;
  peakSurgeLoadW: number;
  requiredSurgeCapacityW: number;
  includedApplianceCount: number;
  selectedInverterContinuousRatingW: number | null;
  selectedInverterSurgeRatingW: number | null;
  inverterSuitabilityStatus: InverterSuitabilityStatus | null;
}

export const DEFAULT_INVERTER_SAFETY_MARGIN_PERCENT = 25;

export function calculateInverterSizing(
  entries: DeviceEntry[],
  safetyMarginPercent: number,
  selectedContinuousRatingW: number | null,
  selectedSurgeRatingW: number | null,
): InverterSizingResult | null {
  if (entries.length === 0 || !Number.isFinite(safetyMarginPercent) || safetyMarginPercent < 0) return null;

  const parsed = entries.map((entry) => {
    const power = Number(entry.powerWatts);
    const quantity = Number(entry.quantity);
    const simultaneous = Number(entry.simultaneousQuantity);
    const start = entry.startingPowerWatts.trim() ? Number(entry.startingPowerWatts) : power;
    const baseValid = entry.name.trim() !== '' && Number.isFinite(power) && power > 0
      && Number.isInteger(quantity) && quantity > 0 && Number.isFinite(Number(entry.hoursPerDay))
      && Number(entry.hoursPerDay) >= 0 && Number(entry.hoursPerDay) <= 24;
    const inverterValid = Number.isInteger(simultaneous) && simultaneous >= 0 && simultaneous <= quantity
      && Number.isFinite(start) && start >= power;
    return { power, simultaneous, start, baseValid, inverterValid };
  });
  if (parsed.some(({ baseValid, inverterValid }) => !baseValid || !inverterValid)) return null;

  const included = parsed.filter(({ simultaneous }) => simultaneous > 0);
  if (included.length === 0) return null;
  const totalSimultaneousRunningLoadW = included.reduce((sum, item) => sum + item.power * item.simultaneous, 0);
  const totalAdditionalSurgeDemandW = included.reduce((sum, item) => sum + (item.start - item.power) * item.simultaneous, 0);
  const requiredContinuousCapacityW = totalSimultaneousRunningLoadW * (1 + safetyMarginPercent / 100);
  const peakSurgeLoadW = totalSimultaneousRunningLoadW + totalAdditionalSurgeDemandW;
  const continuousSelected = selectedContinuousRatingW !== null && Number.isFinite(selectedContinuousRatingW) && selectedContinuousRatingW > 0;
  const surgeSelected = selectedSurgeRatingW !== null && Number.isFinite(selectedSurgeRatingW) && selectedSurgeRatingW > 0;
  let inverterSuitabilityStatus: InverterSuitabilityStatus | null = null;
  if (continuousSelected || surgeSelected) {
    const continuousInsufficient = !continuousSelected || selectedContinuousRatingW < requiredContinuousCapacityW;
    const surgeInsufficient = !surgeSelected || selectedSurgeRatingW < peakSurgeLoadW;
    inverterSuitabilityStatus = continuousInsufficient && surgeInsufficient ? 'insufficient_capacity'
      : continuousInsufficient ? 'insufficient_continuous'
        : surgeInsufficient ? 'insufficient_surge' : 'suitable';
  }

  return {
    assessmentMethod: 'device',
    totalSimultaneousRunningLoadW,
    inverterSafetyMargin: safetyMarginPercent,
    requiredContinuousCapacityW,
    requiredContinuousCapacityKw: requiredContinuousCapacityW / 1000,
    totalAdditionalSurgeDemandW,
    peakSurgeLoadW,
    requiredSurgeCapacityW: peakSurgeLoadW,
    includedApplianceCount: included.reduce((count, item) => count + item.simultaneous, 0),
    selectedInverterContinuousRatingW: continuousSelected ? selectedContinuousRatingW : null,
    selectedInverterSurgeRatingW: surgeSelected ? selectedSurgeRatingW : null,
    inverterSuitabilityStatus,
  };
}

export interface ElectricityBillEntry {
  consumptionKwh: string;
  billingDays: string;
}

export type DeviceField = 'name' | 'powerWatts' | 'quantity' | 'hoursPerDay' | 'simultaneousQuantity' | 'startingPowerWatts';
export type DeviceErrors = Partial<Record<DeviceField, string>>;
export type BillField = 'consumptionKwh' | 'billingDays';
export type BillErrors = Partial<Record<BillField, string>>;

function parseRequiredNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateDeviceEntry(entry: DeviceEntry): DeviceErrors {
  const errors: DeviceErrors = {};
  const power = parseRequiredNumber(entry.powerWatts);
  const quantity = parseRequiredNumber(entry.quantity);
  const hours = parseRequiredNumber(entry.hoursPerDay);

  if (!entry.name.trim()) errors.name = 'Enter a device name.';
  if (power === null) errors.powerWatts = 'Enter the power rating in watts.';
  else if (power <= 0) errors.powerWatts = 'Power rating must be greater than zero.';
  if (quantity === null) errors.quantity = 'Enter the quantity.';
  else if (!Number.isInteger(quantity) || quantity < 1) {
    errors.quantity = 'Quantity must be a positive whole number.';
  }
  if (hours === null) errors.hoursPerDay = 'Enter operating hours per day.';
  else if (hours < 0 || hours > 24) errors.hoursPerDay = 'Hours must be between 0 and 24.';

  return errors;
}

export function calculateDeviceConsumption(entry: DeviceEntry): number | null {
  if (Object.keys(validateDeviceEntry(entry)).length > 0) return null;
  const power = Number(entry.powerWatts);
  const quantity = Number(entry.quantity);
  const hours = Number(entry.hoursPerDay);
  return (power * quantity * hours) / 1000;
}

export function calculateDeviceAssessment(
  entries: DeviceEntry[],
): StandardizedConsumption | null {
  if (entries.length === 0) return null;
  const consumption = entries.map(calculateDeviceConsumption);
  if (consumption.some((value) => value === null)) return null;

  const dailyConsumptionKwh = (consumption as number[]).reduce((total, value) => total + value, 0);
  return {
    assessmentMethod: 'device',
    dailyConsumptionKwh,
    estimated30DayConsumptionKwh: dailyConsumptionKwh * 30,
  };
}

export function validateElectricityBill(entry: ElectricityBillEntry): BillErrors {
  const errors: BillErrors = {};
  const consumption = parseRequiredNumber(entry.consumptionKwh);
  const days = parseRequiredNumber(entry.billingDays);

  if (consumption === null) errors.consumptionKwh = 'Enter your electricity consumption.';
  else if (consumption <= 0) errors.consumptionKwh = 'Consumption must be greater than zero.';
  if (days === null) errors.billingDays = 'Enter the billing period in days.';
  else if (!Number.isInteger(days) || days < 1) {
    errors.billingDays = 'Billing period must be a positive whole number.';
  }

  return errors;
}

export function calculateElectricityBillAssessment(
  entry: ElectricityBillEntry,
): StandardizedConsumption | null {
  if (Object.keys(validateElectricityBill(entry)).length > 0) return null;
  const dailyConsumptionKwh = Number(entry.consumptionKwh) / Number(entry.billingDays);
  return {
    assessmentMethod: 'electricity_bill',
    dailyConsumptionKwh,
    estimated30DayConsumptionKwh: dailyConsumptionKwh * 30,
  };
}

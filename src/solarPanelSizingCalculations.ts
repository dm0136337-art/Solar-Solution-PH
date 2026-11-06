import type { StandardizedConsumption } from './assessmentCalculations';
import type { SolarIrradiationAssessment } from './nasaPowerService';

export const DEFAULT_PANEL_EFFICIENCY_PERCENT = 23;
export const DEFAULT_SYSTEM_PERFORMANCE_RATIO_PERCENT = 80;

export interface SolarPanelSizingInput {
  consumption: StandardizedConsumption | null;
  irradiation: SolarIrradiationAssessment | null;
  panelWattage: number;
  systemPerformanceRatioPercent: number;
}

export interface SolarPanelSizingResult {
  dailyConsumptionKwh: number;
  estimated30DayConsumptionKwh: number;
  latitude: number;
  longitude: number;
  annualAverageIrradiation: number;
  panelEfficiencyPercent: number;
  systemPerformanceRatioPercent: number;
  selectedPanelWattage: number;
  requiredArrayCapacityKw: number;
  requiredArrayCapacityW: number;
  requiredPanelCount: number;
  actualInstalledCapacityW: number;
  actualInstalledCapacityKw: number;
}

export function calculateSolarPanelSizing({
  consumption,
  irradiation,
  panelWattage,
  systemPerformanceRatioPercent,
}: SolarPanelSizingInput): SolarPanelSizingResult | null {
  if (
    !consumption
    || consumption.assessmentMethod !== 'device'
    || !irradiation
    || !Number.isFinite(consumption.dailyConsumptionKwh)
    || consumption.dailyConsumptionKwh <= 0
    || !Number.isFinite(irradiation.annualAverageIrradiation)
    || irradiation.annualAverageIrradiation <= 0
    || !Number.isFinite(panelWattage)
    || panelWattage <= 0
    || !Number.isFinite(systemPerformanceRatioPercent)
    || systemPerformanceRatioPercent <= 0
    || systemPerformanceRatioPercent > 100
  ) {
    return null;
  }

  const systemPerformanceRatio = systemPerformanceRatioPercent / 100;
  const requiredArrayCapacityKw = consumption.dailyConsumptionKwh
    / (irradiation.annualAverageIrradiation * systemPerformanceRatio);
  const requiredArrayCapacityW = requiredArrayCapacityKw * 1000;
  const requiredPanelCount = Math.ceil(requiredArrayCapacityW / panelWattage);
  const actualInstalledCapacityW = requiredPanelCount * panelWattage;

  return {
    dailyConsumptionKwh: consumption.dailyConsumptionKwh,
    estimated30DayConsumptionKwh: consumption.estimated30DayConsumptionKwh,
    latitude: irradiation.latitude,
    longitude: irradiation.longitude,
    annualAverageIrradiation: irradiation.annualAverageIrradiation,
    panelEfficiencyPercent: DEFAULT_PANEL_EFFICIENCY_PERCENT,
    systemPerformanceRatioPercent,
    selectedPanelWattage: panelWattage,
    requiredArrayCapacityKw,
    requiredArrayCapacityW,
    requiredPanelCount,
    actualInstalledCapacityW,
    actualInstalledCapacityKw: actualInstalledCapacityW / 1000,
  };
}

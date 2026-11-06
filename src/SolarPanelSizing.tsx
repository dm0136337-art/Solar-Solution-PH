import { useState } from 'react';
import type { StandardizedConsumption } from './assessmentCalculations';
import type { SolarIrradiationAssessment } from './nasaPowerService';
import {
  calculateSolarPanelSizing,
  DEFAULT_PANEL_EFFICIENCY_PERCENT,
  DEFAULT_SYSTEM_PERFORMANCE_RATIO_PERCENT,
} from './solarPanelSizingCalculations';

interface SolarPanelSizingProps {
  consumption: StandardizedConsumption | null;
  irradiation: SolarIrradiationAssessment | null;
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits });
}

function readPositiveNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export default function SolarPanelSizing({ consumption, irradiation }: SolarPanelSizingProps) {
  const [panelWattage, setPanelWattage] = useState('');
  const [systemPerformanceRatio, setSystemPerformanceRatio] = useState(
    String(DEFAULT_SYSTEM_PERFORMANCE_RATIO_PERCENT),
  );
  const [panelTouched, setPanelTouched] = useState(false);
  const [ratioTouched, setRatioTouched] = useState(false);

  const panelWattageNumber = readPositiveNumber(panelWattage);
  const ratioNumber = readPositiveNumber(systemPerformanceRatio);
  const panelWattageError = panelTouched && panelWattageNumber === null
    ? 'Enter a panel wattage greater than zero.'
    : undefined;
  const ratioError = ratioTouched && (
    ratioNumber === null || ratioNumber > 100
  ) ? 'Enter a performance ratio greater than 0 and no more than 100%.' : undefined;
  const sizingResult = calculateSolarPanelSizing({
    consumption,
    irradiation,
    panelWattage: panelWattageNumber ?? Number.NaN,
    systemPerformanceRatioPercent: ratioNumber ?? Number.NaN,
  });

  let unavailableReason: string | null = null;
  if (!consumption) {
    unavailableReason = 'Complete all device consumption fields with valid values before sizing panels.';
  } else if (consumption.dailyConsumptionKwh <= 0) {
    unavailableReason = 'Daily device consumption must be greater than zero before sizing panels.';
  } else if (!irradiation) {
    unavailableReason = 'Complete or retry the solar location and irradiation assessment to continue.';
  } else if (irradiation.annualAverageIrradiation <= 0) {
    unavailableReason = 'NASA POWER did not provide a usable positive annual average for this location.';
  } else if (panelWattageNumber === null || ratioNumber === null || ratioNumber > 100) {
    unavailableReason = 'Enter valid panel wattage and system performance ratio values to calculate results.';
  }

  return (
    <section
      className="solar-panel-sizing"
      aria-labelledby="solar-panel-sizing-heading"
      data-solar-panel-sizing-result={sizingResult ? JSON.stringify(sizingResult) : undefined}
    >
      <div className="solar-panel-sizing-heading">
        <div>
          <span className="phase-label">Phase 3</span>
          <h3 id="solar-panel-sizing-heading">Solar Panel Configuration</h3>
          <p>Choose a panel rating and system performance ratio to estimate the array size.</p>
        </div>
      </div>

      <div className="solar-panel-config-grid">
        <label className="assessment-field" htmlFor="solar-panel-wattage">
          <span>Solar panel wattage (W)</span>
          <input
            id="solar-panel-wattage"
            type="number"
            min="0"
            step="any"
            value={panelWattage}
            placeholder="Enter panel rating"
            required
            aria-invalid={Boolean(panelWattageError)}
            aria-describedby={panelWattageError ? 'solar-panel-wattage-error' : undefined}
            onChange={(event) => setPanelWattage(event.target.value)}
            onBlur={() => setPanelTouched(true)}
          />
          {panelWattageError && <span className="assessment-error" id="solar-panel-wattage-error">{panelWattageError}</span>}
        </label>

        <label className="assessment-field" htmlFor="solar-performance-ratio">
          <span>System performance ratio (%)</span>
          <input
            id="solar-performance-ratio"
            type="number"
            min="0"
            max="100"
            step="any"
            value={systemPerformanceRatio}
            required
            aria-invalid={Boolean(ratioError)}
            aria-describedby={ratioError ? 'solar-performance-ratio-error' : undefined}
            onChange={(event) => setSystemPerformanceRatio(event.target.value)}
            onBlur={() => setRatioTouched(true)}
          />
          {ratioError && <span className="assessment-error" id="solar-performance-ratio-error">{ratioError}</span>}
        </label>

        <div className="panel-efficiency-info">
          <span>Solar panel efficiency</span>
          <strong>{DEFAULT_PANEL_EFFICIENCY_PERCENT}%</strong>
          <small>Rated panel wattage already includes this efficiency; it is not applied again in sizing.</small>
        </div>
      </div>

      {irradiation && (
        <p className="sizing-irradiation-basis">
          Annual average daily irradiation used: <strong>{formatNumber(irradiation.annualAverageIrradiation)} kWh/m²/day</strong>
          <span> · Based on NASA POWER data for {irradiation.latitude}, {irradiation.longitude}.</span>
        </p>
      )}

      {unavailableReason && (
        <p className="sizing-unavailable" role="status">{unavailableReason}</p>
      )}

      {sizingResult && irradiation && (
        <SizingResults result={sizingResult} irradiation={irradiation} />
      )}
    </section>
  );
}

function SizingResults({
  result,
  irradiation,
}: {
  result: NonNullable<ReturnType<typeof calculateSolarPanelSizing>>;
  irradiation: SolarIrradiationAssessment;
}) {
  const availableMonthlyValues = irradiation.monthlyAverageIrradiation
    .map((month) => month.averageDailyIrradiation)
    .filter((value): value is number => value !== null);
  const highestMonthlyValue = Math.max(...availableMonthlyValues, 0);

  return (
    <div className="solar-panel-results" aria-live="polite">
      <h4>Solar Panel Sizing Results</h4>

      <div className="panel-result-highlights">
        <div className="panel-result-highlight">
          <span>Required solar panels</span>
          <strong>{result.requiredPanelCount}</strong>
          <small>panels</small>
        </div>
        <div className="panel-result-highlight">
          <span>Actual installed capacity</span>
          <strong>{formatNumber(result.actualInstalledCapacityKw)} <small>kW</small></strong>
          <small>{formatNumber(result.actualInstalledCapacityW)} W total</small>
        </div>
      </div>

      <dl className="panel-result-details">
        <ResultDetail label="Daily energy consumption" value={`${formatNumber(result.dailyConsumptionKwh)} kWh/day`} />
        <ResultDetail label="Estimated 30-day consumption" value={`${formatNumber(result.estimated30DayConsumptionKwh)} kWh`} />
        <ResultDetail label="Installation coordinates" value={`${result.latitude}, ${result.longitude}`} />
        <ResultDetail label="Annual average daily irradiation (used)" value={`${formatNumber(result.annualAverageIrradiation)} kWh/m²/day`} />
        <ResultDetail label="Solar panel efficiency" value={`${result.panelEfficiencyPercent}%`} />
        <ResultDetail label="System performance ratio" value={`${formatNumber(result.systemPerformanceRatioPercent)}%`} />
        <ResultDetail label="Selected panel wattage" value={`${formatNumber(result.selectedPanelWattage)} W`} />
        <ResultDetail label="Required solar array capacity" value={`${formatNumber(result.requiredArrayCapacityKw, 3)} kW`} />
      </dl>

      <section className="panel-irradiation-profile" aria-labelledby="panel-irradiation-heading">
        <div className="panel-irradiation-heading">
          <h5 id="panel-irradiation-heading">Monthly average daily irradiation</h5>
          <span>kWh/m²/day · NASA POWER</span>
        </div>
        <div className="panel-irradiation-chart">
          {irradiation.monthlyAverageIrradiation.map((month) => {
            const value = month.averageDailyIrradiation;
            const barHeight = value === null || highestMonthlyValue === 0
              ? 0
              : Math.max(4, (value / highestMonthlyValue) * 100);
            const label = value === null
              ? `${month.month}: no valid data`
              : `${month.month}: ${formatNumber(value)} kilowatt-hours per square meter per day`;
            return (
              <div className="panel-irradiation-month" key={month.month} aria-label={label} title={label}>
                <strong>{value === null ? '—' : formatNumber(value)}</strong>
                <span className="panel-irradiation-track" aria-hidden="true">
                  <i style={{ height: `${barHeight}%` }} />
                </span>
                <small>{month.month.slice(0, 3)}</small>
              </div>
            );
          })}
        </div>
        <p>Values are daily averages grouped by calendar month, not monthly accumulated irradiation.</p>
      </section>

      <div className="panel-calculation-breakdown">
        <h5>Calculation breakdown</h5>
        <p>
          Required array capacity = {formatNumber(result.dailyConsumptionKwh)} ÷ (
          {formatNumber(result.annualAverageIrradiation)} × {formatNumber(result.systemPerformanceRatioPercent / 100, 3)}) ={' '}
          <strong>{formatNumber(result.requiredArrayCapacityKw, 3)} kW</strong>
        </p>
        <p>
          Panel count = ceil({formatNumber(result.requiredArrayCapacityW, 1)} W ÷ {formatNumber(result.selectedPanelWattage)} W) ={' '}
          <strong>{result.requiredPanelCount} panels</strong>
        </p>
        <p>
          Installed capacity = {result.requiredPanelCount} × {formatNumber(result.selectedPanelWattage)} W ={' '}
          <strong>{formatNumber(result.actualInstalledCapacityW)} W ({formatNumber(result.actualInstalledCapacityKw)} kW)</strong>
        </p>
      </div>
    </div>
  );
}

function ResultDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-result-detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

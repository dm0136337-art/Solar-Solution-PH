import { useEffect, useState } from 'react';
import {
  calculateInverterSizing,
  DEFAULT_INVERTER_SAFETY_MARGIN_PERCENT,
  type DeviceEntry,
  type InverterSizingResult,
} from './assessmentCalculations';

interface InverterSizingProps {
  assessmentMethod: 'device' | 'electricity_bill';
  devices: DeviceEntry[];
  onDeviceFieldChange: (id: string, field: 'simultaneousQuantity' | 'startingPowerWatts', value: string) => void;
  onResultChange: (result: InverterSizingResult | null) => void;
}

function optionalPositive(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function format(value: number, digits = 2) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

const statusLabels = {
  suitable: 'Suitable',
  insufficient_continuous: 'Insufficient Continuous Capacity',
  insufficient_surge: 'Insufficient Surge Capacity',
  insufficient_capacity: 'Insufficient Capacity',
} as const;

export default function InverterSizing({ assessmentMethod, devices, onDeviceFieldChange, onResultChange }: InverterSizingProps) {
  const [safetyMargin, setSafetyMargin] = useState(String(DEFAULT_INVERTER_SAFETY_MARGIN_PERCENT));
  const [continuousRating, setContinuousRating] = useState('');
  const [surgeRating, setSurgeRating] = useState('');
  const margin = Number(safetyMargin);
  const selectedContinuous = optionalPositive(continuousRating);
  const selectedSurge = optionalPositive(surgeRating);
  const result = assessmentMethod === 'device'
    ? calculateInverterSizing(devices, margin, selectedContinuous !== null && Number.isFinite(selectedContinuous) ? selectedContinuous : null,
      selectedSurge !== null && Number.isFinite(selectedSurge) ? selectedSurge : null)
    : null;
  useEffect(() => onResultChange(result), [onResultChange, result]);

  const devicesValid = devices.length > 0 && devices.every((device) => {
    const quantity = Number(device.quantity);
    const simultaneous = Number(device.simultaneousQuantity);
    const power = Number(device.powerWatts);
    const start = device.startingPowerWatts.trim() ? Number(device.startingPowerWatts) : power;
    return Boolean(device.name.trim()) && Number.isFinite(power) && power > 0 && Number.isInteger(quantity) && quantity > 0
      && Number.isFinite(Number(device.hoursPerDay)) && Number(device.hoursPerDay) >= 0 && Number(device.hoursPerDay) <= 24
      && Number.isInteger(simultaneous) && simultaneous >= 0 && simultaneous <= quantity
      && Number.isFinite(start) && start >= power;
  });
  const invalidSelection = (continuousRating.trim() && selectedContinuous === null)
    || (surgeRating.trim() && selectedSurge === null);
  const unavailable = assessmentMethod !== 'device'
    ? 'Inverter sizing requires appliance-level power and startup information. Switch to Device-Based Assessment to continue.'
    : !devices.length || !devicesValid
      ? 'Complete all device and simultaneous-use values with valid entries before calculating inverter requirements.'
      : !result ? 'Set at least one device quantity used simultaneously above zero, and use a non-negative safety margin.'
        : invalidSelection ? 'Selected inverter ratings must be greater than zero.' : null;

  return (
    <section className="inverter-sizing" aria-labelledby="inverter-sizing-heading"
      data-inverter-sizing-result={result ? JSON.stringify(result) : undefined}>
      <div className="solar-panel-sizing-heading">
        <div>
          <span className="phase-label">Phase 4</span>
          <h3 id="inverter-sizing-heading">Inverter Configuration &amp; Sizing</h3>
          <p>Estimate continuous and startup capacity from the appliances listed above.</p>
        </div>
      </div>

      {assessmentMethod === 'device' && (
        <>
          <div className="inverter-device-list">
            {devices.map((device, index) => {
              const power = Number(device.powerWatts);
              const surgeBlank = !device.startingPowerWatts.trim();
              const surgeInvalid = !surgeBlank && (!Number.isFinite(Number(device.startingPowerWatts)) || Number(device.startingPowerWatts) < power);
              return (
                <div className="inverter-device-row" key={device.id}>
                  <div className="inverter-device-name">{index + 1}. {device.name.trim() || 'Unnamed device'}<small>Quantity: {device.quantity || '—'} · running {Number.isFinite(power) ? format(power) : '—'} W/unit</small></div>
                  <label className="assessment-field">
                    <span>Quantity used simultaneously</span>
                    <input type="number" min="0" max={Number.isInteger(Number(device.quantity)) ? device.quantity : 0} step="1"
                      value={device.simultaneousQuantity} onChange={(event) => onDeviceFieldChange(device.id, 'simultaneousQuantity', event.target.value)}
                      aria-label={`Quantity used simultaneously for ${device.name || `device ${index + 1}`}`} />
                  </label>
                  <label className="assessment-field">
                    <span>Starting / surge power (W per unit)</span>
                    <input type="number" min={Number.isFinite(power) ? power : 0} step="any" value={device.startingPowerWatts}
                      onChange={(event) => onDeviceFieldChange(device.id, 'startingPowerWatts', event.target.value)}
                      aria-label={`Starting or surge power for ${device.name || `device ${index + 1}`}`} />
                    {surgeInvalid && <small className="assessment-error">Must be at least the running power ({format(power)} W).</small>}
                    {surgeBlank && <small className="inverter-default-note">Blank means no additional startup surge; running power is assumed.</small>}
                  </label>
                </div>
              );
            })}
          </div>

          <div className="inverter-config-grid">
            <label className="assessment-field" htmlFor="inverter-safety-margin">
              <span>Inverter safety margin (%)</span>
              <input id="inverter-safety-margin" type="number" min="0" step="any" value={safetyMargin}
                onChange={(event) => setSafetyMargin(event.target.value)} aria-invalid={!Number.isFinite(margin) || margin < 0} />
              {(!Number.isFinite(margin) || margin < 0) && <small className="assessment-error">Enter a non-negative percentage.</small>}
            </label>
            <label className="assessment-field" htmlFor="selected-inverter-continuous">
              <span>Selected inverter continuous output (W) · optional</span>
              <input id="selected-inverter-continuous" type="number" min="0" step="any" value={continuousRating} placeholder="Enter rating"
                onChange={(event) => setContinuousRating(event.target.value)} />
            </label>
            <label className="assessment-field" htmlFor="selected-inverter-surge">
              <span>Selected inverter surge rating (W) · optional</span>
              <input id="selected-inverter-surge" type="number" min="0" step="any" value={surgeRating} placeholder="Enter rating"
                onChange={(event) => setSurgeRating(event.target.value)} />
            </label>
          </div>

          {unavailable && <p className="sizing-unavailable" role="status">{unavailable}</p>}
          {result && !invalidSelection && <InverterResults result={result} />}
        </>
      )}
      {assessmentMethod === 'electricity_bill' && <p className="sizing-unavailable" role="status">{unavailable}</p>}
    </section>
  );
}

function InverterResults({ result }: { result: InverterSizingResult }) {
  return (
    <div className="inverter-results" aria-live="polite">
      <h4>Inverter Sizing Results</h4>
      <div className="panel-result-highlights">
        <div className="panel-result-highlight"><span>Required continuous capacity</span><strong>{format(result.requiredContinuousCapacityW)} <small>W</small></strong><small>{format(result.requiredContinuousCapacityKw, 3)} kW</small></div>
        <div className="panel-result-highlight inverter-surge-highlight"><span>Required minimum surge capacity</span><strong>{format(result.requiredSurgeCapacityW)} <small>W</small></strong><small>Estimated peak startup demand</small></div>
      </div>
      <dl className="panel-result-details">
        <Detail label="Total simultaneous running load" value={`${format(result.totalSimultaneousRunningLoadW)} W`} />
        <Detail label="Inverter safety margin" value={`${format(result.inverterSafetyMargin)}%`} />
        <Detail label="Total additional surge demand" value={`${format(result.totalAdditionalSurgeDemandW)} W`} />
        <Detail label="Calculated peak surge load" value={`${format(result.peakSurgeLoadW)} W`} />
        <Detail label="Appliances included" value={String(result.includedApplianceCount)} />
      </dl>
      <div className="panel-calculation-breakdown">
        <h5>Calculation breakdown</h5>
        <p>Continuous capacity = {format(result.totalSimultaneousRunningLoadW)} W × (1 + {format(result.inverterSafetyMargin)}%) = <strong>{format(result.requiredContinuousCapacityW)} W</strong>.</p>
        <p>Peak surge = {format(result.totalSimultaneousRunningLoadW)} W running load + {format(result.totalAdditionalSurgeDemandW)} W additional surge = <strong>{format(result.peakSurgeLoadW)} W</strong>.</p>
        <p>All devices with entered startup power are conservatively assumed to start at the same time. Blank startup values assume startup power equals running power, so no extra surge is added.</p>
      </div>
      {result.inverterSuitabilityStatus && <p className={`inverter-suitability inverter-suitability-${result.inverterSuitabilityStatus}`} role="status">
        <strong>{statusLabels[result.inverterSuitabilityStatus]}</strong>
        <span>Compatibility is checked against both continuous and surge requirements. Enter both ratings for a full comparison.</span>
      </p>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="panel-result-detail"><dt>{label}</dt><dd>{value}</dd></div>;
}

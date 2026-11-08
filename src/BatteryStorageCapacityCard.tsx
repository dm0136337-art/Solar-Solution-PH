import { useEffect, useMemo, useState } from 'react';

type Chemistry = 'lifepo4' | 'lead-acid';
export type BatteryResult = { requiredWh: number; requiredAh: number };
export type BatterySettings = { voltage: number | null; chemistry: string; backupDays: number | null; reservePercent: number | null };
type Props = { dailyEnergyWh: number; onResultChange?: (result: BatteryResult | null, settings: BatterySettings) => void };

const BATTERY_EFFICIENCY: Record<Chemistry, number> = {
  lifepo4: 0.95,
  'lead-acid': 0.85,
};

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function BatteryStorageCapacityCard({ dailyEnergyWh, onResultChange }: Props) {
  const [voltage, setVoltage] = useState('48');
  const [chemistry, setChemistry] = useState<Chemistry>('lifepo4');
  const [backupDays, setBackupDays] = useState('1');
  const [customDays, setCustomDays] = useState('');
  const [reservePercent, setReservePercent] = useState('30');

  const selectedDays = backupDays === 'custom' ? Number(customDays) : Number(backupDays);
  const selectedVoltage = Number(voltage);
  const selectedReserve = Number(reservePercent);
  const hasEnergy = Number.isFinite(dailyEnergyWh) && dailyEnergyWh > 0;
  const hasVoltage = Number.isFinite(selectedVoltage) && selectedVoltage > 0;
  const hasDays = Number.isFinite(selectedDays) && selectedDays > 0;
  const hasReserve = Number.isFinite(selectedReserve) && selectedReserve >= 0 && selectedReserve < 100;
  const efficiency = BATTERY_EFFICIENCY[chemistry];

  const result = useMemo(() => {
    if (!hasEnergy || !hasVoltage || !hasDays || !hasReserve || !Number.isFinite(efficiency) || efficiency <= 0) return null;
    const usableFraction = 1 - selectedReserve / 100;
    const requiredWh = (dailyEnergyWh * selectedDays) / (usableFraction * efficiency);
    const requiredAh = requiredWh / selectedVoltage;
    if (![usableFraction, requiredWh, requiredAh].every(Number.isFinite) || usableFraction <= 0 || requiredWh <= 0 || requiredAh <= 0) return null;
    return { usableFraction, requiredWh, requiredAh };
  }, [dailyEnergyWh, efficiency, hasDays, hasEnergy, hasReserve, hasVoltage, selectedDays, selectedReserve, selectedVoltage]);
  useEffect(() => { onResultChange?.(result, { voltage: hasVoltage ? selectedVoltage : null, chemistry: chemistry === 'lifepo4' ? 'LiFePO4' : 'Lead-acid', backupDays: hasDays ? selectedDays : null, reservePercent: hasReserve ? selectedReserve : null }); }, [result, onResultChange, hasVoltage, selectedVoltage, chemistry, hasDays, selectedDays, hasReserve, selectedReserve]);

  return (
    <section className="capacity-card battery-card" aria-labelledby="battery-capacity-heading">
      <header className="capacity-card-heading">
        <div>
          <h2 id="battery-capacity-heading">Battery Storage Capacity Estimation</h2>
          <p>Estimate battery storage for a 100% off-grid system.</p>
        </div>
      </header>

      <div className="battery-inputs">
        <label>Battery Bank Voltage (V)
          <select value={voltage} onChange={(event) => setVoltage(event.target.value)}>
            <option value="12">12V</option><option value="24">24V</option><option value="48">48V</option>
          </select>
        </label>
        <label>Battery Chemistry
          <select value={chemistry} onChange={(event) => setChemistry(event.target.value as Chemistry)}>
            <option value="lifepo4">LiFePO4 (Lithium Iron Phosphate)</option><option value="lead-acid">Lead-acid</option>
          </select>
        </label>
        <label>Backup Duration
          <select value={backupDays} onChange={(event) => setBackupDays(event.target.value)}>
            <option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="custom">Custom</option>
          </select>
        </label>
        {backupDays === 'custom' && <label>Custom Backup Duration (days)
          <input type="number" min="0.1" step="any" value={customDays} onChange={(event) => setCustomDays(event.target.value)} placeholder="Enter days" />
        </label>}
        <label>Battery Reserve (%)
          <input type="number" min="0" max="99.9" step="any" value={reservePercent} onChange={(event) => setReservePercent(event.target.value)} />
        </label>
      </div>

      {!hasEnergy && <p className="capacity-hint" role="status">Enter valid appliance usage in the Appliance Energy Calculator to estimate battery storage.</p>}
      {hasEnergy && (!hasDays || !hasReserve || !hasVoltage) && <p className="capacity-hint" role="status">Enter a positive backup duration and a battery reserve from 0% up to (but not including) 100%.</p>}
      {hasEnergy && result && <div className="capacity-results" aria-live="polite">
        <div className="capacity-result-grid battery-result-grid">
          <div><span>Daily energy consumption</span><strong>{formatNumber(dailyEnergyWh)} Wh/day</strong></div>
          <div><span>Battery bank voltage</span><strong>{formatNumber(selectedVoltage, 0)} V</strong></div>
          <div><span>Battery chemistry</span><strong>{chemistry === 'lifepo4' ? 'LiFePO4' : 'Lead-acid'}</strong></div>
          <div><span>Backup duration</span><strong>{formatNumber(selectedDays)} {selectedDays === 1 ? 'day' : 'days'}</strong></div>
          <div><span>Battery reserve</span><strong>{formatNumber(selectedReserve)}%</strong></div>
          <div><span>Usable battery capacity</span><strong>{formatNumber(result.usableFraction * 100)}%</strong></div>
          <div className="battery-required-result"><span>Required Battery Storage Capacity</span><strong>{formatNumber(result.requiredWh)} Wh<br /><small>{formatNumber(result.requiredWh / 1000)} kWh</small></strong></div>
          <div><span>Required Battery Bank Capacity</span><strong>{formatNumber(result.requiredAh)} Ah</strong></div>
        </div>
        <details className="calculation-details">
          <summary>View Calculation Details</summary>
          <div className="calculation-steps">
            <section>
              <h3>Step 1: Calculate Usable Battery Capacity</h3>
              <p className="calculation-formula">Usable Capacity = 100% - Battery Reserve</p>
              <p>Usable Capacity = 100% - {formatNumber(selectedReserve)}% = {formatNumber(result.usableFraction * 100)}% ({formatNumber(result.usableFraction)})</p>
            </section>
            <section>
              <h3>Step 2: Calculate Required Battery Storage</h3>
              <p className="calculation-formula">C<sub>battery</sub> = (Daily Energy Consumption × Backup Duration) / (Usable Capacity × Battery Efficiency)</p>
              <p>C<sub>battery</sub> = ({formatNumber(dailyEnergyWh)} Wh/day × {formatNumber(selectedDays)} days) / ({formatNumber(result.usableFraction)} × {formatNumber(efficiency * 100)}%)</p>
              <p>C<sub>battery</sub> = {formatNumber(result.requiredWh)} Wh = {formatNumber(result.requiredWh / 1000)} kWh</p>
            </section>
            <section>
              <h3>Step 3: Calculate Required Battery Capacity in Ah</h3>
              <p className="calculation-formula">Ah = Required Battery Storage (Wh) / Battery Bank Voltage (V)</p>
              <p>Ah = {formatNumber(result.requiredWh)} Wh / {formatNumber(selectedVoltage, 0)} V = {formatNumber(result.requiredAh)} Ah</p>
            </section>
          </div>
        </details>
      </div>}

      <div className="battery-considerations">
        <p>Efficiency assumptions: {chemistry === 'lifepo4' ? '95% for LiFePO4' : '85% for lead-acid'} battery discharge efficiency. This is a battery-side estimate and does not add inverter conversion losses. Reserve is applied once as the usable capacity fraction.</p>
        <p>This is an initial sizing estimate. Final selection must account for manufacturer specifications, maximum continuous discharge current, inverter compatibility, and the battery's usable capacity.</p>
      </div>
    </section>
  );
}

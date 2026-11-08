import { useEffect, useMemo, useState } from 'react';

const PERFORMANCE_RATIO = 0.70;
const PANEL_PRESETS = [450, 500, 550, 600, 650, 700];

export type SolarPanelResult = { requiredWp: number; panelCount: number; installedWp: number; productionWh: number };
type Props = { dailyEnergyWh: number; designPsh: number | null; onResultChange?: (result: SolarPanelResult | null, panelWatts: number | null) => void };

export default function SolarPanelCapacityCard({ dailyEnergyWh, designPsh, onResultChange }: Props) {
  const [panelWattage, setPanelWattage] = useState('');
  const panelWatts = Number(panelWattage);
  const hasEnergy = Number.isFinite(dailyEnergyWh) && dailyEnergyWh > 0;
  const hasPsh = designPsh !== null && Number.isFinite(designPsh) && designPsh > 0;
  const hasPanelWattage = Number.isFinite(panelWatts) && panelWatts > 0;

  const result = useMemo(() => {
    if (!hasEnergy || !hasPsh || !hasPanelWattage || designPsh === null) return null;
    const requiredWp = dailyEnergyWh / (designPsh * PERFORMANCE_RATIO);
    const panelCount = Math.ceil(requiredWp / panelWatts);
    const installedWp = panelCount * panelWatts;
    const productionWh = installedWp * designPsh * PERFORMANCE_RATIO;
    if (![requiredWp, panelCount, installedWp, productionWh].every(Number.isFinite) || panelCount < 1) return null;
    return { requiredWp, panelCount, installedWp, productionWh };
  }, [dailyEnergyWh, designPsh, hasEnergy, hasPanelWattage, hasPsh, panelWatts]);
  useEffect(() => { onResultChange?.(result, hasPanelWattage ? panelWatts : null); }, [result, hasPanelWattage, panelWatts, onResultChange]);

  function setWattage(value: string) {
    if (value === '') {
      setPanelWattage('');
      return;
    }
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) setPanelWattage(value);
  }

  return (
    <section className="capacity-card" aria-labelledby="capacity-heading">
      <header className="capacity-card-heading">
        <div>
          <h2 id="capacity-heading">Solar Panel Capacity Estimation</h2>
          <p>Estimate the panel capacity needed for your daily energy use.</p>
        </div>
      </header>

      <div className="capacity-input-group">
        <label htmlFor="available-panel-watts">Available Solar Panel Power (W)</label>
        <input id="available-panel-watts" type="number" min="0.01" step="any" inputMode="decimal" value={panelWattage} onChange={(event) => setWattage(event.target.value)} placeholder="Enter panel wattage" />
        <div className="panel-presets" aria-label="Common panel wattages">
          {PANEL_PRESETS.map((wattage) => <button className={panelWattage === String(wattage) ? 'is-selected' : ''} key={wattage} type="button" onClick={() => setWattage(String(wattage))} aria-pressed={panelWattage === String(wattage)}>{wattage}W</button>)}
        </div>
      </div>

      {(!hasEnergy || !hasPsh) && <div className="capacity-requirements" role="status">
        {!hasEnergy && <p>Enter valid appliance usage above to calculate daily energy consumption.</p>}
        {!hasPsh && <p>Select a location and wait for its Design Peak Sun Hours to load.</p>}
      </div>}
      {hasEnergy && hasPsh && !hasPanelWattage && <p className="capacity-hint" role="status">Enter a positive panel wattage to see the capacity estimate.</p>}

      {result && <div className="capacity-results" aria-live="polite">
        <div className="capacity-result-grid">
          <div className="capacity-required-result"><span>Required Solar Panel Capacity</span><strong>{result.requiredWp.toLocaleString(undefined, { maximumFractionDigits: 1 })} W</strong></div>
          <div><span>Available panel wattage</span><strong>{panelWatts.toLocaleString(undefined, { maximumFractionDigits: 2 })} W</strong></div>
          <div><span>Recommended panels</span><strong>{result.panelCount}</strong></div>
          <div><span>Total installed capacity</span><strong>{result.installedWp.toLocaleString(undefined, { maximumFractionDigits: 2 })} W</strong></div>
          <div><span>Estimated daily production</span><strong>{result.productionWh.toLocaleString(undefined, { maximumFractionDigits: 1 })} Wh/day<br /><small>{(result.productionWh / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} kWh/day</small></strong></div>
        </div>
        <p className="capacity-assumptions">Based on {dailyEnergyWh.toLocaleString(undefined, { maximumFractionDigits: 2 })} Wh/day, {designPsh?.toFixed(2)} Design PSH, and a {Math.round(PERFORMANCE_RATIO * 100)}% performance ratio.</p>
        <details className="calculation-details">
          <summary>View Calculation Details</summary>
          <div className="calculation-steps">
            <section>
              <h3>Step 1: Required Solar Panel Capacity</h3>
              <p className="calculation-formula">P<sub>solar</sub> = E<sub>daily</sub> / (PSH × PR)</p>
              <p>P<sub>solar</sub> = {dailyEnergyWh.toLocaleString(undefined, { maximumFractionDigits: 2 })} / ({(designPsh ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} × {PERFORMANCE_RATIO.toFixed(2)})</p>
              <p>P<sub>solar</sub> = {result.requiredWp.toLocaleString(undefined, { maximumFractionDigits: 1 })} W</p>
            </section>
            <section>
              <h3>Step 2: Recommended Number of Solar Panels</h3>
              <p className="calculation-formula">N = CEILING(P<sub>solar</sub> / W<sub>panel</sub>)</p>
              <p>N = CEILING({result.requiredWp.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {panelWatts.toLocaleString(undefined, { maximumFractionDigits: 2 })})</p>
              <p>N = {result.panelCount} {result.panelCount === 1 ? 'panel' : 'panels'}</p>
            </section>
            <section>
              <h3>Step 3: Total Installed Solar Capacity</h3>
              <p className="calculation-formula">P<sub>installed</sub> = N × W<sub>panel</sub></p>
              <p>P<sub>installed</sub> = {result.panelCount} × {panelWatts.toLocaleString(undefined, { maximumFractionDigits: 2 })} W</p>
              <p>P<sub>installed</sub> = {result.installedWp.toLocaleString(undefined, { maximumFractionDigits: 2 })} W</p>
            </section>
          </div>
        </details>
      </div>}
    </section>
  );
}

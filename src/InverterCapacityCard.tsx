import { useEffect, useMemo } from 'react';

type ApplianceLoad = { name: string; quantity: string; watts: string };
export type InverterResult = { totalLoadW: number; requiredW: number; recommendedW: number };
type Props = { appliances: ApplianceLoad[]; onResultChange?: (result: InverterResult | null) => void };

const DESIGN_MARGIN = 0.25;
const STANDARD_INVERTER_SIZES = [300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000];

function formatWatts(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function InverterCapacityCard({ appliances, onResultChange }: Props) {
  const result = useMemo(() => {
    const validLoads = appliances.flatMap((appliance) => {
      const quantity = Number(appliance.quantity);
      const watts = Number(appliance.watts);
      if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(watts) || watts <= 0) return [];
      return [{ name: appliance.name.trim() || 'Unnamed appliance', quantity, watts, load: quantity * watts }];
    });
    const totalLoadW = validLoads.reduce((sum, appliance) => sum + appliance.load, 0);
    const requiredW = totalLoadW * (1 + DESIGN_MARGIN);
    if (![totalLoadW, requiredW].every(Number.isFinite) || totalLoadW <= 0) return null;
    const recommendedW = STANDARD_INVERTER_SIZES.find((size) => size >= requiredW)
      ?? Math.ceil(requiredW / 1000) * 1000;
    return { validLoads, totalLoadW, requiredW, recommendedW };
  }, [appliances]);
  useEffect(() => { onResultChange?.(result); }, [result, onResultChange]);

  return (
    <section className="capacity-card inverter-card" aria-labelledby="inverter-capacity-heading">
      <header className="capacity-card-heading">
        <div>
          <h2 id="inverter-capacity-heading">Inverter Capacity Estimation</h2>
          <p>Estimate an inverter size from your connected appliance load.</p>
        </div>
      </header>

      <p className="inverter-assumption">This initial estimate assumes all listed appliances may operate simultaneously.</p>
      {result ? <>
        <div className="capacity-results" aria-live="polite">
          <div className="capacity-result-grid inverter-result-grid">
            <div><span>Total connected load</span><strong>{formatWatts(result.totalLoadW)} W</strong></div>
            <div><span>Design margin</span><strong>25%</strong></div>
            <div><span>Required inverter capacity</span><strong>{formatWatts(result.requiredW)} W</strong></div>
            <div><span>Recommended inverter size</span><strong>{formatWatts(result.recommendedW)} W <small>({formatWatts(result.recommendedW / 1000)} kW)</small></strong></div>
          </div>
          <details className="calculation-details">
            <summary>View Calculation Details</summary>
            <div className="calculation-steps">
              <section>
                <h3>Total Connected Load</h3>
                <p className="calculation-formula">P<sub>load</sub> = Sum of (Quantity × Appliance Wattage)</p>
                {result.validLoads.map((appliance, index) => <p key={`${appliance.name}-${index}`}>{appliance.name}: {appliance.quantity} × {formatWatts(appliance.watts)} W = {formatWatts(appliance.load)} W</p>)}
                <p>P<sub>load</sub> = {result.validLoads.map((appliance) => formatWatts(appliance.load)).join(' + ')} = {formatWatts(result.totalLoadW)} W</p>
              </section>
              <section>
                <h3>Required Inverter Capacity</h3>
                <p className="calculation-formula">P<sub>inverter</sub> = P<sub>load</sub> × 1.25</p>
                <p>P<sub>inverter</sub> = {formatWatts(result.totalLoadW)} × 1.25 = {formatWatts(result.requiredW)} W</p>
              </section>
              <section>
                <h3>Recommended Inverter Size</h3>
                <p>Choose the next standard size equal to or greater than the calculated requirement.</p>
                <p>{formatWatts(result.recommendedW)} W = {formatWatts(result.recommendedW / 1000)} kW</p>
              </section>
            </div>
          </details>
        </div>
      </> : <p className="capacity-hint" role="status">Enter a positive quantity and power rating for at least one appliance to estimate inverter capacity.</p>}

      <div className="inverter-considerations">
        <p>The 25% margin does not account for motor starting or other surge loads. Do not use this initial estimate as a final inverter selection.</p>
        <p>Final selection must consider battery voltage, inverter input voltage, output voltage, continuous rating, and surge rating.</p>
      </div>
    </section>
  );
}

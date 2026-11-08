import { useCallback, useMemo, useState } from 'react';
import SolarLocationCard from './SolarLocationCard';
import SolarPanelCapacityCard from './SolarPanelCapacityCard';
import InverterCapacityCard from './InverterCapacityCard';
import BatteryStorageCapacityCard from './BatteryStorageCapacityCard';
import SystemSummaryCard from './SystemSummaryCard';
import type { Place, SolarResult } from './SolarLocationCard';
import type { SolarPanelResult } from './SolarPanelCapacityCard';
import type { InverterResult } from './InverterCapacityCard';
import type { BatteryResult, BatterySettings } from './BatteryStorageCapacityCard';

type Appliance = {
  id: number;
  name: string;
  quantity: string;
  watts: string;
  hours: string;
};

const createAppliance = (id: number): Appliance => ({ id, name: '', quantity: '1', watts: '', hours: '' });

function getEnergy(appliance: Appliance) {
  const quantity = Number(appliance.quantity);
  const watts = Number(appliance.watts);
  const hours = Number(appliance.hours);
  if (!Number.isInteger(quantity) || quantity <= 0 || watts <= 0 || hours <= 0 || hours > 24) return 0;
  return quantity * watts * hours;
}

export default function SolarAssessmentPage() {
  const [appliances, setAppliances] = useState<Appliance[]>([createAppliance(1)]);
  const [designPsh, setDesignPsh] = useState<number | null>(null);
  const [locationData, setLocationData] = useState<{ place: Place | null; solar: SolarResult | null }>({ place: null, solar: null });
  const [panelData, setPanelData] = useState<{ result: SolarPanelResult | null; watts: number | null }>({ result: null, watts: null });
  const [inverterResult, setInverterResult] = useState<InverterResult | null>(null);
  const [batteryData, setBatteryData] = useState<{ result: BatteryResult | null; settings: BatterySettings }>({ result: null, settings: { voltage: 48, chemistry: 'LiFePO4', backupDays: 1, reservePercent: 30 } });
  const totalEnergy = useMemo(() => appliances.reduce((sum, appliance) => sum + getEnergy(appliance), 0), [appliances]);
  const totalKwh = totalEnergy / 1000;
  const handleDesignPshChange = useCallback((value: number | null) => setDesignPsh(value), []);
  const handleLocationChange = useCallback((place: Place | null, solar: SolarResult | null) => setLocationData({ place, solar }), []);
  const handlePanelResult = useCallback((result: SolarPanelResult | null, watts: number | null) => setPanelData({ result, watts }), []);
  const handleInverterResult = useCallback((result: InverterResult | null) => setInverterResult(result), []);
  const handleBatteryResult = useCallback((result: BatteryResult | null, settings: BatterySettings) => setBatteryData({ result, settings }), []);

  function updateAppliance(id: number, field: keyof Omit<Appliance, 'id'>, value: string) {
    setAppliances((current) => current.map((appliance) => appliance.id === id ? { ...appliance, [field]: value } : appliance));
  }

  function updateNumeric(id: number, field: 'quantity' | 'watts' | 'hours', value: string) {
    if (value === '') {
      updateAppliance(id, field, value);
      return;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return;
    if (field === 'quantity' && !Number.isInteger(number)) return;
    if (field === 'hours' && number > 24) return;
    updateAppliance(id, field, value);
  }

  return (
    <main className="solar-assessment-page">
      <div className="assessment-shell">
        <header className="calculator-header">
          <p className="calculator-eyebrow">SOLAR SOLUTION PH</p>
          <h1>Device Base Assessment</h1>
          <p className="calculator-intro">List the appliances you use at home to estimate your daily energy needs.</p>
        </header>

        <div className="assessment-content-grid">
        <div className="location-summary-column">
          <SolarLocationCard onDesignPshChange={handleDesignPshChange} onLocationChange={handleLocationChange} />
          <SystemSummaryCard place={locationData.place} solar={locationData.solar} energyWh={totalEnergy} applianceCount={appliances.reduce((sum, appliance) => sum + (Number.isInteger(Number(appliance.quantity)) && Number(appliance.quantity) > 0 && (appliance.name.trim() || Number(appliance.watts) > 0) ? Number(appliance.quantity) : 0), 0)} connectedLoadW={inverterResult?.totalLoadW ?? 0} panelWatts={panelData.watts} panel={panelData.result} inverter={inverterResult} battery={batteryData.result} batterySettings={batteryData.settings} />
        </div>
        <div className="energy-assessment-column">
        <section className="appliance-card" aria-labelledby="appliance-heading">
          <div className="appliance-card-heading">
            <div>
              <h2 id="appliance-heading">Appliance energy calculator</h2>
              <p>Enter the quantity, power rating, and typical hours of use per day.</p>
            </div>
          </div>

          <div className="appliance-list">
            {appliances.map((appliance, index) => {
              const energy = getEnergy(appliance);
              const baseId = `appliance-${appliance.id}`;
              return (
                <article className="appliance-row" key={appliance.id}>
                  <div className="appliance-row-top">
                    <h3>Appliance {index + 1}</h3>
                    <button className="remove-appliance" type="button" onClick={() => setAppliances((current) => current.filter((item) => item.id !== appliance.id))} aria-label={`Remove appliance ${index + 1}`}>
                      <span>Remove</span>
                    </button>
                  </div>
                  <div className="appliance-fields">
                    <label className="field-name" htmlFor={`${baseId}-name`}>Appliance name
                      <input id={`${baseId}-name`} type="text" value={appliance.name} onChange={(event) => updateAppliance(appliance.id, 'name', event.target.value)} placeholder="e.g. Refrigerator" required />
                    </label>
                    <label htmlFor={`${baseId}-quantity`}>Quantity
                      <input id={`${baseId}-quantity`} type="number" min="1" step="1" inputMode="numeric" value={appliance.quantity} onChange={(event) => updateNumeric(appliance.id, 'quantity', event.target.value)} aria-label={`Appliance ${index + 1} quantity`} />
                    </label>
                    <label htmlFor={`${baseId}-watts`}>Power rating (watts)
                      <input id={`${baseId}-watts`} type="number" min="0.01" step="any" inputMode="decimal" value={appliance.watts} onChange={(event) => updateNumeric(appliance.id, 'watts', event.target.value)} placeholder="e.g. 150" aria-label={`Appliance ${index + 1} power rating in watts`} />
                    </label>
                    <label htmlFor={`${baseId}-hours`}>Hours per day
                      <input id={`${baseId}-hours`} type="number" min="0.01" max="24" step="any" inputMode="decimal" value={appliance.hours} onChange={(event) => updateNumeric(appliance.id, 'hours', event.target.value)} placeholder="0–24" aria-label={`Appliance ${index + 1} hours per day`} />
                    </label>
                  </div>
                  <div className="appliance-energy"><span>Daily energy</span><strong>{energy.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>Wh/day</small></strong></div>
                </article>
              );
            })}
          </div>

          <div className="total-energy-result" aria-live="polite">
            <span>Total Daily Energy</span>
            <strong>{totalEnergy.toLocaleString(undefined, { maximumFractionDigits: 2 })} <small>Wh/day</small></strong>
            <strong>{totalKwh.toLocaleString(undefined, { maximumFractionDigits: 3 })} <small>kWh/day</small></strong>
          </div>

          <button className="add-appliance" type="button" onClick={() => setAppliances((current) => [...current, createAppliance(Math.max(0, ...current.map((item) => item.id)) + 1)])}>
            Add another appliance
          </button>
        </section>
        <SolarPanelCapacityCard dailyEnergyWh={totalEnergy} designPsh={designPsh} onResultChange={handlePanelResult} />
        <InverterCapacityCard appliances={appliances} onResultChange={handleInverterResult} />
        <BatteryStorageCapacityCard dailyEnergyWh={totalEnergy} onResultChange={handleBatteryResult} />
        </div>
        </div>
        <footer className="calculator-footer">Solar Solution PH <span>•</span> Home energy estimate</footer>
      </div>
    </main>
  );
}

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { SolarIrradiationAssessment } from './nasaPowerService';
import SolarPanelSizing from './SolarPanelSizing';
import {
  calculateDeviceAssessment,
  calculateDeviceConsumption,
  calculateElectricityBillAssessment,
  validateDeviceEntry,
  validateElectricityBill,
  type AssessmentMethod,
  type BillField,
  type DeviceEntry,
  type DeviceField,
  type ElectricityBillEntry,
  type StandardizedConsumption,
} from './assessmentCalculations';
import SolarLocationAssessment from './SolarLocationAssessment';
import InverterSizing from './InverterSizing';
import type { InverterSizingResult } from './assessmentCalculations';

const deviceFieldDefinitions: {
  field: DeviceField;
  label: string;
  type: 'text' | 'number';
  placeholder: string;
}[] = [
  { field: 'name', label: 'Device name', type: 'text', placeholder: 'e.g. Refrigerator' },
  { field: 'powerWatts', label: 'Power (W)', type: 'number', placeholder: 'e.g. 150' },
  { field: 'quantity', label: 'Quantity', type: 'number', placeholder: 'e.g. 1' },
  { field: 'hoursPerDay', label: 'Hours per day', type: 'number', placeholder: 'e.g. 8' },
  { field: 'simultaneousQuantity', label: 'Quantity used simultaneously', type: 'number', placeholder: 'e.g. 1' },
  { field: 'startingPowerWatts', label: 'Starting / surge power (W per unit)', type: 'number', placeholder: 'Optional; blank uses running power' },
];

function newDevice(id: string): DeviceEntry {
  return { id, name: '', powerWatts: '', quantity: '1', hoursPerDay: '', simultaneousQuantity: '1', startingPowerWatts: '' };
}

function formatKwh(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ErrorMessage({ id, message }: { id: string; message?: string }) {
  return message ? <span className="assessment-error" id={id}>{message}</span> : null;
}

function ConsumptionSummary({
  result,
  children,
}: {
  result: StandardizedConsumption | null;
  children: ReactNode;
}) {
  return (
    <section
      className="consumption-summary"
      aria-live="polite"
      data-assessment-result={result ? JSON.stringify(result) : undefined}
    >
      {children}
    </section>
  );
}

export default function SolarEnergyAssessment() {
  const [method, setMethod] = useState<AssessmentMethod>('device');
  const [solarResult, setSolarResult] = useState<SolarIrradiationAssessment | null>(null);
  const [inverterResult, setInverterResult] = useState<InverterSizingResult | null>(null);
  const [devices, setDevices] = useState<DeviceEntry[]>([newDevice('device-1')]);
  const [bill, setBill] = useState<ElectricityBillEntry>({ consumptionKwh: '', billingDays: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [deviceSubmitted, setDeviceSubmitted] = useState(false);
  const [billSubmitted, setBillSubmitted] = useState(false);
  const nextDeviceId = useRef(2);
  const handleInverterResult = useCallback((result: InverterSizingResult | null) => {
    setInverterResult((current) => JSON.stringify(current) === JSON.stringify(result) ? current : result);
  }, []);

  const deviceResult = calculateDeviceAssessment(devices);
  const billResult = calculateElectricityBillAssessment(bill);
  function markTouched(key: string) {
    setTouched((current) => ({ ...current, [key]: true }));
  }

  function updateDevice(id: string, field: DeviceField, value: string) {
    setDevices((current) => current.map((device) => {
      if (device.id !== id) return device;
      if (field === 'quantity') {
        const nextQuantity = Number(value);
        const currentSimultaneous = Number(device.simultaneousQuantity);
        return {
          ...device,
          quantity: value,
          simultaneousQuantity: Number.isInteger(nextQuantity) && nextQuantity >= 1
            ? String(Math.min(Number.isInteger(currentSimultaneous) ? currentSimultaneous : nextQuantity, nextQuantity))
            : device.simultaneousQuantity,
        };
      }
      if (field === 'simultaneousQuantity') {
        const nextSimultaneous = Number(value);
        const quantity = Number(device.quantity);
        return { ...device, simultaneousQuantity: Number.isInteger(nextSimultaneous) && Number.isInteger(quantity) && nextSimultaneous > quantity
          ? String(quantity) : value };
      }
      return { ...device, [field]: value };
    }));
  }

  function updateBill(field: BillField, value: string) {
    setBill((current) => ({ ...current, [field]: value }));
  }

  function addDevice() {
    const id = `device-${nextDeviceId.current++}`;
    setDevices((current) => [...current, newDevice(id)]);
  }

  function removeDevice(id: string) {
    setDevices((current) => current.filter((device) => device.id !== id));
  }

  function handleDeviceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeviceSubmitted(true);
  }

  function handleBillSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBillSubmitted(true);
  }

  return (
    <div className="assessment-workspace">
      <div className="assessment-method-toggle" role="group" aria-label="Assessment method">
        <button
          id="device-assessment-tab"
          type="button"
          aria-pressed={method === 'device'}
          className={method === 'device' ? 'is-selected' : ''}
          onClick={() => setMethod('device')}
        >
          Device-Based Assessment
        </button>
        <button
          id="bill-assessment-tab"
          type="button"
          aria-pressed={method === 'electricity_bill'}
          className={method === 'electricity_bill' ? 'is-selected' : ''}
          onClick={() => setMethod('electricity_bill')}
        >
          Electricity Bill Assessment
        </button>
      </div>

      <div id="device-assessment-panel" aria-labelledby="device-assessment-tab" hidden={method !== 'device'} data-inverter-result={inverterResult ? JSON.stringify(inverterResult) : undefined}>
          <form className="assessment-form" noValidate onSubmit={handleDeviceSubmit}>
            <div className="assessment-section-heading">
              <div>
                <h3>Device consumption</h3>
                <p>List the devices you want your solar system to support.</p>
              </div>
              <button className="add-device-button" type="button" onClick={addDevice}>
                <span aria-hidden="true">+</span> Add device
              </button>
            </div>

            {devices.length === 0 ? (
              <p className="assessment-empty-state">Add at least one device to assess consumption.</p>
            ) : (
              <div className="device-list">
                {devices.map((device, index) => {
                  const errors = validateDeviceEntry(device);
                  const deviceConsumption = calculateDeviceConsumption(device);

                  return (
                    <fieldset className="device-card" key={device.id}>
                      <legend className="visually-hidden">Device {index + 1}</legend>
                      <div className="device-card-heading">
                        <span>Device {index + 1}</span>
                        <button
                          className="remove-device-button"
                          type="button"
                          aria-label={`Remove device ${index + 1}`}
                          onClick={() => removeDevice(device.id)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="device-fields">
                        {deviceFieldDefinitions.map(({ field, label, type, placeholder }) => {
                          const key = `${device.id}-${field}`;
                          const showError = deviceSubmitted || touched[key];
                          const errorId = `${key}-error`;

                          return (
                            <label className={`assessment-field device-field device-field-${field}`} key={field} htmlFor={key}>
                              <span>{label}</span>
                              <input
                                id={key}
                                type={type}
                                value={device[field]}
                                placeholder={placeholder}
                                required
                                min={field === 'hoursPerDay' || field === 'powerWatts' || field === 'startingPowerWatts' ? 0 : field === 'quantity' ? 1 : field === 'simultaneousQuantity' ? 0 : undefined}
                                max={field === 'hoursPerDay' ? 24 : field === 'simultaneousQuantity' ? Number(device.quantity) : undefined}
                                step={field === 'quantity' || field === 'simultaneousQuantity' ? 1 : 'any'}
                                aria-invalid={showError && Boolean(errors[field])}
                                aria-describedby={showError && errors[field] ? errorId : undefined}
                                onChange={(event) => updateDevice(device.id, field, event.target.value)}
                                onBlur={() => markTouched(key)}
                              />
                              <ErrorMessage id={errorId} message={showError ? errors[field] : undefined} />
                            </label>
                          );
                        })}
                      </div>
                      {deviceConsumption !== null && (
                        <p className="device-consumption">
                          Daily energy: <strong>{formatKwh(deviceConsumption)} kWh</strong>
                        </p>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            )}

            <ConsumptionSummary result={deviceResult}>
              <h3>Consumption summary</h3>
              {deviceResult ? (
                <div className="summary-metrics">
                  <Metric label="Total daily consumption" value={`${formatKwh(deviceResult.dailyConsumptionKwh)} kWh`} />
                  <Metric label="Estimated 30-day consumption" value={`${formatKwh(deviceResult.estimated30DayConsumptionKwh)} kWh`} />
                </div>
              ) : (
                <p className="summary-prompt">Complete every device field with valid values to calculate consumption.</p>
              )}
            </ConsumptionSummary>
          </form>
          <SolarLocationAssessment onResultChange={setSolarResult} />
          <SolarPanelSizing consumption={deviceResult} irradiation={solarResult} />
      </div>
      <div id="bill-assessment-panel" aria-labelledby="bill-assessment-tab" hidden={method !== 'electricity_bill'}>
          <form className="assessment-form bill-form" noValidate onSubmit={handleBillSubmit}>
            <div className="assessment-section-heading">
              <div>
                <h3>Electricity bill details</h3>
                <p>Use the consumption and billing period shown on your electricity bill.</p>
              </div>
            </div>

            <div className="bill-fields">
              {([
                { field: 'consumptionKwh', label: 'Electricity consumption (kWh)', placeholder: 'e.g. 320', min: 0, step: 'any' },
                { field: 'billingDays', label: 'Billing period (days)', placeholder: 'e.g. 30', min: 1, step: 1 },
              ] as const).map(({ field, label, placeholder, min, step }) => {
                const showError = billSubmitted || touched[`bill-${field}`];
                const errorId = `bill-${field}-error`;
                const errors = validateElectricityBill(bill);

                return (
                  <label className="assessment-field" key={field} htmlFor={`bill-${field}`}>
                    <span>{label}</span>
                    <input
                      id={`bill-${field}`}
                      type="number"
                      value={bill[field]}
                      placeholder={placeholder}
                      required
                      min={min}
                      step={step}
                      aria-invalid={showError && Boolean(errors[field])}
                      aria-describedby={showError && errors[field] ? errorId : undefined}
                      onChange={(event) => updateBill(field, event.target.value)}
                      onBlur={() => markTouched(`bill-${field}`)}
                    />
                    <ErrorMessage id={errorId} message={showError ? errors[field] : undefined} />
                  </label>
                );
              })}
            </div>

            <ConsumptionSummary result={billResult}>
              <h3>Consumption summary</h3>
              {billResult ? (
                <>
                  <div className="summary-metrics bill-summary-metrics">
                    <Metric label="Entered consumption" value={`${formatKwh(Number(bill.consumptionKwh))} kWh`} />
                    <Metric label="Billing period" value={`${bill.billingDays} days`} />
                    <Metric label="Average daily consumption" value={`${formatKwh(billResult.dailyConsumptionKwh)} kWh`} />
                    <Metric label="Estimated 30-day consumption" value={`${formatKwh(billResult.estimated30DayConsumptionKwh)} kWh`} />
                  </div>
                </>
              ) : (
                <p className="summary-prompt">Enter valid consumption and billing period values to calculate your estimate.</p>
              )}
            </ConsumptionSummary>
          </form>
      </div>
      <InverterSizing
        assessmentMethod={method}
        devices={devices}
        onDeviceFieldChange={(id, field, value) => updateDevice(id, field, value)}
        onResultChange={handleInverterResult}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  fetchSolarIrradiation,
  NASA_POWER_SOURCE,
  validateSolarCoordinates,
  type SolarIrradiationAssessment as SolarIrradiationResult,
} from './nasaPowerService';

interface SolarLocationAssessmentProps {
  onResultChange: (result: SolarIrradiationResult | null) => void;
}

function formatIrradiation(value: number): string {
  return value.toFixed(2);
}

export default function SolarLocationAssessment({ onResultChange }: SolarLocationAssessmentProps) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [result, setResult] = useState<SolarIrradiationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({ latitude: false, longitude: false });
  const requestController = useRef<AbortController | null>(null);

  const validation = validateSolarCoordinates(latitude, longitude);

  useEffect(() => () => requestController.current?.abort(), []);

  function updateCoordinates(field: 'latitude' | 'longitude', value: string) {
    requestController.current?.abort();
    setLoading(false);
    setResult(null);
    onResultChange(null);
    setRequestError(null);
    if (field === 'latitude') setLatitude(value);
    else setLongitude(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setTouched({ latitude: true, longitude: true });
    const { errors, latitudeValue, longitudeValue } = validateSolarCoordinates(latitude, longitude);
    if (Object.keys(errors).length > 0) return;

    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setResult(null);
    onResultChange(null);
    setRequestError(null);

    try {
      const assessment = await fetchSolarIrradiation(latitudeValue, longitudeValue, controller.signal);
      if (!controller.signal.aborted) {
        setResult(assessment);
        onResultChange(assessment);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setRequestError(error instanceof Error ? error.message : 'Unable to retrieve NASA POWER data. Please retry.');
      setResult(null);
      onResultChange(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const latitudeError = (submitted || touched.latitude) ? validation.errors.latitude : undefined;
  const longitudeError = (submitted || touched.longitude) ? validation.errors.longitude : undefined;

  return (
    <section
      className="solar-location-section"
      aria-labelledby="solar-location-heading"
      data-solar-irradiation-result={result ? JSON.stringify(result) : undefined}
    >
      <div className="solar-location-heading">
        <div>
          <h3 id="solar-location-heading">Solar Location &amp; Irradiation Assessment</h3>
          <p>Use your installation location to retrieve historical daily sunlight data.</p>
        </div>
      </div>

      <form className="solar-location-form" noValidate onSubmit={handleSubmit}>
        <div className="solar-coordinate-fields">
          <label className="assessment-field" htmlFor="solar-latitude">
            <span>Latitude (decimal degrees)</span>
            <input
              id="solar-latitude"
              type="number"
              min="-90"
              max="90"
              step="any"
              value={latitude}
              placeholder="e.g. 14.5995"
              required
              aria-invalid={Boolean(latitudeError)}
              aria-describedby={latitudeError ? 'solar-latitude-error' : undefined}
              onChange={(event) => updateCoordinates('latitude', event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, latitude: true }))}
            />
            {latitudeError && <span className="assessment-error" id="solar-latitude-error">{latitudeError}</span>}
          </label>
          <label className="assessment-field" htmlFor="solar-longitude">
            <span>Longitude (decimal degrees)</span>
            <input
              id="solar-longitude"
              type="number"
              min="-180"
              max="180"
              step="any"
              value={longitude}
              placeholder="e.g. 120.9842"
              required
              aria-invalid={Boolean(longitudeError)}
              aria-describedby={longitudeError ? 'solar-longitude-error' : undefined}
              onChange={(event) => updateCoordinates('longitude', event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, longitude: true }))}
            />
            {longitudeError && <span className="assessment-error" id="solar-longitude-error">{longitudeError}</span>}
          </label>
        </div>

        <p className="coordinate-help">
          In Google Maps, right-click (or long-press) the installation location and copy the coordinates shown.
        </p>

        <div className="solar-request-row">
          <button className="solar-request-button" type="submit" disabled={loading}>
            {loading ? 'Retrieving NASA data…' : requestError ? 'Retry solar data request' : 'Get solar irradiation data'}
          </button>
          {loading && <span className="solar-loading" role="status">Requesting the latest five complete calendar years…</span>}
        </div>
      </form>

      {requestError && (
        <p className="solar-request-error" role="alert">{requestError}</p>
      )}

      {result && <IrradiationResults result={result} />}
    </section>
  );
}

function IrradiationResults({ result }: { result: SolarIrradiationResult }) {
  return (
    <div className="irradiation-results">
      <div className="irradiation-results-heading">
        <div>
          <h4>Solar irradiation results</h4>
          <p>Installation coordinates: {result.latitude}, {result.longitude}</p>
        </div>
      </div>

      <div className="irradiation-summary">
        <div className="irradiation-stat">
          <span>Annual average daily irradiation</span>
          <strong>{formatIrradiation(result.annualAverageIrradiation)} <small>kWh/m²/day</small></strong>
        </div>
        <div className="irradiation-stat">
          <span>Lowest-irradiation month</span>
          <strong>{result.lowestIrradiationMonth ?? 'Unavailable'}</strong>
          <small>
            {result.lowestMonthAverageIrradiation === null
              ? 'A complete set of monthly data is needed to identify the lowest month.'
              : `${formatIrradiation(result.lowestMonthAverageIrradiation)} kWh/m²/day average`}
          </small>
        </div>
        <div className="irradiation-stat irradiation-stat-design">
          <span>Conservative design irradiation</span>
          {result.solarDesignIrradiation === null ? (
            <strong>Unavailable</strong>
          ) : (
            <strong>{formatIrradiation(result.solarDesignIrradiation)} <small>kWh/m²/day</small></strong>
          )}
          <small>
            {result.solarDesignIrradiation === null
              ? 'Cannot prepare a design value without averages for all 12 months.'
              : 'Set to the lowest monthly average daily irradiation.'}
          </small>
        </div>
      </div>

      <div className="monthly-irradiation">
        <div className="monthly-irradiation-heading">
          <h4>Monthly average daily irradiation</h4>
          <span>kWh/m²/day · averaged across the data period</span>
        </div>
        <div className="irradiation-table-wrap">
          <table>
            <thead>
              <tr><th scope="col">Month</th><th scope="col">Average daily irradiation</th><th scope="col">Valid daily values</th></tr>
            </thead>
            <tbody>
              {result.monthlyAverageIrradiation.map((month) => (
                <tr key={month.month} className={result.lowestIrradiationMonth !== null && month.month === result.lowestIrradiationMonth ? 'lowest-irradiation-month' : undefined}>
                  <th scope="row">{month.month}</th>
                  <td>{month.averageDailyIrradiation === null ? 'No data' : formatIrradiation(month.averageDailyIrradiation)}</td>
                  <td>{month.validDayCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="irradiation-provenance">
        <p>
          <strong>Data source:</strong>{' '}
          <a href="https://power.larc.nasa.gov/docs/services/api/temporal/daily/" target="_blank" rel="noreferrer">
            {result.dataSource}
          </a>
        </p>
        <p>
          <strong>Requested period:</strong> {result.dataPeriod.requestedStart} to {result.dataPeriod.requestedEnd}
          <span> · </span>
          <strong>Available observations:</strong> {result.dataPeriod.firstObservation} to {result.dataPeriod.lastObservation}
          <span> ({result.dataPeriod.validDailyObservations.toLocaleString()} valid daily values)</span>
        </p>
        <p>Monthly figures are averages per day, not monthly accumulated irradiation.</p>
      </div>
    </div>
  );
}

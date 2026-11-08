import { FormEvent, useEffect, useState } from 'react';

export type Place = { label: string; city: string; region: string; country: string; latitude: number; longitude: number; method: 'GPS' | 'Manual' };
type MonthResult = { month: number; average: number | null };
export type SolarResult = { months: MonthResult[]; annual: number; design: number; period: string; retrieved: string };
type PhotonFeature = { geometry?: { coordinates?: [number, number] }; properties?: { name?: string; city?: string; district?: string; county?: string; state?: string; country?: string } };
type PhotonResponse = { features?: PhotonFeature[] };
type PowerResponse = { properties?: { parameter?: { ALLSKY_SFC_SW_DWN?: Record<string, number> } }; messages?: string[] };

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const resultCache = new Map<string, SolarResult>();
const pendingRequests = new Map<string, Promise<SolarResult>>();

function periodForNow() {
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 4;
  return { startYear, endYear, start: `${startYear}0101`, end: `${endYear}1231` };
}

function placeFromFeature(feature: PhotonFeature, method: Place['method']): Place | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return null;
  const props = feature.properties ?? {};
  const city = props.city ?? props.name ?? props.district ?? props.county ?? '';
  const region = props.state ?? props.county ?? '';
  const country = props.country ?? '';
  return { label: [city, region, country].filter(Boolean).join(', ') || 'Selected coordinates', city, region, country, longitude: coordinates[0], latitude: coordinates[1], method };
}

async function fetchSolarData(place: Place): Promise<SolarResult> {
  const { startYear, endYear, start, end } = periodForNow();
  const cacheKey = `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}:${start}:${end}`;
  const cached = resultCache.get(cacheKey);
  if (cached) return cached;
  const inFlight = pendingRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const request = (async () => {
    const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
    url.search = new URLSearchParams({
      parameters: 'ALLSKY_SFC_SW_DWN', community: 'RE', longitude: String(place.longitude), latitude: String(place.latitude), start, end, format: 'JSON',
    }).toString();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NASA POWER returned HTTP ${response.status}.`);
    const payload = await response.json() as PowerResponse;
    const readings = payload.properties?.parameter?.ALLSKY_SFC_SW_DWN;
    if (!readings || typeof readings !== 'object') throw new Error(payload.messages?.join(' ') || 'NASA POWER did not return daily irradiation data for this location.');

    const monthlySums = Array.from({ length: 12 }, () => 0);
    const monthlyCounts = Array.from({ length: 12 }, () => 0);
    let annualSum = 0;
    let annualCount = 0;
    for (const [date, rawValue] of Object.entries(readings)) {
      const value = Number(rawValue);
      if (!/^\d{8}$/.test(date) || !Number.isFinite(value) || value < 0 || value > 20) continue;
      const year = Number(date.slice(0, 4));
      const month = Number(date.slice(4, 6)) - 1;
      if (year < startYear || year > endYear || month < 0 || month > 11) continue;
      monthlySums[month] += value;
      monthlyCounts[month] += 1;
      annualSum += value;
      annualCount += 1;
    }
    if (!annualCount) throw new Error('NASA POWER returned no valid daily irradiation readings for the selected period.');
    const months = monthlySums.map((sum, month) => ({ month, average: monthlyCounts[month] ? sum / monthlyCounts[month] : null }));
    const validMonthly = months.map(({ average }) => average).filter((value): value is number => value !== null);
    const data: SolarResult = {
      months,
      annual: annualSum / annualCount,
      design: Math.min(...validMonthly),
      period: `${startYear}–${endYear}`,
      retrieved: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    };
    resultCache.set(cacheKey, data);
    return data;
  })();
  pendingRequests.set(cacheKey, request);
  try { return await request; } finally { pendingRequests.delete(cacheKey); }
}

async function reverseGeocode(latitude: number, longitude: number): Promise<Place | null> {
  const url = new URL('https://photon.komoot.io/reverse');
  url.search = new URLSearchParams({ lat: String(latitude), lon: String(longitude), lang: 'en' }).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Location lookup returned HTTP ${response.status}.`);
  const payload = await response.json() as PhotonResponse;
  return payload.features?.[0] ? placeFromFeature(payload.features[0], 'GPS') : null;
}

export default function SolarLocationCard({ onDesignPshChange, onLocationChange }: { onDesignPshChange: (value: number | null) => void; onLocationChange?: (place: Place | null, solar: SolarResult | null) => void }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [mode, setMode] = useState<'GPS' | 'Manual' | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Place[]>([]);
  const [solar, setSolar] = useState<SolarResult | null>(null);
  const [solarStatus, setSolarStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [locationStatus, setLocationStatus] = useState('');
  const [locationError, setLocationError] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => { onLocationChange?.(place, solarStatus === 'success' ? solar : null); }, [place, solar, solarStatus, onLocationChange]);

  useEffect(() => {
    if (!place) { setSolar(null); setSolarStatus('idle'); onDesignPshChange(null); return; }
    let current = true;
    onDesignPshChange(null);
    setSolarStatus('loading');
    setSolar(null);
    fetchSolarData(place).then((result) => {
      if (!current) return;
      setSolar(result);
      setSolarStatus('success');
      onDesignPshChange(result.design);
    }).catch((error: unknown) => {
      if (!current) return;
      setSolarStatus('error');
      onDesignPshChange(null);
      setLocationError(error instanceof Error ? error.message : 'Unable to retrieve NASA POWER data. Check your connection and retry.');
    });
    return () => { current = false; };
  }, [place, onDesignPshChange]);

  function detectLocation() {
    setLocationError('');
    setLocationStatus('Requesting your location…');
    if (!navigator.geolocation) {
      setLocationStatus('');
      setLocationError('Location detection is not supported by this browser. Search for your location instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const gpsPlace: Place = { label: 'Detected location', city: '', region: '', country: '', latitude, longitude, method: 'GPS' };
      setMode('GPS');
      setManualMode(false);
      setPlace(gpsPlace);
      setLocationStatus('Coordinates detected. Looking up the nearby place…');
      try {
        const namedPlace = await reverseGeocode(latitude, longitude);
        if (namedPlace) setPlace(namedPlace);
        setLocationStatus(namedPlace ? 'Location detected successfully.' : 'Coordinates detected; place details are unavailable.');
      } catch {
        setLocationStatus('Coordinates detected; place details could not be loaded.');
      }
    }, (error) => {
      setLocationStatus('');
      if (error.code === error.PERMISSION_DENIED) setLocationError('Location permission was denied. You can allow it in browser settings or search for a location manually.');
      else if (error.code === error.POSITION_UNAVAILABLE) setLocationError('Your location is unavailable. Try again or search manually.');
      else if (error.code === error.TIMEOUT) setLocationError('Location detection timed out. Try again or search manually.');
      else setLocationError('Unable to detect your location. Try again or search manually.');
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  }

  async function searchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setLocationError('');
    setLocationStatus('Searching for location…');
    try {
      const url = new URL('https://photon.komoot.io/api/');
      url.search = new URLSearchParams({ q: query.trim(), limit: '5', lang: 'en' }).toString();
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Location search returned HTTP ${response.status}.`);
      const payload = await response.json() as PhotonResponse;
      const features = payload.features ?? [];
      if (!features.length) throw new Error('No matching place was found. Check the spelling or try a nearby city or province.');
      const found = features.map((feature) => placeFromFeature(feature, 'Manual')).filter((feature): feature is Place => feature !== null);
      if (!found.length) throw new Error('Search results did not include valid coordinates. Try another location.');
      setCandidates(found);
      setLocationStatus(found.length === 1 ? 'Select the matching location below.' : 'Choose your location from the search results.');
    } catch (error) {
      setLocationStatus('');
      setLocationError(error instanceof Error ? error.message : 'Location search failed. Please try again.');
    } finally { setSearching(false); }
  }

  return (
    <section className="solar-location-card" aria-labelledby="solar-location-heading">
      <header className="location-card-heading">
        <div><h2 id="solar-location-heading">Solar Location &amp; Irradiation</h2><p>Determine your Peak Sun Hours</p></div>
      </header>
      <p className="location-description">Your location helps us estimate the available sunlight in your area and calculate the solar panel capacity required for your household.</p>

      <div className="location-actions">
        <button className="location-detect-button" type="button" onClick={detectLocation} disabled={locationStatus.startsWith('Requesting')}>Detect My Location</button>
        <button className="location-manual-toggle" type="button" onClick={() => { setManualMode((current) => !current); setLocationError(''); setLocationStatus(''); }}>{manualMode ? 'Cancel search' : 'Search manually'}</button>
      </div>

      {manualMode && <form className="location-search-form" onSubmit={searchLocation}>
        <label htmlFor="location-search">City, municipality, or province</label>
        <div className="location-search-controls"><input id="location-search" value={query} onChange={(event) => { setQuery(event.target.value); setCandidates([]); }} placeholder="e.g. Cebu City, Philippines" autoComplete="address-level2" /><button type="submit" disabled={searching || !query.trim()} aria-label={searching ? 'Searching' : 'Search location'}>{searching ? 'Searching…' : 'Search'}</button></div>
        {candidates.length > 0 && <div className="location-search-results" role="listbox" aria-label="Location search results">{candidates.map((candidate, index) => <button type="button" role="option" aria-selected="false" key={`${candidate.latitude},${candidate.longitude}`} onClick={() => { setPlace(candidate); setMode('Manual'); setCandidates([]); setManualMode(false); setLocationStatus('Location selected successfully.'); }}>{candidate.label || `Location result ${index + 1}`}</button>)}</div>}
      </form>}

      {locationStatus && <p className="location-status" role="status">{locationStatus}</p>}
      {locationError && <div className="location-error" role="alert"><span>{locationError}</span>{solarStatus === 'error' && place && <button type="button" onClick={() => { setLocationError(''); setSolarStatus('idle'); setPlace({ ...place }); }}>Retry data request</button>}</div>}

      {place && <div className="selected-location">
        <div className="selected-location-heading"><strong>{place.label}</strong><button type="button" onClick={() => { setPlace(null); setSolar(null); setMode(null); setLocationStatus(''); setLocationError(''); setManualMode(true); }} aria-label="Change selected location">Change</button></div>
        <dl className="location-details">
          <div><dt>City / municipality</dt><dd>{place.city || 'Unavailable'}</dd></div>
          <div><dt>Province / region</dt><dd>{place.region || 'Unavailable'}</dd></div>
          <div><dt>Country</dt><dd>{place.country || 'Unavailable'}</dd></div>
          <div><dt>Latitude</dt><dd>{place.latitude.toFixed(5)}°</dd></div>
          <div><dt>Longitude</dt><dd>{place.longitude.toFixed(5)}°</dd></div>
          <div><dt>Selected by</dt><dd>{mode ?? place.method}</dd></div>
        </dl>
      </div>}

      {solarStatus === 'loading' && <div className="solar-data-loading" role="status">Fetching historical NASA POWER data…</div>}
      {solarStatus === 'error' && <p className="solar-data-error" role="alert">NASA POWER data could not be loaded. No default irradiation value has been substituted.</p>}
      {solarStatus === 'success' && solar && <div className="solar-data-results">
        <div className="design-psh"><span>Design Peak Sun Hours</span><strong>{solar.design.toFixed(2)} <small>hours/day</small></strong><p>Conservative preliminary sizing assumption based on the lowest monthly average.</p></div>
        <div className="solar-data-meta"><div><span>Annual average PSH</span><strong>{solar.annual.toFixed(2)} h/day</strong></div><div><span>Lowest monthly average PSH</span><strong>{solar.design.toFixed(2)} h/day</strong></div><div><span>Historical period</span><strong>{solar.period}</strong></div><div><span>Data retrieved</span><strong>{solar.retrieved}</strong></div></div>
        <div className="monthly-psh"><h3>Monthly average daily irradiation</h3><div className="monthly-chart">{solar.months.map(({ month, average }) => <div className="month-column" key={month} title={`${monthNames[month]}: ${average === null ? 'No data' : `${average.toFixed(2)} kWh/m²/day`} / ${average === null ? 'No data' : `${average.toFixed(2)} PSH`}`}><span className="month-bar-track"><span className="month-bar" style={{ height: `${average === null ? 0 : Math.min(100, average / 8 * 100)}%` }} /></span><strong>{average === null ? '—' : average.toFixed(1)}</strong><small>{monthNames[month].slice(0, 3)}</small></div>)}</div><p>Monthly values: average of valid daily readings across the same calendar month for {solar.period}. kWh/m²/day is numerically equivalent to Peak Sun Hours.</p></div>
        <footer className="solar-source">Source: <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER</a> · Parameter: ALLSKY_SFC_SW_DWN</footer>
      </div>}
      <p className="geocoder-attribution">Place names and coordinates from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> via Photon.</p>
    </section>
  );
}

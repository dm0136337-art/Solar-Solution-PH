const NASA_POWER_DAILY_POINT_API = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const SOLAR_PARAMETER = 'ALLSKY_SFC_SW_DWN';

export const NASA_POWER_SOURCE = 'NASA POWER Daily Point API';

export interface MonthlyIrradiationAverage {
  month: string;
  averageDailyIrradiation: number | null;
  validDayCount: number;
}

export interface SolarIrradiationAssessment {
  latitude: number;
  longitude: number;
  annualAverageIrradiation: number;
  monthlyAverageIrradiation: MonthlyIrradiationAverage[];
  lowestIrradiationMonth: string | null;
  lowestMonthAverageIrradiation: number | null;
  solarDesignIrradiation: number | null;
  dataSource: string;
  dataPeriod: {
    requestedStart: string;
    requestedEnd: string;
    firstObservation: string;
    lastObservation: string;
    validDailyObservations: number;
  };
}

interface NasaPowerResponse {
  properties?: {
    parameter?: Record<string, Record<string, number>>;
  };
  messages?: string[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function getLatestCompleteYearPeriod(now = new Date()) {
  const endYear = now.getUTCFullYear() - 1;
  const startYear = endYear - 4;
  return {
    startYear,
    endYear,
    start: `${startYear}0101`,
    end: `${endYear}1231`,
  };
}

export function validateSolarCoordinates(latitude: string, longitude: string) {
  const errors: { latitude?: string; longitude?: string } = {};
  const latitudeValue = latitude.trim() === '' ? Number.NaN : Number(latitude);
  const longitudeValue = longitude.trim() === '' ? Number.NaN : Number(longitude);

  if (!Number.isFinite(latitudeValue)) errors.latitude = 'Enter a latitude between -90 and 90.';
  else if (latitudeValue < -90 || latitudeValue > 90) errors.latitude = 'Latitude must be between -90 and 90.';

  if (!Number.isFinite(longitudeValue)) errors.longitude = 'Enter a longitude between -180 and 180.';
  else if (longitudeValue < -180 || longitudeValue > 180) errors.longitude = 'Longitude must be between -180 and 180.';

  return { errors, latitudeValue, longitudeValue };
}

export async function fetchSolarIrradiation(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<SolarIrradiationAssessment> {
  const period = getLatestCompleteYearPeriod();
  const query = new URLSearchParams({
    parameters: SOLAR_PARAMETER,
    community: 'RE',
    longitude: String(longitude),
    latitude: String(latitude),
    start: period.start,
    end: period.end,
    format: 'JSON',
    'time-standard': 'LST',
  });

  let response: Response;
  try {
    response = await fetch(`${NASA_POWER_DAILY_POINT_API}?${query.toString()}`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Could not connect to NASA POWER. Check your connection and retry.');
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as NasaPowerResponse;
      detail = body.messages?.filter(Boolean).join(' ') ?? '';
    } catch {
      // The API may return a non-JSON error response.
    }
    throw new Error(detail || `NASA POWER returned an error (${response.status}). Please retry.`);
  }

  let payload: NasaPowerResponse;
  try {
    payload = await response.json() as NasaPowerResponse;
  } catch {
    throw new Error('NASA POWER returned an unreadable response. Please retry.');
  }

  const dailyValues = payload.properties?.parameter?.[SOLAR_PARAMETER];
  if (!dailyValues || Object.keys(dailyValues).length === 0) {
    throw new Error('NASA POWER did not return solar irradiation data for these coordinates and dates.');
  }

  const monthSums = Array.from({ length: 12 }, () => 0);
  const monthCounts = Array.from({ length: 12 }, () => 0);
  let annualSum = 0;
  let validDailyObservations = 0;
  let firstObservation = '';
  let lastObservation = '';

  for (const [dateKey, rawValue] of Object.entries(dailyValues)) {
    if (!/^\d{8}$/.test(dateKey)) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0 || value === -999) continue;

    const monthIndex = Number(dateKey.slice(4, 6)) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;

    monthSums[monthIndex] += value;
    monthCounts[monthIndex] += 1;
    annualSum += value;
    validDailyObservations += 1;
    if (!firstObservation || dateKey < firstObservation) firstObservation = dateKey;
    if (!lastObservation || dateKey > lastObservation) lastObservation = dateKey;
  }

  if (validDailyObservations === 0) {
    throw new Error('NASA POWER returned no usable daily irradiation values for this period.');
  }

  const monthlyAverageIrradiation = MONTHS.map((month, index) => ({
    month,
    averageDailyIrradiation: monthCounts[index]
      ? monthSums[index] / monthCounts[index]
      : null,
    validDayCount: monthCounts[index],
  }));
  const availableMonths = monthlyAverageIrradiation.filter(
    (month): month is MonthlyIrradiationAverage & { averageDailyIrradiation: number } => (
      month.averageDailyIrradiation !== null
    ),
  );
  if (availableMonths.length === 0) {
    throw new Error('NASA POWER returned no monthly averages for this location.');
  }

  const hasAllMonthlyAverages = availableMonths.length === MONTHS.length;
  const lowestMonth = hasAllMonthlyAverages
    ? availableMonths.reduce((lowest, month) => (
      month.averageDailyIrradiation < lowest.averageDailyIrradiation ? month : lowest
    ))
    : null;

  return {
    latitude,
    longitude,
    annualAverageIrradiation: annualSum / validDailyObservations,
    monthlyAverageIrradiation,
    lowestIrradiationMonth: lowestMonth?.month ?? null,
    lowestMonthAverageIrradiation: lowestMonth?.averageDailyIrradiation ?? null,
    solarDesignIrradiation: lowestMonth?.averageDailyIrradiation ?? null,
    dataSource: `${NASA_POWER_SOURCE} (${SOLAR_PARAMETER})`,
    dataPeriod: {
      requestedStart: `${period.startYear}-01-01`,
      requestedEnd: `${period.endYear}-12-31`,
      firstObservation: `${firstObservation.slice(0, 4)}-${firstObservation.slice(4, 6)}-${firstObservation.slice(6, 8)}`,
      lastObservation: `${lastObservation.slice(0, 4)}-${lastObservation.slice(4, 6)}-${lastObservation.slice(6, 8)}`,
      validDailyObservations,
    },
  };
}

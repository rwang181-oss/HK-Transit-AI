import type { WeatherSnapshot } from '@/src/journey/model/types';
import { fetchJson } from '@/src/journey/providers/http';

const HKO_CURRENT_WEATHER =
  'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en';

function maxNumeric(values: any[]): number | null {
  const nums = values
    .map((item) => Number(item?.value))
    .filter((value) => Number.isFinite(value));
  return nums.length ? Math.max(...nums) : null;
}

function averageNumeric(values: any[]): number | null {
  const nums = values
    .map((item) => Number(item?.value))
    .filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function rainIntensityFromMm(rainfallMm: number | null): WeatherSnapshot['rainIntensity'] {
  if (rainfallMm == null || rainfallMm < 0.1) return 'none';
  if (rainfallMm < 2) return 'light';
  if (rainfallMm < 8) return 'moderate';
  return 'heavy';
}

function isHongKongDaylight(now = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Hong_Kong',
    }).format(now)
  );
  return hour >= 6 && hour < 19;
}

export function parseHkoWeather(payload: any, now = new Date()): WeatherSnapshot {
  const temperatureC = averageNumeric(payload?.temperature?.data || []);
  const rainfallMm = maxNumeric(payload?.rainfall?.data || []);
  const uvIndex = Number(payload?.uvindex?.data?.[0]?.value);

  return {
    rainIntensity: rainIntensityFromMm(rainfallMm),
    temperatureC: temperatureC == null ? null : Math.round(temperatureC * 10) / 10,
    uvIndex: Number.isFinite(uvIndex) ? uvIndex : null,
    isDaylight: isHongKongDaylight(now),
    updatedAt: payload?.updateTime || new Date().toISOString(),
    source: 'HKO',
  };
}

export function fallbackWeather(now = new Date()): WeatherSnapshot {
  return {
    rainIntensity: 'none',
    temperatureC: null,
    uvIndex: null,
    isDaylight: isHongKongDaylight(now),
    updatedAt: now.toISOString(),
    source: 'fallback',
  };
}

export async function fetchCurrentWeather(): Promise<WeatherSnapshot> {
  try {
    const payload = await fetchJson<any>(HKO_CURRENT_WEATHER, { timeoutMs: 7_000 });
    return parseHkoWeather(payload);
  } catch {
    return fallbackWeather();
  }
}

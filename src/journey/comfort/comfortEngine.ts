import type {
  ComfortMetrics,
  ComfortRouteInput,
  JourneyMode,
  WeatherSnapshot,
} from '@/src/journey/model/types';

const round1 = (value: number) => Math.round(value * 10) / 10;

export function smartModeForWeather(weather: WeatherSnapshot): JourneyMode {
  if (weather.rainIntensity === 'moderate' || weather.rainIntensity === 'heavy') return 'rain';
  if (weather.isDaylight && (weather.uvIndex || 0) >= 6) return 'shade';
  if ((weather.temperatureC || 0) >= 31) return 'indoor';
  return 'recommended';
}


function mtrMinutes(input: ComfortRouteInput): number {
  return Math.max(0, input.rideMinutesByProvider.MTR || 0);
}

function rainMultiplier(weather: WeatherSnapshot): number {
  switch (weather.rainIntensity) {
    case 'heavy': return 2.2;
    case 'moderate': return 1.6;
    case 'light': return 1.2;
    default: return 0;
  }
}

function heatMultiplier(weather: WeatherSnapshot): number {
  const heat = weather.temperatureC == null ? 0 : Math.max(0, weather.temperatureC - 28) / 5;
  const uv = !weather.isDaylight || weather.uvIndex == null ? 0 : Math.max(0, weather.uvIndex - 3) / 7;
  return Math.min(2.2, heat + uv);
}

export function calculateComfortMetrics(
  input: ComfortRouteInput,
  weather: WeatherSnapshot
): ComfortMetrics {
  const outdoorExposureMinutes = round1(input.walkingMinutes + input.waitMinutes * 0.55);
  const indoorTransitMinutes = round1(mtrMinutes(input));
  const weatherPenalty = round1(
    outdoorExposureMinutes * (rainMultiplier(weather) + heatMultiplier(weather))
  );
  const walkingBurden =
    input.walkingMeters <= 450 ? 'low' : input.walkingMeters <= 1000 ? 'medium' : 'high';

  const reasons: string[] = [];
  if (walkingBurden === 'low') reasons.push('lessWalking');
  if (indoorTransitMinutes >= 10) reasons.push('moreIndoorTransit');
  if (input.transfers === 0) reasons.push('noTransfer');
  if (input.waitMinutes <= 5) reasons.push('shortWait');
  if (weather.rainIntensity !== 'none' && outdoorExposureMinutes <= 8) reasons.push('lowerRainExposure');
  if ((weather.uvIndex || 0) >= 6 && outdoorExposureMinutes <= 8) reasons.push('lowerSunExposure');
  if (reasons.length === 0) reasons.push('balancedJourney');

  return {
    outdoorExposureMinutes,
    indoorTransitMinutes,
    walkingBurden,
    weatherPenalty,
    score: 0,
    confidence: 'estimated',
    reasons,
  };
}

export function scoreComfortOption(
  input: ComfortRouteInput,
  mode: JourneyMode,
  weather: WeatherSnapshot
): number {
  const metrics = calculateComfortMetrics(input, weather);
  const transferCost = input.transfers * 4.5;
  const base = input.totalMinutes;

  switch (mode) {
    case 'fastest':
      return round1(base + input.transfers * 1.5 + input.walkingMinutes * 0.05);
    case 'shade':
      return round1(base * 0.48 + metrics.outdoorExposureMinutes * (1.5 + heatMultiplier(weather)) + transferCost);
    case 'rain':
      return round1(base * 0.45 + metrics.outdoorExposureMinutes * (1.7 + rainMultiplier(weather)) + transferCost);
    case 'indoor':
      return round1(base * 0.55 + metrics.outdoorExposureMinutes * 1.25 + transferCost - metrics.indoorTransitMinutes * 0.35);
    case 'recommended':
    default:
      return round1(
        base * 0.68 +
          input.walkingMinutes * 0.7 +
          input.waitMinutes * 0.35 +
          transferCost +
          metrics.weatherPenalty * 0.35 -
          metrics.indoorTransitMinutes * 0.08
      );
  }
}

export function rankComfortOptions<T extends ComfortRouteInput>(
  options: T[],
  mode: JourneyMode,
  weather: WeatherSnapshot
): Array<T & { comfortMetrics: ComfortMetrics; comfortScore: number }> {
  return options
    .map((option) => {
      const comfortScore = scoreComfortOption(option, mode, weather);
      return {
        ...option,
        comfortScore,
        comfortMetrics: {
          ...calculateComfortMetrics(option, weather),
          score: comfortScore,
        },
      };
    })
    .sort((a, b) => a.comfortScore - b.comfortScore || a.totalMinutes - b.totalMinutes);
}

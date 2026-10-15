// Lookup tables for the weather page, kept out of weather.js so it stays readable.
//
// Open-Meteo describes the sky with a number called a WMO weather code
// (0 = clear, 61 = slight rain, 95 = thunderstorm, ...). This file turns that
// number into words and a Font Awesome icon. The full list is at
// https://open-meteo.com/en/docs (scroll to "WMO Weather interpretation codes").

// [label, day icon, night icon]
const WEATHER_CODES = {
  0: ['Clear sky', 'fa-sun', 'fa-moon'],
  1: ['Mainly clear', 'fa-sun', 'fa-moon'],
  2: ['Partly cloudy', 'fa-cloud-sun', 'fa-cloud-moon'],
  3: ['Overcast', 'fa-cloud', 'fa-cloud'],
  45: ['Fog', 'fa-smog', 'fa-smog'],
  48: ['Freezing fog', 'fa-smog', 'fa-smog'],
  51: ['Light drizzle', 'fa-cloud-rain', 'fa-cloud-rain'],
  53: ['Drizzle', 'fa-cloud-rain', 'fa-cloud-rain'],
  55: ['Heavy drizzle', 'fa-cloud-rain', 'fa-cloud-rain'],
  56: ['Light freezing drizzle', 'fa-icicles', 'fa-icicles'],
  57: ['Freezing drizzle', 'fa-icicles', 'fa-icicles'],
  61: ['Light rain', 'fa-cloud-rain', 'fa-cloud-rain'],
  63: ['Rain', 'fa-cloud-showers-heavy', 'fa-cloud-showers-heavy'],
  65: ['Heavy rain', 'fa-cloud-showers-heavy', 'fa-cloud-showers-heavy'],
  66: ['Light freezing rain', 'fa-icicles', 'fa-icicles'],
  67: ['Freezing rain', 'fa-icicles', 'fa-icicles'],
  71: ['Light snow', 'fa-snowflake', 'fa-snowflake'],
  73: ['Snow', 'fa-snowflake', 'fa-snowflake'],
  75: ['Heavy snow', 'fa-snowflake', 'fa-snowflake'],
  77: ['Snow grains', 'fa-snowflake', 'fa-snowflake'],
  80: ['Light showers', 'fa-cloud-sun-rain', 'fa-cloud-moon-rain'],
  81: ['Showers', 'fa-cloud-showers-heavy', 'fa-cloud-showers-heavy'],
  82: ['Heavy showers', 'fa-cloud-showers-heavy', 'fa-cloud-showers-heavy'],
  85: ['Light snow showers', 'fa-snowflake', 'fa-snowflake'],
  86: ['Snow showers', 'fa-snowflake', 'fa-snowflake'],
  95: ['Thunderstorm', 'fa-cloud-bolt', 'fa-cloud-bolt'],
  96: ['Thunderstorm with hail', 'fa-cloud-bolt', 'fa-cloud-bolt'],
  97: ['Heavy thunderstorm', 'fa-cloud-bolt', 'fa-cloud-bolt'],
  99: ['Thunderstorm with heavy hail', 'fa-cloud-bolt', 'fa-cloud-bolt'],
};

// Returns { label, icon } for a weather code. isDay picks the sun or moon icon.
export function describeWeather(code, isDay = true) {
  const entry = WEATHER_CODES[code];
  if (!entry) return { label: 'Unknown', icon: 'fa-question' };
  const [label, dayIcon, nightIcon] = entry;
  return { label, icon: isDay ? dayIcon : nightIcon };
}

// US Air Quality Index bands, from https://www.airnow.gov/aqi/aqi-basics/
// Each band's className matches a color in css/weather.css.
const AQI_BANDS = [
  { max: 50, label: 'Good', className: 'aqi-good' },
  { max: 100, label: 'Moderate', className: 'aqi-moderate' },
  { max: 150, label: 'Unhealthy for sensitive groups', className: 'aqi-sensitive' },
  { max: 200, label: 'Unhealthy', className: 'aqi-unhealthy' },
  { max: 300, label: 'Very unhealthy', className: 'aqi-very-unhealthy' },
  { max: Infinity, label: 'Hazardous', className: 'aqi-hazardous' },
];

export function aqiCategory(usAqi) {
  return AQI_BANDS.find((band) => usAqi <= band.max);
}

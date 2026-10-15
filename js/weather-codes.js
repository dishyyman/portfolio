// Lookup tables for the weather page, kept out of weather.js so it stays readable.
//
// Open-Meteo describes the sky with a number called a WMO weather code
// (0 = clear, 61 = slight rain, 95 = thunderstorm, ...). This file turns that
// number into words and a Font Awesome icon. The full list is at
// https://open-meteo.com/en/docs (scroll to "WMO Weather interpretation codes").

// [label, day icon, night icon, tone]
// The tone picks the icon's colors in css/weather.css (see "Weather icon colors"):
// yellow sun, pale moon, grey clouds, blue rain, and so on.
const WEATHER_CODES = {
  0: ['Clear sky', 'fa-sun', 'fa-moon', 'clear'],
  1: ['Mainly clear', 'fa-sun', 'fa-moon', 'clear'],
  2: ['Partly cloudy', 'fa-cloud-sun', 'fa-cloud-moon', 'partly'],
  3: ['Overcast', 'fa-cloud', 'fa-cloud', 'cloudy'],
  45: ['Fog', 'fa-smog', 'fa-smog', 'fog'],
  48: ['Freezing fog', 'fa-smog', 'fa-smog', 'fog'],
  51: ['Light drizzle', 'fa-cloud-rain', 'fa-cloud-rain', 'rain'],
  53: ['Drizzle', 'fa-cloud-rain', 'fa-cloud-rain', 'rain'],
  55: ['Heavy drizzle', 'fa-cloud-rain', 'fa-cloud-rain', 'rain'],
  56: ['Light freezing drizzle', 'fa-icicles', 'fa-icicles', 'ice'],
  57: ['Freezing drizzle', 'fa-icicles', 'fa-icicles', 'ice'],
  61: ['Light rain', 'fa-cloud-rain', 'fa-cloud-rain', 'rain'],
  63: ['Rain', 'fa-cloud-showers-heavy', 'fa-cloud-showers-heavy', 'rain'],
  65: ['Heavy rain', 'fa-cloud-showers-heavy', 'fa-cloud-showers-heavy', 'rain'],
  66: ['Light freezing rain', 'fa-icicles', 'fa-icicles', 'ice'],
  67: ['Freezing rain', 'fa-icicles', 'fa-icicles', 'ice'],
  71: ['Light snow', 'fa-snowflake', 'fa-snowflake', 'snow'],
  73: ['Snow', 'fa-snowflake', 'fa-snowflake', 'snow'],
  75: ['Heavy snow', 'fa-snowflake', 'fa-snowflake', 'snow'],
  77: ['Snow grains', 'fa-snowflake', 'fa-snowflake', 'snow'],
  80: ['Light showers', 'fa-cloud-sun-rain', 'fa-cloud-moon-rain', 'showers'],
  81: ['Showers', 'fa-cloud-showers-heavy', 'fa-cloud-showers-heavy', 'rain'],
  82: ['Heavy showers', 'fa-cloud-showers-heavy', 'fa-cloud-showers-heavy', 'rain'],
  85: ['Light snow showers', 'fa-snowflake', 'fa-snowflake', 'snow'],
  86: ['Snow showers', 'fa-snowflake', 'fa-snowflake', 'snow'],
  95: ['Thunderstorm', 'fa-cloud-bolt', 'fa-cloud-bolt', 'storm'],
  96: ['Thunderstorm with hail', 'fa-cloud-bolt', 'fa-cloud-bolt', 'storm'],
  97: ['Heavy thunderstorm', 'fa-cloud-bolt', 'fa-cloud-bolt', 'storm'],
  99: ['Thunderstorm with heavy hail', 'fa-cloud-bolt', 'fa-cloud-bolt', 'storm'],
};

// These tones look different by day and night (a sun or a moon).
const DAY_NIGHT_TONES = ['clear', 'partly', 'showers'];

// Returns { label, icon, colorClass } for a weather code. isDay picks the sun or moon.
// colorClass is a class like "sky-partly-day" that colors the icon (see css/weather.css).
export function describeWeather(code, isDay = true) {
  const entry = WEATHER_CODES[code];
  if (!entry) return { label: 'Unknown', icon: 'fa-question', colorClass: 'sky-unknown' };
  const [label, dayIcon, nightIcon, tone] = entry;
  const time = DAY_NIGHT_TONES.includes(tone) ? (isDay ? '-day' : '-night') : '';
  return { label, icon: isDay ? dayIcon : nightIcon, colorClass: `sky-${tone}${time}` };
}

// US Air Quality Index bands, from https://www.airnow.gov/aqi/aqi-basics/
// Each band's className matches a color in css/weather.css.
const AQI_BANDS = [
  { max: 50, label: 'Good', className: 'aqi-good' },
  { max: 100, label: 'Moderate', className: 'aqi-moderate' },
  // The full name is too long for the label on the page, so it gets a short one too.
  { max: 150, label: 'Unhealthy for sensitive groups', short: 'Unhealthy for some', className: 'aqi-sensitive' },
  { max: 200, label: 'Unhealthy', className: 'aqi-unhealthy' },
  { max: 300, label: 'Very unhealthy', className: 'aqi-very-unhealthy' },
  { max: Infinity, label: 'Hazardous', className: 'aqi-hazardous' },
];

export function aqiCategory(usAqi) {
  return AQI_BANDS.find((band) => usAqi <= band.max);
}

// UV index bands, from the World Health Organization's UV index guide.
// The colors for each band are in css/weather.css (--uv-low and so on).
const UV_BANDS = [
  { max: 2, label: 'Low' },
  { max: 5, label: 'Moderate' },
  { max: 7, label: 'High' },
  { max: 10, label: 'Very high' },
  { max: Infinity, label: 'Extreme' },
];

export function uvCategory(uvIndex) {
  return UV_BANDS.find((band) => Math.round(uvIndex) <= band.max);
}

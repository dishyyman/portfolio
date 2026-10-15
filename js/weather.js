// Weather: main page logic.
//
// Everything comes from Open-Meteo (https://open-meteo.com), which is free for
// personal projects and needs no API key, so the browser can call it directly.
// We use four of its APIs:
//   - Geocoding:   a city name → its latitude and longitude
//   - Forecast:    current weather, the next 24 hours, and 7 days
//   - Air Quality: US AQI, fine dust (PM2.5), ozone and UV right now
//   - Marine:      waves, swell and water temperature (only near the ocean)
//
// 1. The visitor searches a city (or uses their location) → we get coordinates.
// 2. loadPlace() asks the Forecast, Air Quality and Marine APIs at the same time.
// 3. Each answer fills in its own panel. If Air Quality or Marine fails or has
//    no data, only that panel hides; the forecast still shows.

import { describeWeather, aqiCategory } from './weather-codes.js';

const els = {
  form: document.getElementById('search-form'),
  input: document.getElementById('search-input'),
  locate: document.getElementById('locate-btn'),
  unitButtons: document.querySelectorAll('.unit-toggle button'),
  results: document.getElementById('results'),
  resultsLabel: document.getElementById('results-label'),
  status: document.getElementById('status'),
  weather: document.getElementById('weather'),
  loadingBar: document.getElementById('loading-bar'),
  placeName: document.getElementById('place-name'),
  placeDetail: document.getElementById('place-detail'),
  currentIcon: document.getElementById('current-icon'),
  currentTemp: document.getElementById('current-temp'),
  currentLabel: document.getElementById('current-label'),
  currentFeels: document.getElementById('current-feels'),
  currentStats: document.getElementById('current-stats'),
  hourly: document.getElementById('hourly'),
  daily: document.getElementById('daily'),
  airCard: document.getElementById('air-card'),
  aqiValue: document.getElementById('aqi-value'),
  aqiLabel: document.getElementById('aqi-label'),
  airStats: document.getElementById('air-stats'),
  surfCard: document.getElementById('surf-card'),
  surfStats: document.getElementById('surf-stats'),
  surfDays: document.getElementById('surf-days'),
};

// Where the page starts on a first visit. It's on the coast, so the Surf panel shows.
const DEFAULT_PLACE = {
  name: 'Huntington Beach',
  detail: 'California, United States',
  latitude: 33.6603,
  longitude: -117.9992,
};

// The words Open-Meteo uses for each unit system.
const UNIT_PARAMS = {
  imperial: { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', length_unit: 'imperial' },
  metric: { temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm', length_unit: 'metric' },
};

// How we write the wind unit on the page (Open-Meteo's own label is "mp/h").
const WIND_LABELS = { imperial: 'mph', metric: 'km/h' };

const saved = loadSaved('weather-place');
let place = typeof saved?.latitude === 'number' ? saved : DEFAULT_PLACE;
let units = loadSaved('weather-units') === 'metric' ? 'metric' : 'imperial';
// Counts requests, so a slow old answer can't replace a newer one.
let latestRequest = 0;

// ---------- Talking to Open-Meteo ----------

// Builds a URL like https://api.open-meteo.com/v1/forecast?latitude=33.66&...
function apiUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

// Fetches a URL and returns its JSON. Open-Meteo explains bad requests in a "reason" field.
async function getJSON(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.reason ?? `The weather service had a problem (error ${response.status}).`);
  }
  return data;
}

function searchPlaces(name) {
  return getJSON(apiUrl('https://geocoding-api.open-meteo.com/v1/search', {
    name,
    count: 5,
    language: 'en',
  }));
}

function fetchForecast({ latitude, longitude }) {
  const { temperature_unit, wind_speed_unit, precipitation_unit } = UNIT_PARAMS[units];
  return getJSON(apiUrl('https://api.open-meteo.com/v1/forecast', {
    latitude,
    longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max',
    temperature_unit,
    wind_speed_unit,
    precipitation_unit,
    timezone: 'auto',       // times in the place's own time zone
    timeformat: 'unixtime', // times as seconds since 1970, so Intl can format them
    forecast_days: 7,
  }));
}

function fetchAirQuality({ latitude, longitude }) {
  return getJSON(apiUrl('https://air-quality-api.open-meteo.com/v1/air-quality', {
    latitude,
    longitude,
    current: 'us_aqi,pm2_5,ozone,uv_index',
    timezone: 'auto',
  }));
}

function fetchMarine({ latitude, longitude }) {
  return getJSON(apiUrl('https://marine-api.open-meteo.com/v1/marine', {
    latitude,
    longitude,
    current: 'wave_height,wave_period,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature',
    daily: 'wave_height_max',
    length_unit: UNIT_PARAMS[units].length_unit,
    cell_selection: 'sea', // use the nearest bit of ocean, not the land the city sits on
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: 5,
  }));
}

// ---------- Loading a place ----------

async function loadPlace(newPlace) {
  const request = ++latestRequest;
  setStatus(`Loading weather for ${newPlace.name}…`);
  showLoading(true);

  // All three requests go out at once. allSettled waits for every one,
  // even if some fail, and tells us which worked.
  const [forecast, air, marine] = await Promise.allSettled([
    fetchForecast(newPlace),
    fetchAirQuality(newPlace),
    fetchMarine(newPlace),
  ]);

  if (request !== latestRequest) return; // the visitor already picked another place
  showLoading(false);

  // Without the forecast there's nothing to show, so keep the old weather on screen.
  if (forecast.status === 'rejected') {
    setStatus(friendlyError(forecast.reason));
    return;
  }

  place = newPlace;
  save('weather-place', place);

  renderPlace(forecast.value);
  renderCurrent(forecast.value);
  renderHourly(forecast.value);
  renderDaily(forecast.value);
  renderAirQuality(air.status === 'fulfilled' ? air.value : null);
  renderSurf(marine.status === 'fulfilled' ? marine.value : null);

  els.weather.hidden = false;
  setStatus('');
}

// fetch() throws a TypeError when it can't reach the server at all (like when offline).
function friendlyError(error) {
  if (error instanceof TypeError) {
    return "Couldn't reach the weather service. Check your connection and try again.";
  }
  return error.message;
}

// ---------- Drawing each panel ----------

function renderPlace(data) {
  els.placeName.textContent = place.name;
  const time = formatTime(data.current.time, data.timezone, { hour: 'numeric', minute: '2-digit' });
  els.placeDetail.textContent = [place.detail, `Local time ${time}`].filter(Boolean).join(' · ');
}

function renderCurrent(data) {
  const { current, daily } = data;
  const weather = describeWeather(current.weather_code, current.is_day);

  els.currentIcon.className = `fa-solid ${weather.icon} current-icon`;
  els.currentTemp.textContent = `${Math.round(current.temperature_2m)}°`;
  els.currentLabel.textContent = weather.label;
  els.currentFeels.textContent = `Feels like ${Math.round(current.apparent_temperature)}°`;

  const time = (seconds) => formatTime(seconds, data.timezone, { hour: 'numeric', minute: '2-digit' });
  fillStats(els.currentStats, [
    ['High / Low', `${Math.round(daily.temperature_2m_max[0])}° / ${Math.round(daily.temperature_2m_min[0])}°`],
    ['Humidity', `${current.relative_humidity_2m}%`],
    ['Wind', `${Math.round(current.wind_speed_10m)} ${WIND_LABELS[units]} ${compass(current.wind_direction_10m)}`, windArrow(current.wind_direction_10m)],
    ['Rain chance today', `${daily.precipitation_probability_max[0] ?? 0}%`],
    ['UV index', Math.round(daily.uv_index_max[0])],
    ['Sunrise', time(daily.sunrise[0])],
    ['Sunset', time(daily.sunset[0])],
  ]);
}

function renderHourly(data) {
  const { hourly, current, timezone } = data;
  // Start at the hour we're in right now (current.time is something like 10:30).
  const start = Math.max(0, hourly.time.findIndex((t) => t > current.time - 3600));

  els.hourly.replaceChildren();
  for (let i = start; i < start + 24 && i < hourly.time.length; i++) {
    // "Now" uses the current conditions, so it matches the big number above.
    const now = i === start;
    const code = now ? current.weather_code : hourly.weather_code[i];
    const isDay = now ? current.is_day : hourly.is_day[i];
    const temperature = now ? current.temperature_2m : hourly.temperature_2m[i];
    const weather = describeWeather(code, isDay);
    const label = now ? 'Now' : formatTime(hourly.time[i], timezone, { hour: 'numeric' });

    const item = el('li', 'hour');
    item.append(
      el('span', 'hour-time', label),
      icon(weather.icon, weather.label),
      el('span', 'hour-temp', `${Math.round(temperature)}°`),
      rainChance(hourly.precipitation_probability[i]),
    );
    els.hourly.append(item);
  }
}

function renderDaily(data) {
  const { daily, timezone } = data;
  // The range bars all share one scale: the coldest low to the warmest high of the week.
  const weekLow = Math.min(...daily.temperature_2m_min);
  const weekHigh = Math.max(...daily.temperature_2m_max);
  const span = weekHigh - weekLow || 1;

  els.daily.replaceChildren();
  daily.time.forEach((day, i) => {
    const weather = describeWeather(daily.weather_code[i], true);
    const low = daily.temperature_2m_min[i];
    const high = daily.temperature_2m_max[i];

    // The green part of the bar runs from this day's low to its high.
    const bar = el('span', 'range');
    const fill = el('span', 'range-fill');
    fill.style.left = `${((low - weekLow) / span) * 100}%`;
    fill.style.width = `${((high - low) / span) * 100}%`;
    bar.append(fill);

    const row = el('li', 'day');
    row.append(
      el('span', 'day-name', i === 0 ? 'Today' : formatTime(day, timezone, { weekday: 'short' })),
      icon(weather.icon, weather.label),
      rainChance(daily.precipitation_probability_max[i]),
      el('span', 'day-low', `${Math.round(low)}°`),
      bar,
      el('span', 'day-high', `${Math.round(high)}°`),
    );
    els.daily.append(row);
  });
}

function renderAirQuality(data) {
  const current = data?.current;
  if (current?.us_aqi == null) {
    els.airCard.hidden = true;
    return;
  }

  const category = aqiCategory(current.us_aqi);
  els.aqiValue.textContent = current.us_aqi;
  els.aqiLabel.textContent = category.label;
  els.aqiLabel.className = `aqi-label ${category.className}`;

  const unit = data.current_units;
  fillStats(els.airStats, [
    ['Fine particles (PM2.5)', `${Math.round(current.pm2_5)} ${unit.pm2_5}`],
    ['Ozone', `${Math.round(current.ozone)} ${unit.ozone}`],
    ['UV index now', Math.round(current.uv_index)],
  ]);
  els.airCard.hidden = false;
}

function renderSurf(data) {
  const current = data?.current;
  // Away from the ocean the Marine API answers with nulls instead of numbers.
  if (current?.wave_height == null) {
    els.surfCard.hidden = true;
    return;
  }

  const length = data.current_units.wave_height; // "ft" or "m"
  // Water temperature always comes back in °C, even with imperial units.
  const water = units === 'imperial'
    ? current.sea_surface_temperature * 9 / 5 + 32
    : current.sea_surface_temperature;

  fillStats(els.surfStats, [
    ['Waves', `${current.wave_height.toFixed(1)} ${length} at ${Math.round(current.wave_period)}s`],
    ['Swell', `${current.swell_wave_height.toFixed(1)} ${length} at ${Math.round(current.swell_wave_period)}s`],
    ['Swell from', compass(current.swell_wave_direction), windArrow(current.swell_wave_direction)],
    ['Water', `${Math.round(water)}°`],
  ]);

  els.surfDays.replaceChildren();
  data.daily.time.forEach((day, i) => {
    const height = data.daily.wave_height_max[i];
    if (height == null) return;
    const item = el('li');
    item.append(
      el('span', 'muted', i === 0 ? 'Today' : formatTime(day, data.timezone, { weekday: 'short' })),
      el('strong', '', `${height.toFixed(1)} ${length}`),
    );
    els.surfDays.append(item);
  });
  els.surfCard.hidden = false;
}

// ---------- Small helpers for building the page ----------

// Makes an element with a class and some text. textContent (not innerHTML)
// keeps place names from the search as plain text.
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// A Font Awesome icon with a hidden text label for screen readers.
function icon(name, label) {
  const wrapper = el('span', 'weather-icon');
  const i = el('i', `fa-solid ${name}`);
  i.setAttribute('aria-hidden', 'true');
  wrapper.append(i, el('span', 'visually-hidden', label));
  return wrapper;
}

// A small "💧 30%" label. Empty when there's no chance of rain, to keep things calm.
function rainChance(percent) {
  const span = el('span', 'rain');
  if (percent > 0) {
    const drop = el('i', 'fa-solid fa-droplet');
    drop.setAttribute('aria-hidden', 'true');
    span.append(drop, ` ${percent}%`);
  }
  return span;
}

// An arrow pointing where the wind (or swell) is heading.
// Weather directions say where it comes FROM, so the arrow is turned around (+180°).
function windArrow(degrees) {
  const arrow = el('i', 'fa-solid fa-arrow-up direction-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.style.rotate = `${degrees + 180}deg`;
  return arrow;
}

// Fills a <dl> with [label, value, optional extra element] rows.
function fillStats(list, rows) {
  list.replaceChildren();
  for (const [label, value, extra] of rows) {
    const row = el('div', 'stat');
    const dd = el('dd', '', String(value));
    if (extra) dd.prepend(extra, ' ');
    row.append(el('dt', '', label), dd);
    list.append(row);
  }
}

// 225° → "SW"
function compass(degrees) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(degrees / 45) % 8];
}

// Shows a time (in seconds) the way people expect in that place's time zone.
function formatTime(seconds, timeZone, options) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(seconds * 1000);
}

function setStatus(message) {
  els.status.textContent = message;
}

function showLoading(on) {
  els.loadingBar.classList.toggle('active', on);
}

// ---------- Remembering choices ----------
// localStorage can be blocked (like in private windows), so every use is in try/catch.

function loadSaved(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved this time; the page still works.
  }
}

// ---------- Search, location and units ----------

els.form.addEventListener('submit', async (event) => {
  event.preventDefault(); // stay on this page instead of submitting the form
  const name = els.input.value.trim();
  if (name.length < 2) {
    setStatus('Type at least 2 letters to search.');
    return;
  }

  hideOtherMatches();
  setStatus(`Searching for “${name}”…`);
  let data;
  try {
    data = await searchPlaces(name);
  } catch (error) {
    setStatus(friendlyError(error));
    return;
  }

  // The Geocoding API leaves "results" out entirely when nothing matches.
  const matches = (data.results ?? []).map((result) => ({
    name: result.name,
    detail: [result.admin1, result.country].filter(Boolean).join(', '),
    latitude: result.latitude,
    longitude: result.longitude,
  }));

  if (matches.length === 0) {
    setStatus(`No places found for “${name}”. Check the spelling, or try a nearby city.`);
    return;
  }
  // Results come best match first, so load that one and offer the rest.
  loadPlace(matches[0]);
  showOtherMatches(matches.slice(1));
});

// Lists the other places a search matched, as buttons to switch to.
function showOtherMatches(matches) {
  els.results.replaceChildren();
  for (const match of matches) {
    const button = el('button', 'result');
    button.type = 'button';
    button.append(el('strong', '', match.name), ` ${match.detail}`);
    button.addEventListener('click', () => {
      hideOtherMatches();
      loadPlace(match);
    });
    const item = el('li');
    item.append(button);
    els.results.append(item);
  }
  els.results.hidden = matches.length === 0;
  els.resultsLabel.hidden = matches.length === 0;
}

function hideOtherMatches() {
  els.results.hidden = true;
  els.resultsLabel.hidden = true;
}

els.locate.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus("This browser can't share your location. Search for a city instead.");
    return;
  }
  setStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      hideOtherMatches();
      // Open-Meteo can't turn coordinates back into a city name, so we keep it simple.
      loadPlace({ name: 'Your location', detail: '', latitude: coords.latitude, longitude: coords.longitude });
    },
    (error) => {
      setStatus(error.code === error.PERMISSION_DENIED
        ? 'Location access is blocked. Search for a city instead.'
        : "Couldn't find your location. Search for a city instead.");
    },
    { timeout: 10000 },
  );
});

els.unitButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.units === units) return;
    units = button.dataset.units;
    save('weather-units', units);
    updateUnitButtons();
    loadPlace(place);
  });
});

function updateUnitButtons() {
  els.unitButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.units === units));
  });
}

// ---------- Start ----------

updateUnitButtons();
loadPlace(place);

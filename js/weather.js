// Weather: main page logic.
//
// Everything comes from Open-Meteo (https://open-meteo.com), which is free for
// personal projects and needs no API key, so the browser can call it directly.
// We use three of its weather APIs:
//   - Forecast:    current weather, the next 24 hours, and 7 days
//   - Air Quality: US AQI, fine dust (PM2.5), ozone and UV right now
//   - Marine:      waves, swell and water temperature (only near the ocean)
// Turning typed names into places is in place-search.js.
//
// 1. The visitor picks a place from the search box (or uses their location) → we get coordinates.
// 2. loadPlace() asks the Forecast, Air Quality and Marine APIs at the same time.
// 3. Each answer fills in its own panel. If Air Quality or Marine fails or has
//    no data, only that panel hides; the forecast still shows.

import { apiUrl, getJSON, friendlyError, wasCancelled } from './api.js';
import { searchPlaces, guessPlaces, nameForCoordinates, flagEmoji } from './place-search.js';
import { describeWeather, aqiCategory, uvCategory } from './weather-codes.js';

const els = {
  form: document.getElementById('search-form'),
  input: document.getElementById('search-input'),
  locate: document.getElementById('locate-btn'),
  unitButtons: document.querySelectorAll('.unit-toggle button'),
  suggestions: document.getElementById('suggestions'),
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
  aqiFullLabel: document.getElementById('aqi-full-label'),
  uvHalf: document.getElementById('uv-half'),
  uvPointer: document.getElementById('uv-pointer'),
  uvValue: document.getElementById('uv-value'),
  uvLabel: document.getElementById('uv-label'),
  surfCard: document.getElementById('surf-card'),
  surfStats: document.getElementById('surf-stats'),
  surfDays: document.getElementById('surf-days'),
};

// Where the page starts on a first visit. It's on the coast, so the Surf panel shows.
const DEFAULT_PLACE = {
  name: 'Huntington Beach',
  detail: 'California, United States',
  countryCode: 'US',
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
// The last forecast shown, so the place name can be redrawn on its own.
let lastForecast = null;

// What "Use my location" is called until (or unless) we find the town's name.
const MY_LOCATION = 'Your location';

// ---------- Talking to Open-Meteo ----------

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
  lastForecast = forecast.value;
  save('weather-place', place);
  rememberRecent(place);

  renderPlace(forecast.value);
  renderCurrent(forecast.value);
  renderHourly(forecast.value);
  renderDaily(forecast.value);
  renderAirQuality(air.status === 'fulfilled' ? air.value : null);
  renderSurf(marine.status === 'fulfilled' ? marine.value : null);

  els.weather.hidden = false;
  setStatus('');
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

  els.currentIcon.className = `fa-solid ${weather.icon} ${weather.colorClass} current-icon`;
  els.currentTemp.textContent = `${Math.round(current.temperature_2m)}°`;
  els.currentLabel.textContent = weather.label;
  els.currentFeels.textContent = `Feels like ${Math.round(current.apparent_temperature)}°`;

  const time = (seconds) => formatTime(seconds, data.timezone, { hour: 'numeric', minute: '2-digit' });
  fillStats(els.currentStats, [
    ['High / Low', `${Math.round(daily.temperature_2m_max[0])}° / ${Math.round(daily.temperature_2m_min[0])}°`],
    ['Humidity', `${current.relative_humidity_2m}%`],
    ['Wind', `${Math.round(current.wind_speed_10m)} ${WIND_LABELS[units]} ${compass(current.wind_direction_10m)}`, windArrow(current.wind_direction_10m)],
    ['Rain chance today', `${daily.precipitation_probability_max[0] ?? 0}%`],
    ['Peak UV today', Math.round(daily.uv_index_max[0])],
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
      icon(weather),
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
      icon(weather),
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
  const infoIcon = el('i', 'fa-solid fa-circle-info');
  infoIcon.setAttribute('aria-hidden', 'true');
  els.aqiLabel.replaceChildren(category.short ?? category.label, infoIcon);
  els.aqiFullLabel.textContent = category.label;
  els.aqiFullLabel.className = `aqi-full-label ${category.className}`;
  els.aqiLabel.className = `aqi-label ${category.className}`;
  showAqiDetails(false);

  const unit = data.current_units;
  fillStats(els.airStats, [
    ['Fine particles (PM2.5)', `${Math.round(current.pm2_5)} ${unit.pm2_5}`],
    ['Ozone', `${Math.round(current.ozone)} ${unit.ozone}`],
  ]);

  renderUv(current.uv_index);
  els.airCard.hidden = false;
}

// The UV arc runs from 0 to 12. Anything higher (it happens near the equator)
// puts the knob at the far end.
const UV_ARC_MAX = 12;

function renderUv(uvIndex) {
  els.uvHalf.hidden = uvIndex == null;
  if (uvIndex == null) return;

  const turn = Math.min(uvIndex, UV_ARC_MAX) / UV_ARC_MAX;
  els.uvPointer.style.setProperty('--uv-turn', turn);
  els.uvValue.textContent = Math.round(uvIndex);
  els.uvLabel.textContent = `UV index · ${uvCategory(uvIndex).label}`;
}

// Hovering the AQI label shows the details (that part is all CSS).
// Clicking or tapping it keeps them open until you click somewhere else.
function showAqiDetails(open) {
  els.aqiLabel.setAttribute('aria-expanded', String(open));
}

els.aqiLabel.addEventListener('click', () => {
  showAqiDetails(els.aqiLabel.getAttribute('aria-expanded') !== 'true');
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.aqi-info')) showAqiDetails(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') showAqiDetails(false);
});

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

// A weather icon in its natural colors, with a hidden text label for screen readers.
// "weather" is what describeWeather() returns.
function icon(weather) {
  const wrapper = el('span', 'weather-icon');
  const i = el('i', `fa-solid ${weather.icon} ${weather.colorClass}`);
  i.setAttribute('aria-hidden', 'true');
  wrapper.append(i, el('span', 'visually-hidden', weather.label));
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

// ---------- Recent places ----------

const MAX_RECENT = 5;

function loadRecent() {
  const list = loadSaved('weather-recent');
  return Array.isArray(list) ? list.filter((p) => typeof p?.latitude === 'number') : [];
}

// Puts a place at the top of the recent list (moving it there if it's already in it).
function rememberRecent(newPlace) {
  if (newPlace.name === MY_LOCATION) return; // not useful without a real name
  const others = loadRecent().filter((p) => !samePlace(p, newPlace));
  save('weather-recent', [newPlace, ...others].slice(0, MAX_RECENT));
}

// Two places within about 1 km of each other count as the same place.
function samePlace(a, b) {
  return Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;
}

// ---------- Search box with suggestions ----------
//
// As the visitor types, we wait until they pause, then ask for matching places
// and list them under the box. Arrow keys move through the list, Enter picks
// one, Escape closes it. When the box is empty, it lists recent places instead.

// How long to wait after the last key press before searching. Without this
// wait, typing "Honolulu" would send 8 requests instead of 1 or 2.
const DEBOUNCE_MS = 250;

let suggestions = [];        // the places listed right now
let activeIndex = -1;        // which one the arrow keys have highlighted (-1 = none)
let debounceTimer = null;
let searchController = null; // cancels the last search when a new one starts

els.input.addEventListener('input', () => {
  // The list (and any search still running) is for the old text, so drop it.
  // Otherwise the arrow keys could pick a place that doesn't match what's typed.
  cancelSearch();
  closeSuggestions();
  debounceTimer = setTimeout(openSuggestions, DEBOUNCE_MS);
});

els.input.addEventListener('focus', openSuggestions);
els.input.addEventListener('blur', closeSuggestions);

els.input.addEventListener('keydown', (event) => {
  const open = !els.suggestions.hidden;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); // don't move the text cursor
    if (!open) {
      openSuggestions();
      return;
    }
    const last = suggestions.length - 1;
    if (event.key === 'ArrowDown') highlight(activeIndex >= last ? 0 : activeIndex + 1);
    else highlight(activeIndex <= 0 ? last : activeIndex - 1);
  } else if (event.key === 'Enter' && open && activeIndex >= 0) {
    event.preventDefault(); // pick the highlighted place instead of submitting the form
    choose(suggestions[activeIndex]);
  } else if (event.key === 'Escape' && open) {
    event.preventDefault(); // just close the list (the browser would also clear the box)
    cancelSearch(); // so a search that's still running can't open it again
    closeSuggestions();
  }
});

// Pressing Enter (with nothing highlighted) or clicking Search: go to the best match.
els.form.addEventListener('submit', async (event) => {
  event.preventDefault(); // stay on this page instead of submitting the form
  const query = els.input.value.trim();
  if (query.length < 2) {
    setStatus('Type at least 2 letters to search.');
    return;
  }
  cancelSearch(); // search now instead of waiting for the pause
  const found = await findPlaces(query);
  if (found?.places.length > 0) choose(found.places[0]);
});

// Shows recent places for an empty box, or suggestions for what's typed.
async function openSuggestions() {
  const query = els.input.value.trim();
  if (query.length < 2) {
    cancelSearch();
    const recent = loadRecent();
    if (recent.length > 0) showSuggestions(recent, 'Recent', true);
    else closeSuggestions();
    return;
  }

  const found = await findPlaces(query);
  // Skip it if the search was cancelled, or the visitor has left the box.
  if (!found || document.activeElement !== els.input) return;
  if (found.places.length === 0) closeSuggestions();
  else showSuggestions(found.places, found.guessed ? 'Did you mean…?' : '');
}

// Asks Open-Meteo first. If it finds nothing, it's probably a typo, so ask Photon to guess.
// Returns { places, guessed }, or null if the search was cancelled or failed.
async function findPlaces(query) {
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  const { signal } = controller;

  try {
    let places = await searchPlaces(query, { signal });
    let guessed = false;
    if (places.length === 0) {
      setStatus(`No exact match for “${query}”. Checking spellings…`);
      // Photon is only a helper, so if it's down or slow we just say nothing was found.
      places = await guessPlaces(query, { signal }).catch((error) => {
        if (wasCancelled(error)) throw error;
        return [];
      });
      guessed = true;
    }
    if (signal.aborted) return null;

    setStatus(places.length > 0 ? '' : `No places found for “${query}”. Check the spelling, or try a nearby city.`);
    return { places, guessed };
  } catch (error) {
    if (!wasCancelled(error)) setStatus(friendlyError(error));
    return null;
  }
}

function showSuggestions(places, note = '', isRecent = false) {
  suggestions = places;
  activeIndex = -1;
  els.input.removeAttribute('aria-activedescendant');
  els.suggestions.replaceChildren();
  els.suggestions.setAttribute('aria-label', note || 'Places');

  if (note) {
    // Already read out as the list's label, so screen readers skip this copy.
    const heading = el('li', 'suggestions-note', note);
    heading.setAttribute('role', 'presentation');
    heading.setAttribute('aria-hidden', 'true');
    els.suggestions.append(heading);
  }

  places.forEach((suggestion, i) => {
    const option = el('li', 'suggestion');
    option.id = `suggestion-${i}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');

    // A clock for recent places, otherwise the country's flag.
    const marker = el('span', 'suggestion-icon', isRecent ? '' : flagEmoji(suggestion.countryCode));
    if (isRecent) marker.append(el('i', 'fa-solid fa-clock-rotate-left'));
    marker.setAttribute('aria-hidden', 'true');
    option.append(marker, el('span', '', ''));
    option.lastChild.append(el('strong', '', suggestion.name), suggestion.detail ? ` ${suggestion.detail}` : '');

    // mousedown would normally take focus away from the box (closing the list
    // before the click lands), so we keep the focus where it is.
    option.addEventListener('mousedown', (event) => event.preventDefault());
    option.addEventListener('click', () => choose(suggestion));
    els.suggestions.append(option);
  });

  els.suggestions.hidden = false;
  els.input.setAttribute('aria-expanded', 'true');
}

function highlight(index) {
  els.suggestions.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected', 'false');
  activeIndex = index;
  const option = document.getElementById(`suggestion-${index}`);
  option.setAttribute('aria-selected', 'true');
  option.scrollIntoView({ block: 'nearest' });
  // Focus stays in the text box; this tells screen readers which option is highlighted.
  els.input.setAttribute('aria-activedescendant', option.id);
}

function cancelSearch() {
  clearTimeout(debounceTimer);
  searchController?.abort();
}

function closeSuggestions() {
  els.suggestions.hidden = true;
  els.input.setAttribute('aria-expanded', 'false');
  els.input.removeAttribute('aria-activedescendant');
  activeIndex = -1;
}

function choose(chosen) {
  cancelSearch();
  closeSuggestions();
  els.input.value = '';
  loadPlace(chosen);
}

// ---------- Use my location ----------

els.locate.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus("This browser can't share your location. Search for a city instead.");
    return;
  }
  setStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      closeSuggestions();
      // Two decimal places is about 1 km: plenty for weather, and it shares
      // less about exactly where the visitor is with the services we call.
      const here = {
        name: MY_LOCATION,
        detail: '',
        latitude: Number(coords.latitude.toFixed(2)),
        longitude: Number(coords.longitude.toFixed(2)),
      };
      // Start loading the weather right away; the town's name can arrive after.
      loadPlace(here);

      const named = await nameForCoordinates(here.latitude, here.longitude).catch(() => null);
      if (!named) return; // keep calling it "Your location"
      Object.assign(here, { name: named.name, detail: named.detail, countryCode: named.countryCode });
      // If the weather already showed up, redraw the name and remember it.
      if (place === here) {
        renderPlace(lastForecast);
        save('weather-place', place);
        rememberRecent(place);
      }
    },
    (error) => {
      setStatus(error.code === error.PERMISSION_DENIED
        ? 'Location access is blocked. Search for a city instead.'
        : "Couldn't find your location. Search for a city instead.");
    },
    { timeout: 10000 },
  );
});

// ---------- Units ----------

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

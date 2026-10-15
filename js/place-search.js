// Finding places: turns what the visitor types into places with coordinates.
//
// Two free geocoding services, neither needs an API key:
//   - Open-Meteo Geocoding (https://open-meteo.com/en/docs/geocoding-api)
//       Fast. Handles "Springfield, IL", "NYC" and ZIP codes, but not typos.
//       Used for every search.
//   - Photon (https://photon.komoot.io), built on OpenStreetMap data
//       Slower, but good at guessing typos ("Springfeild" → Springfield), and it
//       can name the place at a set of coordinates. Only used when Open-Meteo
//       finds nothing, and for "Use my location", to go easy on its free server.
//
// The two services answer in different shapes, so each answer is "normalized"
// into the one shape the rest of the page uses:
//   { name, detail, countryCode, latitude, longitude }

import { apiUrl, getJSON } from './api.js';

// Answers we already have, so typing "Spr" → "Spri" → "Spr" (backspace)
// doesn't ask the server the same question twice.
const cache = new Map();

// Open-Meteo: up to 6 places for the search text, best match first.
export function searchPlaces(query, { signal } = {}) {
  return cached(`open-meteo:${query}`, () => searchOpenMeteo(query, signal));
}

// Photon: its best guesses for a misspelled place. Use when searchPlaces finds nothing.
export function guessPlaces(query, { signal } = {}) {
  return cached(`photon:${query}`, () => searchPhoton(query, signal));
}

async function cached(key, search) {
  key = key.toLowerCase();
  if (!cache.has(key)) cache.set(key, await search());
  return cache.get(key);
}

async function searchOpenMeteo(query, signal) {
  const data = await getJSON(apiUrl('https://geocoding-api.open-meteo.com/v1/search', {
    name: query,
    count: 10,
    language: 'en',
  }), { signal });

  // The answer leaves "results" out entirely when nothing matches.
  const results = data.results ?? [];

  // Results include airports, parks and beaches too. Each one has a GeoNames
  // feature_code, and towns and cities all start with "PPL" ("populated place").
  // Keep just the towns, unless there aren't any (someone searching "Yosemite").
  const towns = results.filter((result) => result.feature_code?.startsWith('PPL'));
  const best = towns.length > 0 ? towns : results;

  return best.slice(0, 6).map((result) => ({
    name: result.name,
    detail: [result.admin1, result.country].filter(Boolean).join(', '),
    countryCode: result.country_code,
    latitude: result.latitude,
    longitude: result.longitude,
  }));
}

async function searchPhoton(query, signal) {
  const data = await getJSON(apiUrl('https://photon.komoot.io/api/', {
    q: query,
    limit: 6,
    lang: 'en',
    layer: 'city', // towns and cities only, not streets or shops
  }), { signal, timeout: 10000 }); // Photon's free server can be slow

  return data.features.map(fromPhoton);
}

// Names the town at a set of coordinates (for "Use my location").
// Returns { name, detail, countryCode }, or null if Photon doesn't know.
export async function nameForCoordinates(latitude, longitude) {
  const data = await getJSON(apiUrl('https://photon.komoot.io/reverse', {
    lat: latitude,
    lon: longitude,
    lang: 'en',
  }), { timeout: 15000 }); // the weather is already showing, so we can wait for the name

  const feature = data.features[0];
  if (!feature) return null;

  // The nearest thing is often a shop or a street (like "Sephora" in New York),
  // so use the town it's in. If the nearest thing is the town itself, use its name.
  const p = feature.properties;
  const town = p.type === 'city' ? p.name : p.city ?? p.locality ?? p.district ?? p.county;
  if (!town) return null;
  return {
    name: town,
    detail: [p.state, p.country].filter(Boolean).join(', '),
    countryCode: p.countrycode,
  };
}

// Photon answers in GeoJSON, where each place is a "feature" with "properties"
// and a "geometry". Careful: GeoJSON lists coordinates as [longitude, latitude],
// the opposite of the usual order.
function fromPhoton(feature) {
  const { name, state, country, countrycode } = feature.properties;
  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    name,
    detail: [state, country].filter(Boolean).join(', '),
    countryCode: countrycode,
    latitude,
    longitude,
  };
}

// "US" → 🇺🇸. A flag emoji is two special letters, one for each letter of the code.
// (Windows doesn't draw flag emoji, so there it shows as the two letters instead.)
export function flagEmoji(countryCode) {
  if (!/^[a-z]{2}$/i.test(countryCode ?? '')) return '';
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

// Helpers for calling web APIs, shared by weather.js and place-search.js.
//
// Every API call on the weather page goes through getJSON():
//   1. apiUrl() builds the address, like https://api.open-meteo.com/v1/forecast?latitude=33.66&...
//   2. getJSON() sends it with fetch(), waits for the answer, and turns the JSON into a JS object.

// Builds a URL from an address and an object of parameters.
// searchParams takes care of special characters, like the space and "ã" in "São Paulo".
export function apiUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

// Fetches a URL and returns its JSON.
//   signal:  lets the caller cancel the request (see AbortController in weather.js)
//   timeout: gives up after this many milliseconds, so a slow server can't leave us waiting forever
export async function getJSON(url, { signal, timeout = 10000 } = {}) {
  // Stop when the caller cancels OR when time runs out, whichever comes first.
  const signals = [AbortSignal.timeout(timeout)];
  if (signal) signals.push(signal);

  const response = await fetch(url, { signal: AbortSignal.any(signals) });
  if (!response.ok) {
    // Open-Meteo explains bad requests in a "reason" field.
    const data = await response.json().catch(() => null);
    throw new Error(data?.reason ?? `The server had a problem (error ${response.status}).`);
  }
  return response.json();
}

// Turns any error from getJSON into a sentence for the status line.
export function friendlyError(error) {
  if (error.name === 'TimeoutError') {
    return 'The server is taking too long to answer. Try again in a moment.';
  }
  // fetch() throws a TypeError when it can't reach the server at all (like when offline).
  if (error instanceof TypeError) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return error.message;
}

// True when a request was cancelled on purpose (not a real problem to show anyone).
export function wasCancelled(error) {
  return error.name === 'AbortError';
}

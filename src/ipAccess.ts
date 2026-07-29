export type IranAccessStatus = 'allowed' | 'blocked' | 'error';

export type IranAccessResult = {
  status: IranAccessStatus;
  countryCode?: string;
  checkedAt: number;
};

const COUNTRY_ENDPOINT = 'https://api.country.is/';
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

let cachedResult: IranAccessResult | null = null;
let inFlightRequest: Promise<IranAccessResult> | null = null;

const isFresh = (result: IranAccessResult) =>
  Date.now() - result.checkedAt < CACHE_TTL_MS;

async function requestCountryCode(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(COUNTRY_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Country lookup failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    const countryCode = String(data?.country || '').trim().toUpperCase();

    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new Error('Country lookup returned an invalid country code');
    }

    return countryCode;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkIranNetworkAccess(
  forceRefresh = false,
): Promise<IranAccessResult> {
  if (!forceRefresh && cachedResult && isFresh(cachedResult)) {
    return cachedResult;
  }

  if (!forceRefresh && inFlightRequest) {
    return inFlightRequest;
  }

  const request = (async (): Promise<IranAccessResult> => {
    try {
      const countryCode = await requestCountryCode();
      const result: IranAccessResult = {
        status: countryCode === 'IR' ? 'allowed' : 'blocked',
        countryCode,
        checkedAt: Date.now(),
      };
      cachedResult = result;
      return result;
    } catch {
      const result: IranAccessResult = {
        status: 'error',
        checkedAt: Date.now(),
      };
      cachedResult = result;
      return result;
    }
  })();

  inFlightRequest = request;

  try {
    return await request;
  } finally {
    if (inFlightRequest === request) {
      inFlightRequest = null;
    }
  }
}

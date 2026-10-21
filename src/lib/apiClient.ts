const DEFAULT_API_BASE = ((import.meta as any).env?.VITE_API_URL as string) || 'http://127.0.0.1:4000/api';

export function getApiBaseUrl(): string {
  const stored = localStorage.getItem('zec_api_url');
  if (stored) return stored.replace(/\/+$/, '');
  return DEFAULT_API_BASE;
}

export function setApiBaseUrl(url: string) {
  const cleaned = url.trim().replace(/\/+$/, '');
  localStorage.setItem('zec_api_url', cleaned);
}

export async function testServerConnection(customUrl?: string): Promise<{ success: boolean; latencyMs?: number; message?: string }> {
  const base = (customUrl || getApiBaseUrl()).replace(/\/+$/, '');
  const healthUrl = `${base}/health`;
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(healthUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        success: true,
        latencyMs: Math.round(performance.now() - start),
        message: data.college || data.system || 'Connected',
      };
    }
    return { success: false, message: `Server responded with status ${res.status}` };
  } catch (err: any) {
    return { success: false, message: err.name === 'AbortError' ? 'Connection timed out' : 'Could not reach server' };
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem('zec_auth_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('zec_auth_token', token);
}

export function removeAuthToken() {
  localStorage.removeItem('zec_auth_token');
}

export function getWorkstationId(): string {
  let wsId = localStorage.getItem('zec_workstation_id');
  if (!wsId) {
    wsId = `WS-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    localStorage.setItem('zec_workstation_id', wsId);
  }
  return wsId;
}

export interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  _retryFallback?: boolean;
}

export async function apiRequest<T = any>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  let url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  // Append query params if any
  if (options.params) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(options.params)) {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, String(val));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const token = getAuthToken();
  const workstationId = getWorkstationId();

  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('X-Workstation-Id', workstationId);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 401) {
        removeAuthToken();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      const message = data?.message || `Server responded with error status ${response.status}`;
      const error: any = new Error(message);
      error.status = response.status;
      error.errorCode = data?.errorCode || 'HTTP_ERROR';
      error.errors = data?.errors;
      throw error;
    }

    return data as T;
  } catch (error: any) {
    if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed'))) {
      // Auto-fallback between 127.0.0.1 and localhost if connecting locally
      if (!options._retryFallback) {
        if (url.includes('127.0.0.1:4000')) {
          const fallbackBase = baseUrl.replace('127.0.0.1:4000', 'localhost:4000');
          try {
            const fallbackRes = await apiRequest<T>(endpoint, { ...options, _retryFallback: true });
            setApiBaseUrl(fallbackBase);
            return fallbackRes;
          } catch {
            // continue to throw standard error
          }
        } else if (url.includes('localhost:4000')) {
          const fallbackBase = baseUrl.replace('localhost:4000', '127.0.0.1:4000');
          try {
            const fallbackRes = await apiRequest<T>(endpoint, { ...options, _retryFallback: true });
            setApiBaseUrl(fallbackBase);
            return fallbackRes;
          } catch {
            // continue to throw standard error
          }
        }
      }

      const netError: any = new Error(
        `Unable to connect to ZEC Portal server at ${baseUrl}. Please check that the server is running and network connection is active.`
      );
      netError.errorCode = 'NETWORK_DISCONNECTED';
      throw netError;
    }
    throw error;
  }
}

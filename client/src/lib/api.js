import { sebHeaders } from './seb';

const TOKEN_KEY = 'cp_token';
const USER_KEY = 'cp_user';

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage blocked: session lives in memory only */
    }
  },
};

let memToken = store.get(TOKEN_KEY);
let memUser = (() => {
  try {
    return JSON.parse(store.get(USER_KEY) || 'null');
  } catch {
    return null;
  }
})();
const listeners = new Set();

export const auth = {
  get token() {
    return memToken;
  },
  get user() {
    return memUser;
  },
  set(token, user) {
    memToken = token;
    memUser = user;
    store.set(TOKEN_KEY, token);
    store.set(USER_KEY, user ? JSON.stringify(user) : null);
    listeners.forEach((fn) => fn(user));
  },
  clear() {
    this.set(null, null);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** api('GET', '/c/contests') -> data. Throws ApiError. */
export async function api(method, path, body, { raw = false } = {}) {
  const headers = { ...sebHeaders() };
  if (memToken) headers.Authorization = `Bearer ${memToken}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network problem. Check your internet connection.');
  }
  if (raw && res.ok) return res;
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !json?.ok) {
    const err = json?.error || {};
    if (res.status === 401) {
      auth.clear();
      window.dispatchEvent(new CustomEvent('cp:logout', { detail: { code: err.code, message: err.message } }));
    }
    throw new ApiError(res.status, err.code || 'ERROR', err.message || `Request failed (${res.status})`, err.details);
  }
  return json.data;
}

/** Download a file from an authenticated endpoint. */
export async function download(path, filename) {
  const res = await api('GET', path, undefined, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(
      typeof body === 'object' && body && 'message' in body
        ? String((body as any).message)
        : `API error ${status}`,
    );
  }
}

type GetToken = () => Promise<string | null>;

let tokenGetter: GetToken = async () => null;
let onUnauthorized: (() => void) | null = null;

export function setTokenGetter(fn: GetToken) {
  tokenGetter = fn;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(path: string, options: RequestInit = {}, explicitToken?: string | null): Promise<T> {
  const token = explicitToken ?? (await tokenGetter());
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401 && token) {
    onUnauthorized?.();
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text();

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, explicitToken?: string | null) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, explicitToken),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

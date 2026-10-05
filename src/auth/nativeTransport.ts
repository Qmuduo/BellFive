import { AuthClientError } from './contracts';
import type { AuthTransport } from './contracts';

export const nativeAuthTransport: AuthTransport = async request => {
  const baseUrl = process.env.EXPO_PUBLIC_AUTH_SERVER_URL?.trim() || 'http://localhost:8787';
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}${request.path}`, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(request.token ? { Authorization: `Bearer ${request.token}` } : {}),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
  } catch {
    throw new AuthClientError('NETWORK_ERROR', 'The account service could not be reached.');
  }
  if (response.status === 204) return undefined;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AuthClientError('INVALID_RESPONSE', 'The account service returned an invalid response.');
  }
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    throw new AuthClientError(
      typeof error.code === 'string' ? error.code : 'SERVER_ERROR',
      typeof error.message === 'string' ? error.message : 'The account request failed.',
    );
  }
  return payload;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

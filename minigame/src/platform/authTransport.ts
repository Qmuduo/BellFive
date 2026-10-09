import { AuthClientError, type AuthTransport } from '../../../src/auth/contracts';
import type { MiniGameWxApi } from './wxApi';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createWxAuthTransport(api: Pick<MiniGameWxApi, 'request'>, baseUrl: string): AuthTransport {
  return request => new Promise((resolve, reject) => {
    if (request.method === 'PATCH' && request.path !== '/auth/me/profile') {
      reject(new AuthClientError('UNSUPPORTED_METHOD', 'This account operation is not supported by Mini Game networking.'));
      return;
    }
    // Native wx.request excludes PATCH. The server exposes an equivalent authenticated POST alias.
    const method = request.method === 'PATCH' ? 'POST' : request.method;
    const networkFailure = () => reject(new AuthClientError('NETWORK_ERROR', 'The account service could not be reached.'));
    try {
      api.request({ url: `${baseUrl.trim().replace(/\/+$/, '')}${request.path}`, method,
        header: { Accept: 'application/json',
          ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(request.token ? { Authorization: `Bearer ${request.token}` } : {}),
        },
        ...(request.body === undefined ? {} : { data: JSON.stringify(request.body) }),
        dataType: 'json', timeout: 15_000,
        success(result) {
          if (result.statusCode === 204) { resolve(undefined); return; }
          let payload: unknown = result.data;
          if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); }
            catch { reject(new AuthClientError('INVALID_RESPONSE', 'The account service returned an invalid response.')); return; }
          }
          if (payload === undefined || payload === null) {
            reject(new AuthClientError('INVALID_RESPONSE', 'The account service returned an invalid response.')); return;
          }
          if (result.statusCode < 200 || result.statusCode >= 300) {
            const error = record(payload) && record(payload.error) ? payload.error : {};
            reject(new AuthClientError(typeof error.code === 'string' ? error.code : 'SERVER_ERROR',
              typeof error.message === 'string' ? error.message : 'The account request failed.'));
            return;
          }
          resolve(payload);
        },
        fail: networkFailure,
      });
    } catch { networkFailure(); }
  });
}

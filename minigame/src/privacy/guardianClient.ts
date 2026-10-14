import { AuthClientError } from '../../../src/auth/contracts';
import type { MiniGameWxApi } from '../platform/wxApi';

export interface GuardianClient {
  request(email: string, policyVersion: string): Promise<void>;
}

export function createGuardianClient(api: Pick<MiniGameWxApi, 'request'>, baseUrl: string): GuardianClient {
  return {
    request(email, policyVersion) {
      return new Promise((resolve, reject) => {
        try {
          api.request({
            url: `${baseUrl.trim().replace(/\/+$/, '')}/auth/guardian-requests`,
            method: 'POST',
            header: { Accept: 'application/json', 'Content-Type': 'application/json' },
            data: JSON.stringify({ email: email.trim(), policyVersion }),
            dataType: 'json', timeout: 15_000,
            success(result) {
              if (result.statusCode >= 200 && result.statusCode < 300) { resolve(); return; }
              let payload: unknown = result.data;
              if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = null; } }
              const error = payload && typeof payload === 'object' && 'error' in payload
                ? (payload as { error?: { code?: unknown } }).error : undefined;
              reject(new AuthClientError(typeof error?.code === 'string' ? error.code : 'GUARDIAN_REQUEST_FAILED',
                'The guardian confirmation request could not be sent.'));
            },
            fail() { reject(new AuthClientError('NETWORK_ERROR', 'The guardian service could not be reached.')); },
          });
        } catch {
          reject(new AuthClientError('NETWORK_ERROR', 'The guardian service could not be reached.'));
        }
      });
    },
  };
}

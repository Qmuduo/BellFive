import Taro from '@tarojs/taro';
import { AuthClientError } from '../../../src/auth/contracts';
import type { AuthTransport, AuthTransportRequest } from '../../../src/auth/contracts';
import { miniAuthUrl } from './miniConfig';

type TaroAuthResponse = Readonly<{ statusCode: number; data: unknown }>;
type ServerErrorPayload = Readonly<{ error?: Readonly<{ code?: unknown; message?: unknown }> }>;

export function createTaroAuthTransport(baseUrl: string = miniAuthUrl): AuthTransport {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  return async (request: AuthTransportRequest): Promise<unknown> => {
    if (!normalizedBaseUrl) {
      throw new AuthClientError('AUTH_NOT_CONFIGURED', 'The Mini Program account service URL is not configured.');
    }

    const header: Record<string, string> = { 'content-type': 'application/json' };
    if (request.token) header.authorization = `Bearer ${request.token}`;
    let response: TaroAuthResponse;
    try {
      response = await Taro.request({
        url: `${normalizedBaseUrl}${request.path.startsWith('/') ? request.path : `/${request.path}`}`,
        method: request.method,
        ...(request.body !== undefined ? { data: request.body } : {}),
        header,
      }) as TaroAuthResponse;
    } catch {
      throw new AuthClientError('NETWORK_ERROR', 'The account service could not be reached.');
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw toServerError(response);
    }
    return response.data;
  };
}

function toServerError(response: TaroAuthResponse): AuthClientError {
  const payload = response.data as ServerErrorPayload | null;
  const serverCode = payload?.error?.code;
  const serverMessage = payload?.error?.message;
  return new AuthClientError(
    typeof serverCode === 'string' && serverCode ? serverCode : `HTTP_${response.statusCode}`,
    typeof serverMessage === 'string' && serverMessage ? serverMessage : 'The account service rejected the request.',
  );
}

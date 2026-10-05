import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthService } from './service';
import { AuthServiceError, type AuthErrorCode } from './types';

export interface AuthHttpConfig { corsOrigins: readonly string[]; }

const MAX_BODY_BYTES = 16 * 1024;
const SERVICE_ERRORS: Record<AuthErrorCode, { status: number; message: string }> = {
  INVALID_INPUT: { status: 400, message: 'The account input is invalid.' },
  INVALID_CREDENTIALS: { status: 401, message: 'The account credentials are invalid.' },
  USERNAME_TAKEN: { status: 409, message: 'That username is already in use.' },
  WECHAT_CODE_INVALID: { status: 400, message: 'The WeChat login code is invalid or expired.' },
  WECHAT_NOT_CONFIGURED: { status: 503, message: 'WeChat login is not configured on this server.' },
  WECHAT_IDENTITY_CONFLICT: { status: 409, message: 'That WeChat identity cannot be linked to this account.' },
};

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function parseBearerToken(request: IncomingMessage): string | null {
  let count = 0;
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    if (request.rawHeaders[i].toLowerCase() === 'authorization') count++;
  }
  if (count !== 1 || typeof request.headers.authorization !== 'string') return null;
  return /^Bearer ([a-z0-9._~+\/-]+=*)$/i.exec(request.headers.authorization)?.[1] ?? null;
}

export async function handleAuthHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  authService: AuthService | undefined,
  config: AuthHttpConfig,
): Promise<boolean> {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (path !== '/health' && !path.startsWith('/auth/')) return false;
  response.setHeader('Vary', 'Origin');
  response.setHeader('Cache-Control', 'no-store');
  try {
    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (typeof origin !== 'string' || origin === '*' || !config.corsOrigins.includes(origin)) {
        throw new HttpError(403, 'CORS_ORIGIN_DENIED', 'This browser origin is not allowed.');
      }
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.writeHead(204);
      response.end();
      return true;
    }
    const route = `${request.method} ${path}`;
    if (route === 'GET /health') {
      sendJson(response, 200, { status: 'ok' });
      return true;
    }
    const publicRoutes = ['POST /auth/register', 'POST /auth/login', 'POST /auth/wechat/login', 'POST /auth/password/reset/wechat'];
    const protectedRoutes = ['POST /auth/wechat/link', 'POST /auth/credentials', 'GET /auth/me', 'PATCH /auth/me/profile', 'POST /auth/logout'];
    if (!publicRoutes.includes(route) && !protectedRoutes.includes(route)) {
      throw new HttpError(404, 'NOT_FOUND', 'The account route was not found.');
    }
    if (!authService) throw new HttpError(503, 'AUTH_NOT_CONFIGURED', 'The account service is not configured.');
    const token = parseBearerToken(request);
    const principal = protectedRoutes.includes(route) && token ? await authService.authenticateToken(token) : null;
    if (protectedRoutes.includes(route) && !principal) {
      throw new HttpError(401, 'UNAUTHORIZED', 'A valid account session is required.');
    }
    if (route === 'GET /auth/me') {
      sendJson(response, 200, await authService.getUser(principal!.userId));
    } else if (route === 'POST /auth/logout') {
      if (Number(request.headers['content-length']) > 0 || request.headers['transfer-encoding']) await readJson(request);
      await authService.logout(token!);
      response.writeHead(204);
      response.end();
    } else {
      const body = await readJson(request);
      switch (route) {
        case 'POST /auth/register':
          sendJson(response, 201, await authService.register({ username: stringField(body, 'username'), password: stringField(body, 'password') }, body.initialProfile));
          break;
        case 'POST /auth/login':
          sendJson(response, 200, await authService.login(stringField(body, 'username'), stringField(body, 'password')));
          break;
        case 'POST /auth/wechat/login':
          sendJson(response, 200, await authService.loginWithWechat(stringField(body, 'code')));
          break;
        case 'POST /auth/wechat/link':
          if (typeof body.confirmedTransfer !== 'boolean') throw new AuthServiceError('INVALID_INPUT');
          sendJson(response, 200, await authService.bindWechat({ code: stringField(body, 'code'), username: stringField(body, 'username'), password: stringField(body, 'password'), confirmedTransfer: body.confirmedTransfer }));
          break;
        case 'POST /auth/credentials':
          sendJson(response, 200, await authService.addPasswordCredential(principal!.userId, stringField(body, 'username'), stringField(body, 'password')));
          break;
        case 'PATCH /auth/me/profile':
          if (!('profile' in body)) throw new AuthServiceError('INVALID_INPUT');
          await authService.updateProfile(principal!.userId, body.profile);
          sendJson(response, 200, await authService.getUser(principal!.userId));
          break;
        case 'POST /auth/password/reset/wechat':
          sendJson(response, 200, await authService.resetPasswordWithWechat(stringField(body, 'code'), stringField(body, 'newPassword')));
          break;
      }
    }
  } catch (error) {
    if (error instanceof AuthServiceError) {
      const mapped = SERVICE_ERRORS[error.code];
      sendJson(response, mapped.status, { error: { code: error.code, message: mapped.message } });
    } else if (error instanceof HttpError) {
      sendJson(response, error.status, { error: { code: error.code, message: error.message } });
    } else {
      sendJson(response, 500, { error: { code: 'SERVER_ERROR', message: 'The account service could not process that request.' } });
    }
  } finally {
    // Drain unused/oversized request bodies without retaining their contents.
    request.resume();
  }
  return true;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== 'string') throw new AuthServiceError('INVALID_INPUT');
  return value;
}

function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
    return Promise.reject(new HttpError(413, 'BODY_TOO_LARGE', 'The JSON body exceeds 16 KiB.'));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const cleanup = () => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
    };
    const onError = () => { cleanup(); reject(new HttpError(400, 'INVALID_JSON', 'The JSON body could not be read.')); };
    const onAborted = () => onError();
    const onData = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        cleanup();
        reject(new HttpError(413, 'BODY_TOO_LARGE', 'The JSON body exceeds 16 KiB.'));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { reject(new HttpError(400, 'INVALID_JSON', 'The request body must be valid JSON.')); return; }
      if (!body || typeof body !== 'object' || Array.isArray(body)) { reject(new AuthServiceError('INVALID_INPUT')); return; }
      resolve(body as Record<string, unknown>);
    };
    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
    request.on('aborted', onAborted);
  });
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthService } from './service';
import { AuthServiceError, type AuthErrorCode } from './types';
import type { GuardianConsentService } from './guardianConsent';

export interface AuthHttpConfig {
  corsOrigins: readonly string[];
  guardianConsent?: GuardianConsentService;
  onAccountDeleted?: (userId: string) => void;
}

const MAX_BODY_BYTES = 16 * 1024;
const SERVICE_ERRORS: Record<AuthErrorCode, { status: number; message: string }> = {
  INVALID_INPUT: { status: 400, message: 'The account input is invalid.' },
  INVALID_CREDENTIALS: { status: 401, message: 'The account credentials are invalid.' },
  USERNAME_TAKEN: { status: 409, message: 'That username is already in use.' },
  WECHAT_CODE_INVALID: { status: 400, message: 'The WeChat login code is invalid or expired.' },
  WECHAT_NOT_CONFIGURED: { status: 503, message: 'WeChat login is not configured on this server.' },
  WECHAT_IDENTITY_CONFLICT: { status: 409, message: 'That WeChat identity cannot be linked to this account.' },
  GUARDIAN_GRANT_INVALID: { status: 400, message: 'The guardian confirmation code is invalid.' },
  GUARDIAN_GRANT_EXPIRED: { status: 410, message: 'The guardian confirmation code has expired.' },
  GUARDIAN_GRANT_USED: { status: 409, message: 'The guardian confirmation code has already been used.' },
  GUARDIAN_CONFIRMATION_EXPIRED: { status: 410, message: 'The guardian confirmation link has expired.' },
  GUARDIAN_CONFIRMATION_INVALID: { status: 400, message: 'The guardian confirmation link is invalid or has already been used.' },
  GUARDIAN_MAIL_UNAVAILABLE: { status: 503, message: 'Guardian email confirmation is temporarily unavailable.' },
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
  const url = new URL(request.url ?? '/', 'http://localhost');
  const path = url.pathname;
  if (path !== '/health' && !path.startsWith('/auth/') && path !== '/guardian/confirm') return false;
  response.setHeader('Vary', 'Origin');
  response.setHeader('Cache-Control', 'no-store');
  try {
    const origin = request.headers.origin;
    if (origin !== undefined) {
      const guardianSameOrigin = path === '/guardian/confirm' && typeof origin === 'string'
        && config.guardianConsent?.isSameOrigin(origin) === true;
      if (typeof origin !== 'string' || origin === '*' || (!config.corsOrigins.includes(origin) && !guardianSameOrigin)) {
        throw new HttpError(403, 'CORS_ORIGIN_DENIED', 'This browser origin is not allowed.');
      }
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
    if (route === 'GET /guardian/confirm') {
      if (!config.guardianConsent) throw new HttpError(503, 'GUARDIAN_NOT_CONFIGURED', 'Guardian confirmation is not configured.');
      sendHtml(response, 200, config.guardianConsent.confirmationPage(url.searchParams.get('token') ?? ''));
      return true;
    }
    if (route === 'POST /guardian/confirm') {
      if (!config.guardianConsent) throw new HttpError(503, 'GUARDIAN_NOT_CONFIGURED', 'Guardian confirmation is not configured.');
      const form = await readForm(request);
      sendHtml(response, 200, config.guardianConsent.confirm(stringField(form, 'token'), form.guardianAttested === 'yes'));
      return true;
    }
    const publicRoutes = ['POST /auth/register', 'POST /auth/login', 'POST /auth/wechat/login', 'POST /auth/password/reset/wechat', 'POST /auth/guardian-requests'];
    const protectedRoutes = ['POST /auth/wechat/link', 'POST /auth/credentials', 'GET /auth/me', 'PATCH /auth/me/profile', 'POST /auth/me/profile',
      'POST /auth/me/privacy-consent', 'POST /auth/me/guardian-consent', 'DELETE /auth/me', 'POST /auth/logout'];
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
          sendJson(response, 201, await authService.register({ username: stringField(body, 'username'), password: stringField(body, 'password'),
            ...privacyFields(body) }, body.initialProfile));
          break;
        case 'POST /auth/login':
          sendJson(response, 200, await authService.login(stringField(body, 'username'), stringField(body, 'password'), privacyFields(body)));
          break;
        case 'POST /auth/wechat/login':
          sendJson(response, 200, await authService.loginWithWechat(stringField(body, 'code'), privacyFields(body)));
          break;
        case 'POST /auth/wechat/link':
          if (typeof body.confirmedTransfer !== 'boolean') throw new AuthServiceError('INVALID_INPUT');
          sendJson(response, 200, await authService.bindWechat({ code: stringField(body, 'code'), username: stringField(body, 'username'), password: stringField(body, 'password'), confirmedTransfer: body.confirmedTransfer, ...privacyFields(body) }));
          break;
        case 'POST /auth/credentials':
          sendJson(response, 200, await authService.addPasswordCredential(principal!.userId, stringField(body, 'username'), stringField(body, 'password')));
          break;
        case 'PATCH /auth/me/profile':
        case 'POST /auth/me/profile':
          if (!('profile' in body)) throw new AuthServiceError('INVALID_INPUT');
          await authService.updateProfile(principal!.userId, body.profile);
          sendJson(response, 200, await authService.getUser(principal!.userId));
          break;
        case 'POST /auth/password/reset/wechat':
          sendJson(response, 200, await authService.resetPasswordWithWechat(stringField(body, 'code'), stringField(body, 'newPassword'), privacyFields(body)));
          break;
        case 'POST /auth/guardian-requests':
          if (!config.guardianConsent) throw new HttpError(503, 'GUARDIAN_NOT_CONFIGURED', 'Guardian confirmation is not configured.');
          await config.guardianConsent.requestConfirmation(stringField(body, 'email'), stringField(body, 'policyVersion'), request.socket.remoteAddress ?? 'unknown');
          sendJson(response, 202, { accepted: true });
          break;
        case 'POST /auth/me/privacy-consent':
          await authService.recordPrivacyConsent(principal!.userId, stringField(body, 'privacyPolicyVersion'));
          response.writeHead(204); response.end();
          break;
        case 'POST /auth/me/guardian-consent':
          await authService.recordGuardianConsent(principal!.userId, stringField(body, 'guardianGrant'), stringField(body, 'privacyPolicyVersion'));
          response.writeHead(204); response.end();
          break;
        case 'DELETE /auth/me': {
          const reauthentication = {
            ...(typeof body.password === 'string' ? { password: body.password } : {}),
            ...(typeof body.wechatCode === 'string' ? { wechatCode: body.wechatCode } : {}),
          };
          await authService.deleteAccount(principal!.userId, reauthentication);
          config.onAccountDeleted?.(principal!.userId);
          response.writeHead(204); response.end();
          break;
        }
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

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  response.end(html);
}

function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== 'string') throw new AuthServiceError('INVALID_INPUT');
  return value;
}

function privacyFields(body: Record<string, unknown>): { privacyPolicyVersion?: string; guardianGrant?: string } {
  if (body.privacyPolicyVersion !== undefined && typeof body.privacyPolicyVersion !== 'string') throw new AuthServiceError('INVALID_INPUT');
  if (body.guardianGrant !== undefined && typeof body.guardianGrant !== 'string') throw new AuthServiceError('GUARDIAN_GRANT_INVALID');
  return {
    ...(typeof body.privacyPolicyVersion === 'string' ? { privacyPolicyVersion: body.privacyPolicyVersion } : {}),
    ...(typeof body.guardianGrant === 'string' ? { guardianGrant: body.guardianGrant } : {}),
  };
}

function readForm(request: IncomingMessage): Promise<Record<string, string>> {
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
    return Promise.reject(new HttpError(413, 'BODY_TOO_LARGE', 'The form body exceeds 16 KiB.'));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const cleanup = () => { request.off('data', onData); request.off('end', onEnd); request.off('error', onError); request.off('aborted', onError); };
    const onError = () => { cleanup(); reject(new HttpError(400, 'INVALID_FORM', 'The confirmation form could not be read.')); };
    const onData = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) { cleanup(); reject(new HttpError(413, 'BODY_TOO_LARGE', 'The form body exceeds 16 KiB.')); return; }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const tokenValues = params.getAll('token'); const attestationValues = params.getAll('guardianAttested');
      if (tokenValues.length !== 1 || attestationValues.length > 1) { reject(new AuthServiceError('INVALID_INPUT')); return; }
      resolve({ token: tokenValues[0], ...(attestationValues.length ? { guardianAttested: attestationValues[0] } : {}) });
    };
    request.on('data', onData); request.on('end', onEnd); request.on('error', onError); request.on('aborted', onError);
  });
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

import { AuthClientError } from '../../../src/auth/contracts';
import { DEFAULT_PLAYER_PROFILE, sanitizePlayerProfile } from '../../../src/profile';
import { EMPTY_PRIVACY_FLOW, PRIVACY_POLICY_VERSION, type PrivacyAgePath, type ProtectedAction } from './policy';
import { createGuardianClient } from './guardianClient';
import type { MiniGameApp } from '../runtime/navigation';
import type { MiniGameStores } from '../stores/gameStore';
import type { MiniGameWxApi } from '../platform/wxApi';

export interface WxPrivacyAdapter {
  getSetting(): Promise<{ needAuthorization: boolean }>;
  requireAuthorization(): Promise<void>;
  openContract(): Promise<void>;
}

async function ensureWechatPrivacy(api: MiniGameWxApi): Promise<void> {
  const adapter = createWxPrivacyAdapter(api);
  const setting = await adapter.getSetting();
  if (setting.needAuthorization) await adapter.requireAuthorization();
}

export function createWxPrivacyAdapter(api: MiniGameWxApi): WxPrivacyAdapter {
  const unavailable = () => new AuthClientError('PRIVACY_API_UNAVAILABLE', 'The WeChat privacy API is unavailable.');
  return {
    getSetting() {
      return new Promise((resolve, reject) => {
        if (!api.getPrivacySetting) { reject(unavailable()); return; }
        try {
          api.getPrivacySetting({
            success(result) {
              if (typeof result.needAuthorization !== 'boolean') {
                reject(new AuthClientError('PRIVACY_SETTING_FAILED', 'WeChat privacy settings could not be read.'));
                return;
              }
              resolve({ needAuthorization: result.needAuthorization });
            },
            fail() { reject(new AuthClientError('PRIVACY_SETTING_FAILED', 'WeChat privacy settings could not be read.')); },
          });
        } catch { reject(new AuthClientError('PRIVACY_SETTING_FAILED', 'WeChat privacy settings could not be read.')); }
      });
    },
    requireAuthorization() {
      return new Promise((resolve, reject) => {
        if (!api.requirePrivacyAuthorize) { reject(unavailable()); return; }
        try {
          api.requirePrivacyAuthorize({ success: () => resolve(), fail: () => reject(new AuthClientError('PRIVACY_REFUSED', 'Privacy authorization was not granted.')) });
        } catch { reject(new AuthClientError('PRIVACY_REFUSED', 'Privacy authorization was not granted.')); }
      });
    },
    openContract() {
      return new Promise((resolve, reject) => {
        if (!api.openPrivacyContract) { reject(unavailable()); return; }
        try {
          api.openPrivacyContract({ success: () => resolve(), fail: () => reject(new AuthClientError('PRIVACY_CONTRACT_UNAVAILABLE', 'The privacy policy could not be opened.')) });
        } catch { reject(new AuthClientError('PRIVACY_CONTRACT_UNAVAILABLE', 'The privacy policy could not be opened.')); }
      });
    },
  };
}

export function privacyReady(app: MiniGameApp): boolean {
  const flow = app.getState().privacy;
  return flow.acceptedPolicyVersion === PRIVACY_POLICY_VERSION
    && (flow.agePath === '14plus' || flow.agePath === 'under14')
    && (flow.agePath !== 'under14' || flow.guardianConfirmed);
}

export function currentAuthPrivacy(app: MiniGameApp): { privacyPolicyVersion: string; guardianGrant?: string } | undefined {
  if (!privacyReady(app)) return undefined;
  const flow = app.getState().privacy;
  return {
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    ...(flow.agePath === 'under14' && flow.guardianGrant ? { guardianGrant: flow.guardianGrant } : {}),
  };
}

export function beginProtectedAction(action: ProtectedAction, app: MiniGameApp): void {
  const flow = app.getState().privacy;
  if (privacyReady(app)) return;
  app.update({ privacy: { ...flow, step: 'notice', pendingAction: action, errorCode: null, busy: false } });
  app.navigation.navigate('privacy');
}

export function resetPrivacyFlow(app: MiniGameApp): void {
  app.update({ privacy: { ...EMPTY_PRIVACY_FLOW } });
  app.setField('privacyEmail', '');
  app.setField('guardianGrant', '');
}

export function clearGuardianSecret(app: MiniGameApp): void {
  const flow = app.getState().privacy;
  app.update({ privacy: { ...flow, guardianGrant: null,
    ...(flow.guardianGrant ? { guardianConfirmed: false, acceptedPolicyVersion: null, pendingAction: null, step: 'idle' as const } : {}) } });
  app.setField('guardianGrant', '');
  app.setField('privacyEmail', '');
  if (flow.guardianGrant && app.navigation.current === 'privacy') app.navigation.navigate('home', true);
}

export function invalidateGuardianAuthorization(app: MiniGameApp, code: string): void {
  if (!['GUARDIAN_GRANT_INVALID', 'GUARDIAN_GRANT_EXPIRED', 'GUARDIAN_GRANT_USED'].includes(code)) return;
  const flow = app.getState().privacy;
  app.update({ privacy: { ...flow, guardianGrant: null, guardianConfirmed: false, acceptedPolicyVersion: null,
    pendingAction: null, step: 'idle', busy: false } });
}

export async function sendGuardianRequest(api: MiniGameWxApi, authUrl: string, app: MiniGameApp): Promise<void> {
  const email = app.getState().fields.privacyEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    app.update({ privacy: { ...app.getState().privacy, errorCode: 'INVALID_GUARDIAN_EMAIL' } });
    return;
  }
  const current = app.getState().privacy;
  app.update({ privacy: { ...current, busy: true, errorCode: null } });
  try {
    await ensureWechatPrivacy(api);
    await createGuardianClient(api, authUrl).request(email, PRIVACY_POLICY_VERSION);
    app.setField('privacyEmail', '');
    app.update({ privacy: { ...app.getState().privacy, step: 'guardian-code', busy: false } });
  } catch (error) {
    app.update({ privacy: { ...app.getState().privacy, busy: false,
      errorCode: error instanceof AuthClientError ? error.code : 'NETWORK_ERROR' } });
  }
}

export async function completeGuardianGrant(app: MiniGameApp, stores: MiniGameStores,
  resume: (action: ProtectedAction) => Promise<void>): Promise<void> {
  const code = app.getState().fields.guardianGrant.trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(code)) {
    app.update({ privacy: { ...app.getState().privacy, errorCode: 'INVALID_GUARDIAN_GRANT' } });
    return;
  }
  const current = app.getState().privacy;
  app.update({ privacy: { ...current, busy: true, errorCode: null } });
  try {
    await ensureWechatPrivacy(stores.wx);
    const auth = stores.auth.getState();
    let grantApplied = false;
    if (auth.sessionToken && auth.profileVerified && auth.user) {
      await auth.recordGuardianConsent(code, PRIVACY_POLICY_VERSION);
      grantApplied = true;
    }
    const action = app.getState().privacy.pendingAction;
    app.update({ privacy: { ...app.getState().privacy, step: 'idle', guardianGrant: grantApplied ? null : code,
      guardianConfirmed: true, acceptedPolicyVersion: PRIVACY_POLICY_VERSION, busy: false, errorCode: null,
      pendingAction: null } });
    app.setField('guardianGrant', '');
    if (action) await resume(action);
  } catch (error) {
    app.update({ privacy: { ...app.getState().privacy, busy: false,
      errorCode: error instanceof AuthClientError ? error.code : 'NETWORK_ERROR' } });
  }
}

export async function acceptPrivacyAge(agePath: Exclude<PrivacyAgePath, null>,
  api: MiniGameWxApi, app: MiniGameApp, stores: MiniGameStores,
  resume: (action: ProtectedAction) => Promise<void>): Promise<void> {
  const current = app.getState().privacy;
  app.update({ privacy: { ...current, agePath, busy: agePath === '14plus', errorCode: null } });
  if (agePath === 'under14') {
    stores.profile.getState().setProfile(sanitizePlayerProfile(DEFAULT_PLAYER_PROFILE, 'A'));
    app.update({ privacy: { ...app.getState().privacy, step: 'guardian-email', busy: false } });
    return;
  }
  try {
    await ensureWechatPrivacy(api);
    const auth = stores.auth.getState();
    if (auth.sessionToken && auth.profileVerified && auth.user) {
      await auth.recordPrivacyConsent(PRIVACY_POLICY_VERSION);
    }
    app.update({ privacy: { ...app.getState().privacy, step: 'idle', acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
      guardianConfirmed: false, busy: false, errorCode: null } });
    const action = app.getState().privacy.pendingAction;
    app.update({ privacy: { ...app.getState().privacy, pendingAction: null } });
    if (action) await resume(action);
  } catch (error) {
    app.update({ privacy: { ...app.getState().privacy, step: 'age', acceptedPolicyVersion: null, busy: false,
      errorCode: error instanceof AuthClientError ? error.code : 'PRIVACY_REFUSED' } });
  }
}

export async function openPrivacyContract(api: MiniGameWxApi, app: MiniGameApp): Promise<void> {
  const adapter = createWxPrivacyAdapter(api);
  try {
    await adapter.openContract();
  } catch {
    app.update({ privacy: { ...app.getState().privacy, step: 'policy', errorCode: null } });
  }
}

export function cancelPrivacyFlow(app: MiniGameApp): void {
  const flow = app.getState().privacy;
  app.update({ privacy: { ...flow, step: 'idle', pendingAction: null, busy: false, errorCode: null } });
  app.clearPasswords();
  app.navigation.navigate('home', true);
}

export async function applyMinorGrantAfterLogin(app: MiniGameApp): Promise<void> {
  const flow = app.getState().privacy;
  if (flow.agePath === 'under14' && flow.guardianGrant) {
    app.update({ privacy: { ...flow, guardianGrant: null, guardianConfirmed: true } });
  }
}

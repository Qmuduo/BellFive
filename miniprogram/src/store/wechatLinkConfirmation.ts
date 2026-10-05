import type { WechatLinkInput } from '../../../src/auth/contracts';

export type WechatLinkCredentials = Pick<WechatLinkInput, 'username' | 'password'>;

export async function linkWechatAfterConfirmation(
  credentials: WechatLinkCredentials,
  dependencies: Readonly<{
    confirmTransfer: () => Promise<boolean>;
    getCode: () => Promise<string>;
    link: (input: WechatLinkInput) => Promise<void>;
  }>,
): Promise<boolean> {
  if (!await dependencies.confirmTransfer()) return false;
  const code = await dependencies.getCode();
  await dependencies.link({ ...credentials, code, confirmedTransfer: true });
  return true;
}

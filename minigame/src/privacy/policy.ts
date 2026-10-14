export const PRIVACY_POLICY_VERSION = 'bellfive-privacy-v1';

export type PrivacyAgePath = '14plus' | 'under14' | null;
export type PrivacyStep = 'idle' | 'notice' | 'policy' | 'age' | 'guardian-email' | 'guardian-code';
export type ProtectedAction = Readonly<{ actionId: string; roomCode?: string }>;

export interface PrivacyFlowState {
  readonly step: PrivacyStep;
  readonly agePath: PrivacyAgePath;
  readonly pendingAction: ProtectedAction | null;
  readonly acceptedPolicyVersion: string | null;
  readonly guardianGrant: string | null;
  readonly guardianConfirmed: boolean;
  readonly busy: boolean;
  readonly errorCode: string | null;
}

export const EMPTY_PRIVACY_FLOW: PrivacyFlowState = {
  step: 'idle', agePath: null, pendingAction: null, acceptedPolicyVersion: null,
  guardianGrant: null, guardianConfirmed: false, busy: false, errorCode: null,
};

export const PRIVACY_SUMMARY = [
  'BellFive processes a random account ID, optional username and password verifier, optional WeChat account identifier, nickname/avatar profile, session records, and online room/game data to provide account, profile, and online play. A temporary wx.login code is sent to the server and WeChat for identity exchange and is not stored in the account database. The account service is shared with other BellFive clients.',
  'Guest solo play works offline. The game does not request a phone number, contacts, location, album, or date of birth. Local profile, account session, language, and music settings are stored in WeChat local storage.',
  'Account data is kept until account deletion. Login sessions expire after 30 days. Guardian email requests expire after 24 hours and are deleted on confirmation; a one-time guardian code expires after 30 minutes. A hashed source network address and email key are held in memory for request rate limiting for up to one hour. Live room/game data is held in server memory and removed when the room closes or expires.',
  'Users under 14 can play solo with a generic profile. Guardian email confirmation is required before creating an account, customizing a profile, or playing online. The guardian email is deleted after confirmation or expiry; no birth date is collected.',
  'Account settings provide profile editing, sign-out, and self-service account deletion. Deletion requires password or fresh WeChat verification and removes the account, credentials, linked WeChat identity, sessions, local custom profile, and active room data.',
  'Hosting region, mail provider, service operator identity/contact, access-log retention, and backup deletion schedule have not yet been verified. This privacy policy must be completed with those facts before release.',
] as const;

export const PRIVACY_SUMMARY_ZH = [
  '为提供账号、资料和联机功能，BellFive 会处理随机账号标识、可选用户名和密码校验值、可选微信账号标识、昵称/头像资料、会话记录及联机房间/对局数据。临时 wx.login code 会发送给服务器和微信用于身份换取，不保存在账号数据库。账号服务也供 BellFive 其他客户端共用。',
  '游客可离线单机。游戏不申请手机号、通讯录、定位、相册或出生日期。游客资料、账号会话、语言和音乐设置保存在微信本地存储。',
  '账号数据保留至账号注销；登录会话 30 天后过期。监护人邮箱请求 24 小时后过期，并在确认后删除；一次性监护人授权码 30 分钟后过期。为限制请求频率，来源网络地址和邮箱键的哈希值在内存中最多保存 1 小时。联机房间/对局数据只在服务器内存中保存，房间关闭或过期后移除。',
  '未满 14 周岁用户可用通用资料单机游玩。创建账号、个性化资料或联机前须经监护人邮箱确认。监护人邮箱在确认或请求过期后删除；不收集出生日期。',
  '账号设置提供资料修改、退出登录和自助注销。注销需密码或重新微信验证，并删除账号、凭据、绑定微信身份、会话、本机自定义资料和活动房间数据。',
  '服务器地区、邮件服务商、运营者身份/联系方式、访问日志保留期和备份删除周期尚待核实。发布前必须用实际信息补齐本隐私规则。',
] as const;

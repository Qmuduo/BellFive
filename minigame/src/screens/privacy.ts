import { gameColors } from '../../../src/theme/gameColors';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp } from '../runtime/navigation';
import type { ScreenLayout, TapTarget } from '../runtime/layout';
import { drawCanvasButton, drawInputField, drawRoundedPanel } from '../runtime/ui';
import { PRIVACY_SUMMARY, PRIVACY_SUMMARY_ZH } from '../privacy/policy';
import type { ScreenSnapshot } from './home';
import { drawScreenText } from './home';

function local(language: string, en: string, zh: string): string { return language === 'en' ? en : zh; }

function wrap(context: CanvasContext2D, value: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of Array.from(value)) {
    if (line && context.measureText(line + char).width > width) { lines.push(line); line = ''; }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}

function paragraphs(language: string, step: string): string[] {
  if (step === 'policy') return language === 'en' ? [...PRIVACY_SUMMARY] : [...PRIVACY_SUMMARY_ZH];
  if (step === 'age') return language === 'en'
    ? ['Please choose the age path that applies. 铃果派对 does not ask for a birth date.', 'Users aged 14 or older may continue after any required WeChat privacy authorization. Users under 14 need a guardian email confirmation before account, profile customization, or online play.']
    : ['请选择适用的年龄路径。铃果派对 不收集出生日期。', '14 周岁及以上用户完成微信要求的隐私授权后可继续；未满 14 周岁用户需先完成监护人邮箱确认，之后才能创建账号、个性化资料或联机。'];
  if (step === 'guardian-email' || step === 'guardian-code') return language === 'en'
    ? ['A guardian must confirm permission from their own email address. The email is used only for this confirmation and is deleted after confirmation or expiry.', 'You can cancel and continue with generic-profile guest solo play.']
    : ['请由监护人使用其本人邮箱确认。邮箱仅用于本次确认，完成确认或请求过期后会删除。', '你可以取消并继续使用通用资料进行游客单机。'];
  return language === 'en'
    ? ['铃果派对 uses an account identifier, optional username, optional WeChat nickname, game profile, and session records for account and online play.', 'It does not request a phone number, contacts, location, album, or date of birth. Guest solo play works offline.', 'Users can request account deletion in Account settings. Publisher identity, contact channel, service region, mail provider, and final retention periods will be published before release.']
    : ['铃果派对 为提供账号和联机功能，会处理账号标识、可选用户名、可选微信昵称、游戏资料和会话记录。', '游戏不申请手机号、通讯录、定位、相册或出生日期；游客可离线单机。', '用户可在账号设置中申请注销。运营者身份、联系渠道、服务地区、邮件服务商和实际保留期限将在发布前补齐并公布。'];
}

export function privacyContentHeight(layout: ScreenLayout, snapshot: ScreenSnapshot): number {
  const { content } = layout;
  const width = content.width - 36;
  let lineCount = 0;
  const measure = (snapshot as ScreenSnapshot).settings.language;
  // Canvas text metrics are unavailable in the sizing pass; this conservative estimate
  // leaves room for scroll on narrow screens and does not affect the pinned controls.
  for (const text of paragraphs(measure, snapshot.app.privacy.step)) {
    lineCount += Math.max(2, Math.ceil(Array.from(text).length / Math.max(16, Math.floor(width / 9)))) + 1;
  }
  return Math.max(content.height, 108 + lineCount * 16 + 40 + layout.scrollY - content.y);
}

export function renderPrivacy(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const { content } = layout;
  const state = snapshot.app.privacy;
  const language = snapshot.settings.language;
  const x = content.x + 18;
  const width = content.width - 36;
  const targets: TapTarget[] = [];
  const buttonHeight = Math.min(46, Math.max(36, (content.height - 24) / 5));
  const gap = 7;
  const buttonCount = state.step === 'guardian-code' ? 3
    : state.step === 'notice' || state.step === 'policy' || state.step === 'age' || state.step === 'guardian-email' ? 2 : 0;
  const buttonsHeight = buttonCount * buttonHeight + Math.max(0, buttonCount - 1) * gap;
  const footerTop = content.y + content.height - 10 - buttonsHeight;
  const stepTitle: Record<string, string> = {
    notice: local(language, 'Privacy information', '隐私说明'),
    policy: local(language, 'Privacy rules', '隐私规则'),
    age: local(language, 'Age confirmation', '年龄确认'),
    'guardian-email': local(language, 'Guardian email', '监护人邮箱'),
    'guardian-code': local(language, 'Guardian confirmation', '监护人确认'),
  };
  context.save();
  context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
  context.fillStyle = gameColors.canvas; context.fillRect(content.x, content.y, content.width, content.height);
  drawScreenText(context, stepTitle[state.step] ?? local(language, 'Privacy', '隐私'), x, content.y + 27, 22, gameColors.plum);
  drawScreenText(context, local(language, '铃果派对 · v1', '铃果派对 · v1'),
    x, content.y + 49, 10, gameColors.muted);

  const bodyTop = content.y + 73 - layout.scrollY;
  let y = bodyTop;
  context.font = '12px sans-serif';
  for (const text of paragraphs(language, state.step)) {
    const lines = wrap(context, text, width - 24);
    const panelHeight = lines.length * 17 + 20;
    drawRoundedPanel(context, { x, y, width, height: panelHeight }, { fill: gameColors.surface, border: gameColors.border, radius: 13 });
    lines.forEach((line, index) => drawScreenText(context, line, x + 12, y + 16 + index * 17, 11, gameColors.ink, 'left', width - 24));
    y += panelHeight + 9;
  }
  if (state.step === 'guardian-email') {
    const input = { x, y: footerTop - 68, width, height: 58 };
    drawInputField(context, input, local(language, 'Guardian email', '监护人邮箱'), snapshot.app.fields.privacyEmail,
      { focused: snapshot.app.focusedField === 'privacyEmail', enabled: !state.busy, fontSize: 13, radius: 12 });
    if (!state.busy) targets.push({ id: 'field.privacyEmail', rect: input });
  } else if (state.step === 'guardian-code') {
    const input = { x, y: footerTop - 68, width, height: 58 };
    drawInputField(context, input, local(language, 'One-time guardian code', '一次性监护人授权码'),
      snapshot.app.fields.guardianGrant ? '•'.repeat(Math.min(20, snapshot.app.fields.guardianGrant.length)) : '',
      { focused: snapshot.app.focusedField === 'guardianGrant', enabled: !state.busy, fontSize: 13, radius: 12 });
    if (!state.busy) targets.push({ id: 'field.guardianGrant', rect: input });
  }
  if (state.errorCode) {
    const message = state.errorCode === 'INVALID_GUARDIAN_EMAIL' ? local(language, 'Enter a valid guardian email.', '请输入有效的监护人邮箱。')
      : state.errorCode === 'INVALID_GUARDIAN_GRANT' ? local(language, 'Enter the code shown after guardian confirmation.', '请输入监护人确认页显示的授权码。')
        : state.errorCode === 'PRIVACY_REFUSED' ? local(language, 'Privacy authorization was not completed.', '未完成微信隐私授权。')
          : local(language, 'Could not continue. Check the connection and try again.', '暂时无法继续，请检查网络后重试。');
    drawScreenText(context, message, x, state.step === 'guardian-email' || state.step === 'guardian-code'
      ? footerTop - 74 : footerTop - 8, 10, gameColors.purple, 'left', width);
  }
  context.restore();

  let footerY = content.y + content.height - buttonHeight - 10;
  const button = (id: string, title: string, variant: 'primary' | 'secondary' | 'text', enabled = true) => {
    const rect = { x, y: footerY, width, height: buttonHeight };
    drawCanvasButton(context, rect, title, { variant, enabled, fontSize: 11, radius: 12 });
    if (enabled) targets.push({ id, rect });
    footerY -= buttonHeight + gap;
  };
  if (state.step === 'notice') {
    button('privacy.continue', local(language, 'Continue to age choice', '继续并选择年龄路径'), 'primary');
    button('privacy.read', local(language, 'Read complete policy', '阅读完整隐私规则'), 'text');
  } else if (state.step === 'policy') {
    button('privacy.platformContract', local(language, 'Open WeChat privacy contract', '查看微信隐私保护指引'), 'secondary');
    button('privacy.backToNotice', local(language, 'Back', '返回'), 'primary');
  } else if (state.step === 'age') {
    button('privacy.age.under14', local(language, 'Under 14 · guardian confirmation', '未满 14 周岁 · 由监护人确认'), 'secondary', !state.busy);
    button('privacy.age.14plus', local(language, '14 or older · I agree and continue', '已满 14 周岁 · 我已阅读并同意'), 'primary', !state.busy);
  } else if (state.step === 'guardian-email') {
    button('privacy.cancel', local(language, 'Continue as guest', '返回游客单机'), 'text', !state.busy);
    button('privacy.sendGuardian', local(language, 'Send confirmation email', '发送监护人确认邮件'), 'primary', !state.busy);
  } else if (state.step === 'guardian-code') {
    button('privacy.cancel', local(language, 'Continue as guest', '返回游客单机'), 'text', !state.busy);
    button('privacy.resend', local(language, 'Resend confirmation email', '重新发送确认邮件'), 'secondary', !state.busy);
    button('privacy.confirmGuardian', local(language, 'Guardian confirmed · continue', '监护人已确认 · 继续'), 'primary', !state.busy);
  }
  return targets;
}

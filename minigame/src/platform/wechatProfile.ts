import type { Rect } from '../runtime/layout';
import type { MiniGameWxApi } from './wxApi';

export type WechatProfileButtonLanguage = 'en' | 'zh_CN';

/** Keeps the native WeChat profile-consent button aligned with its Canvas control. */
export function createWechatNicknameButton(
  api: Pick<MiniGameWxApi, 'createUserInfoButton'>,
  onNickname: (nickname: string) => void,
  onUnavailable: () => void,
) {
  let button: WechatMinigame.UserInfoButton | null = null;
  let shown = false;
  let disabled = false;
  let language: WechatProfileButtonLanguage | null = null;
  let lastRect = '';

  const destroyButton = () => {
    if (!button) return;
    button.destroy();
    button = null;
    shown = false;
    lastRect = '';
  };
  const hide = () => {
    if (button && shown) button.hide();
    shown = false;
  };

  return {
    get available() { return typeof api.createUserInfoButton === 'function' && !disabled; },
    place(rect: Rect | null, title: string, nextLanguage: WechatProfileButtonLanguage) {
      if (!rect || typeof api.createUserInfoButton !== 'function' || disabled) { hide(); return; }
      try {
        if (button && language !== nextLanguage) destroyButton();
        language = nextLanguage;
        if (!button) {
          button = api.createUserInfoButton!({
            type: 'text', text: title, lang: nextLanguage, withCredentials: false,
            style: {
              left: rect.x, top: rect.y, width: rect.width, height: rect.height,
              lineHeight: rect.height, backgroundColor: '#FFFFFF', borderColor: '#D7C9E8',
              borderWidth: 1, borderRadius: 13, color: '#34214F', fontSize: 12, textAlign: 'center',
            },
          });
          button.onTap(result => {
            const nickname = result.userInfo?.nickName;
            if (typeof nickname === 'string' && nickname.trim()) onNickname(nickname);
            else onUnavailable();
          });
        } else {
          const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
          if (key !== lastRect) {
            Object.assign(button.style, {
              left: rect.x, top: rect.y, width: rect.width, height: rect.height, lineHeight: rect.height,
            });
            lastRect = key;
          }
          if (button.text !== title) button.text = title;
        }
        if (!shown) { button.show(); shown = true; }
      } catch {
        disabled = true;
        destroyButton();
        onUnavailable();
      }
    },
    hide,
    destroy: destroyButton,
  };
}

import { Button, Text, View } from '@tarojs/components';
import { formatAuthError } from '../../../src/i18n/translations';
import type { Language } from '../../../src/i18n/types';
import { miniText } from '../uiText';

export type WechatLoginPromptProps = Readonly<{
  language: Language;
  pending: boolean;
  errorCode?: string | null;
  onRetry: () => void;
}>;

export function WechatLoginPrompt({ language, pending, errorCode, onRetry }: WechatLoginPromptProps): JSX.Element {
  const errorText = errorCode === 'WECHAT_CODE_INVALID'
    ? miniText(language, 'loginCodeMissing')
    : errorCode === 'AUTH_NOT_CONFIGURED'
      ? miniText(language, 'serviceNotConfigured')
      : errorCode
        ? formatAuthError(language, errorCode)
        : null;

  return (
    <View className="wechat-login-prompt">
      <Text className="wechat-login-description">{miniText(language, 'wechatLoginDescription')}</Text>
      <Button className="wechat-login-button" loading={pending} disabled={pending} onClick={onRetry}>
        {pending ? miniText(language, 'loginPending') : miniText(language, errorCode ? 'retryLogin' : 'wechatLogin')}
      </Button>
      {errorText ? <Text className="wechat-login-error">{errorText}</Text> : null}
    </View>
  );
}

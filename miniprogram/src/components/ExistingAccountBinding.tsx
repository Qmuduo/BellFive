import { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import { formatAuthError } from '../../../src/i18n/translations';
import type { Language } from '../../../src/i18n/types';
import { miniText } from '../uiText';
import type { WechatLinkCredentials } from '../store/wechatLinkConfirmation';

export type ExistingAccountBindingProps = Readonly<{
  language: Language;
  pending: boolean;
  errorCode?: string | null;
  onBind: (credentials: WechatLinkCredentials) => void;
}>;

export function ExistingAccountBinding({ language, pending, errorCode, onBind }: ExistingAccountBindingProps): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState(false);

  const submit = () => {
    const normalizedUsername = username.trim();
    if (!/^[A-Za-z0-9_]{3,24}$/.test(normalizedUsername) || password.length < 8 || password.length > 128) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    onBind({ username: normalizedUsername, password });
  };

  return (
    <View className="binding-panel">
      <Text className="section-heading">{miniText(language, 'bindExisting')}</Text>
      <Text className="binding-warning">{miniText(language, 'bindExplanation')}</Text>
      <Input
        className="form-input"
        disabled={pending}
        value={username}
        maxlength={24}
        onInput={event => setUsername(event.detail.value)}
        placeholder={miniText(language, 'username')}
      />
      <Input
        className="form-input"
        disabled={pending}
        value={password}
        maxlength={128}
        password
        onInput={event => setPassword(event.detail.value)}
        placeholder={miniText(language, 'password')}
      />
      {validationError ? (
        <Text className="form-error">{formatAuthError(language, 'INVALID_INPUT')}</Text>
      ) : null}
      {errorCode ? (
        <Text className="form-error">
          {errorCode === 'AUTH_NOT_CONFIGURED' ? miniText(language, 'serviceNotConfigured') : formatAuthError(language, errorCode)}
        </Text>
      ) : null}
      <Button className="secondary-button" disabled={pending} loading={pending} onClick={submit}>
        {pending ? miniText(language, 'loginPending') : miniText(language, 'link')}
      </Button>
    </View>
  );
}

import { useState } from 'react';
import { auth, errorKey, isAppError } from '@/api';
import { useI18n } from '@/i18n';
import { usePasswordPolicy, usePasswordStrength } from '@/lib/hooks';
import { useSession } from '@/state/session';
import { Alert, Button, Field, Form, Input, PasswordInput } from '@/ui';
import { AuthLayout, PasswordMeter } from './AuthLayout';

/** Ensikäynnistys: ainoa paikka, jossa OWNER-tili voidaan luoda. */
export function Setup() {
  const { t, lang } = useI18n();
  const { setSession, refreshStatus } = useSession();
  const policy = usePasswordPolicy();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const strength = usePasswordStrength(password);
  const ready = username.trim() !== '' && email.trim() !== '' && password !== '' && confirm !== '';

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    void auth
      .setupOwner(username.trim(), email.trim(), password, confirm, lang)
      .then(async (session) => {
        setSession(session);
        await refreshStatus();
      })
      .catch((e: unknown) => {
        setError(t(errorKey(e), isAppError(e) && e.retryAfter ? { n: e.retryAfter } : undefined));
      })
      .finally(() => setBusy(false));
  };

  return (
    <AuthLayout wide>
      <div className="auth-card">
        <div>
          <h1>{t('auth.setupTitle')}</h1>
          <p className="lead">{t('auth.setupSub')}</p>
        </div>

        <Alert kind="warn">{t('auth.setupOwnerNote')}</Alert>

        <Form onSubmit={submit}>
          <Field label={t('auth.username')}>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" maxLength={32} />
          </Field>
          <Field label={t('auth.email')}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} />
          </Field>
          <Field
            label={t('auth.password')}
            hint={policy ? t('auth.passwordRules', { n: policy.minLength }) : undefined}
          >
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <PasswordMeter score={strength?.score ?? null} label={strength ? t(`auth.strength${strength.score}`) : ''} />
          <Field label={t('auth.passwordConfirm')}>
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>

          {error ? <Alert kind="err">{error}</Alert> : null}

          <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={!ready}>
            {t('auth.setupCreate')}
          </Button>
        </Form>
      </div>
    </AuthLayout>
  );
}

import { useState } from 'react';
import { account, errorKey, isAppError } from '@/api';
import { useI18n } from '@/i18n';
import { usePasswordPolicy, usePasswordStrength } from '@/lib/hooks';
import { useSession } from '@/state/session';
import { Alert, Button, Field, Form, PasswordInput } from '@/ui';
import { AuthLayout, PasswordMeter } from './AuthLayout';

/** Ylläpitäjän pakottama salasanan vaihto — sovellukseen ei pääse ennen tätä. */
export function MustChangePassword() {
  const { t } = useI18n();
  const { refreshSession, signOut } = useSession();
  const policy = usePasswordPolicy();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const strength = usePasswordStrength(next);

  const submit = () => {
    setBusy(true);
    setError('');
    void account
      .changePassword(current, next)
      .then(() => refreshSession())
      .catch((e: unknown) => setError(t(errorKey(e), isAppError(e) && e.retryAfter ? { n: e.retryAfter } : undefined)))
      .finally(() => setBusy(false));
  };

  return (
    <AuthLayout>
      <div className="auth-card">
        <div>
          <h1>{t('auth.mustChangeTitle')}</h1>
          <p className="lead">{t('auth.mustChangeSub')}</p>
        </div>
        <Form onSubmit={submit}>
          <Field label={t('auth.currentPassword')}>
            <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus autoComplete="current-password" />
          </Field>
          <Field label={t('auth.newPassword')} hint={policy ? t('auth.passwordRules', { n: policy.minLength }) : undefined}>
            <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <PasswordMeter score={strength?.score ?? null} label={strength ? t(`auth.strength${strength.score}`) : ''} />
          {error ? <Alert kind="err">{error}</Alert> : null}
          <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={current === '' || next === ''}>
            {t('account.changePassword')}
          </Button>
        </Form>
        <div className="auth-foot">
          <button className="link" onClick={() => void signOut()}>{t('auth.logout')}</button>
        </div>
      </div>
    </AuthLayout>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { auth, errorKey, isAppError } from '@/api';
import { useI18n } from '@/i18n';
import { usePasswordPolicy, usePasswordStrength } from '@/lib/hooks';
import { useSession } from '@/state/session';
import { Alert, Button, Check, Field, Form, GoogleMark, Input, PasswordInput } from '@/ui';
import { AuthLayout, PasswordMeter } from './AuthLayout';

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'invite' | 'twoFactor';

const POLL_MS = 1200;

export function AuthScreen() {
  const { t } = useI18n();
  const { status, setSession, refreshStatus } = useSession();
  const policy = usePasswordPolicy();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);

  const strength = usePasswordStrength(password);
  const pollRef = useRef<number>();

  const stopPoll = useCallback(() => {
    window.clearInterval(pollRef.current);
    pollRef.current = undefined;
    setGoogleBusy(false);
  }, []);

  useEffect(() => () => window.clearInterval(pollRef.current), []);

  const fail = (e: unknown) => {
    setError(t(errorKey(e), isAppError(e) && e.retryAfter ? { n: e.retryAfter } : undefined));
  };

  const go = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setCode('');
    if (next !== 'reset' && next !== 'invite') setPassword('');
    setConfirm('');
  };

  /* ---------- Toiminnot ---------- */

  const doLogin = () => {
    setBusy(true);
    setError('');
    void auth
      .login({ email: email.trim(), password, remember })
      .then((res) => {
        if (res.status === 'ok') {
          setSession(res.session);
        } else {
          setPassword('');
          go('twoFactor');
        }
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const doTwoFactor = () => {
    setBusy(true);
    setError('');
    void auth
      .loginTwoFactor(code.trim())
      .then(setSession)
      .catch((e) => {
        setCode('');
        fail(e);
      })
      .finally(() => setBusy(false));
  };

  const doRegister = () => {
    setBusy(true);
    setError('');
    void auth
      .register({ username: username.trim(), email: email.trim(), password, passwordConfirm: confirm })
      .then((res) => {
        if (res.requiresVerification) {
          setNotice(res.emailSent ? '' : t('auth.emailNotConfigured'));
          setPassword('');
          setConfirm('');
          setMode('verify');
          setError('');
        } else {
          go('login');
          setNotice(t('auth.verified'));
        }
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const doVerify = () => {
    setBusy(true);
    setError('');
    void auth
      .verifyEmail(code.trim())
      .then(() => {
        go('login');
        setNotice(t('auth.verified'));
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const doResend = () => {
    setBusy(true);
    setError('');
    void auth
      .resendVerification(email.trim())
      .then(() => setNotice(t('auth.resendSent')))
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const doForgot = () => {
    setBusy(true);
    setError('');
    void auth
      .requestPasswordReset(email.trim())
      .then(() => {
        setMode('reset');
        setNotice(t('auth.resetSent'));
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const doReset = () => {
    setBusy(true);
    setError('');
    void auth
      .resetPassword(code.trim(), password)
      .then(() => {
        go('login');
        setNotice(t('auth.resetDone'));
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const doInvite = () => {
    setBusy(true);
    setError('');
    void auth
      .acceptInvite(code.trim(), password)
      .then(() => {
        go('login');
        setNotice(t('auth.resetDone'));
      })
      .catch(fail)
      .finally(() => setBusy(false));
  };

  const doGoogle = () => {
    setError('');
    setGoogleBusy(true);
    void auth
      .googleBegin(false)
      .then(async (url) => {
        await openUrl(url);
        pollRef.current = window.setInterval(() => {
          void auth
            .googlePoll()
            .then((res) => {
              if (res.status === 'ready') {
                stopPoll();
                if (res.session) setSession(res.session);
              } else if (res.status === 'failed') {
                stopPoll();
                setError(t('err.oauth_failed'));
              }
            })
            .catch((e) => {
              stopPoll();
              fail(e);
            });
        }, POLL_MS);
      })
      .catch((e) => {
        setGoogleBusy(false);
        fail(e);
      });
  };

  const cancelGoogle = () => {
    stopPoll();
    void auth.googleCancel().catch(() => undefined);
  };

  useEffect(() => {
    if (mode === 'login') void refreshStatus().catch(() => undefined);
  }, [mode, refreshStatus]);

  /* ---------- Näkymät ---------- */

  const banner = (
    <>
      {notice ? <Alert kind="ok">{notice}</Alert> : null}
      {error ? <Alert kind="err">{error}</Alert> : null}
    </>
  );

  const passwordField = (label: string) => (
    <>
      <Field label={label} hint={policy ? t('auth.passwordRules', { n: policy.minLength }) : undefined}>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
      <PasswordMeter score={strength?.score ?? null} label={strength ? t(`auth.strength${strength.score}`) : ''} />
    </>
  );

  const codeField = (label: string) => (
    <Field label={label} hint={t('auth.codeHint')}>
      <Input
        className="code-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        maxLength={24}
        inputMode="text"
        spellCheck={false}
      />
    </Field>
  );

  if (mode === 'twoFactor') {
    return (
      <AuthLayout>
        <div className="auth-card">
          <div>
            <h1>{t('auth.twoFactorTitle')}</h1>
            <p className="lead">{t('auth.twoFactorSub')}</p>
          </div>
          <Form onSubmit={doTwoFactor}>
            {codeField(t('auth.twoFactorCode'))}
            <span className="hint">{t('auth.recoveryHint')}</span>
            {banner}
            <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={code.trim().length < 6}>
              {t('auth.login')}
            </Button>
          </Form>
          <div className="auth-foot">
            <button className="link" onClick={() => go('login')}>{t('auth.backToLogin')}</button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'verify') {
    return (
      <AuthLayout>
        <div className="auth-card">
          <div>
            <h1>{t('auth.verifyTitle')}</h1>
            <p className="lead">{t('auth.verifySub', { email: email.trim() })}</p>
          </div>
          <Form onSubmit={doVerify}>
            {codeField(t('auth.verifyCode'))}
            {banner}
            <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={code.trim().length < 4}>
              {t('auth.verify')}
            </Button>
          </Form>
          <div className="auth-foot">
            <button className="link" onClick={doResend} disabled={busy}>{t('auth.resend')}</button>
            <span>·</span>
            <button className="link" onClick={() => go('login')}>{t('auth.backToLogin')}</button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'forgot') {
    return (
      <AuthLayout>
        <div className="auth-card">
          <div>
            <h1>{t('auth.resetTitle')}</h1>
            <p className="lead">{t('auth.resetSub')}</p>
          </div>
          <Form onSubmit={doForgot}>
            <Field label={t('auth.email')}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" />
            </Field>
            {banner}
            <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={email.trim() === ''}>
              {t('auth.resetRequest')}
            </Button>
          </Form>
          <div className="auth-foot">
            <button className="link" onClick={() => go('reset')}>{t('auth.resetCode')}</button>
            <span>·</span>
            <button className="link" onClick={() => go('login')}>{t('auth.backToLogin')}</button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'reset' || mode === 'invite') {
    const invite = mode === 'invite';
    return (
      <AuthLayout>
        <div className="auth-card">
          <div>
            <h1>{t(invite ? 'auth.inviteTitle' : 'auth.resetTitle')}</h1>
            <p className="lead">{t(invite ? 'auth.inviteSub' : 'auth.resetSub')}</p>
          </div>
          <Form onSubmit={invite ? doInvite : doReset}>
            {codeField(t(invite ? 'auth.inviteCode' : 'auth.resetCode'))}
            {passwordField(t('auth.newPassword'))}
            {banner}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              busy={busy}
              disabled={code.trim().length < 4 || password === ''}
            >
              {t('auth.resetSubmit')}
            </Button>
          </Form>
          <div className="auth-foot">
            <button className="link" onClick={() => go('login')}>{t('auth.backToLogin')}</button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'register') {
    return (
      <AuthLayout>
        <div className="auth-card">
          <div>
            <h1>{t('auth.registerTitle')}</h1>
            <p className="lead">{t('auth.registerSub')}</p>
          </div>
          <Form onSubmit={doRegister}>
            <Field label={t('auth.username')}>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" maxLength={32} />
            </Field>
            <Field label={t('auth.email')}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} />
            </Field>
            {passwordField(t('auth.password'))}
            <Field label={t('auth.passwordConfirm')}>
              <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            {banner}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              busy={busy}
              disabled={username.trim() === '' || email.trim() === '' || password === '' || confirm === ''}
            >
              {t('auth.register')}
            </Button>
          </Form>
          <div className="auth-foot">
            <span>{t('auth.haveAccount')}</span>
            <button className="link" onClick={() => go('login')}>{t('auth.login')}</button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  /* ---------- Kirjautuminen ---------- */

  const googleAvailable = status?.googleLoginEnabled && status.googleConfigured;

  return (
    <AuthLayout>
      <div className="auth-card">
        <div>
          <h1>{t('auth.signInTitle')}</h1>
          <p className="lead">{t('auth.signInSub')}</p>
        </div>

        {googleBusy ? (
          <>
            <Alert kind="info">{t('auth.googleWait')}</Alert>
            <span className="hint">{t('auth.googleHint')}</span>
            {error ? <Alert kind="err">{error}</Alert> : null}
            <Button block onClick={cancelGoogle}>{t('auth.googleCancel')}</Button>
          </>
        ) : (
          <>
            <Form onSubmit={doLogin}>
              <Field label={t('auth.email')}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
              </Field>
              <Field label={t('auth.password')}>
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </Field>
              <div className="row">
                <Check checked={remember} onChange={setRemember} label={t('auth.remember')} />
                <button type="button" className="link right" onClick={() => go('forgot')}>
                  {t('auth.forgot')}
                </button>
              </div>
              {banner}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                busy={busy}
                disabled={email.trim() === '' || password === ''}
              >
                {t('auth.login')}
              </Button>
            </Form>

            {googleAvailable ? (
              <>
                <div className="auth-sep">{t('auth.or')}</div>
                <button type="button" className="btn block google-btn" onClick={doGoogle}>
                  <GoogleMark />
                  {t('auth.google')}
                </button>
                <span className="hint" style={{ textAlign: 'center' }}>{t('auth.googleHint')}</span>
              </>
            ) : null}
          </>
        )}
      </div>

      <div className="auth-foot">
        {status?.registrationEnabled ? (
          <>
            <span>{t('auth.noAccount')}</span>
            <button className="link" onClick={() => go('register')}>{t('auth.register')}</button>
            <span>·</span>
          </>
        ) : null}
        <button className="link" onClick={() => go('invite')}>{t('auth.haveInvite')}</button>
      </div>
    </AuthLayout>
  );
}

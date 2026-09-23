/**
 * Kirjautuminen, rekisteröityminen ja salasanan palautus.
 *
 * Kaikki tilit ovat palvelimella, joten näkymä tarvitsee verkkoyhteyden.
 * Ilman sitä näytetään yhteysvirhe eikä lomaketta, joka ei voisi toimia.
 * Salasanan vahvuus lasketaan paikallisesti — salasana ei lähde verkkoon
 * ennen kuin lomake lähetetään.
 */
import { useEffect, useRef, useState } from 'react';
import { auth, errorKey } from '@/api';
import type { PasswordPolicy } from '@/api';
import { useI18n, useT } from '@/i18n';
import { useSession } from '@/state/session';
import { useToast } from '@/state/toast';
import { Alert, Button, Field, Form, Input, PasswordInput, Switch } from '@/ui';
import { AuthLayout, PasswordMeter } from './AuthLayout';

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

const STRENGTH_DELAY = 250;

export function AuthScreen() {
  const t = useT();
  const { lang } = useI18n();
  const toast = useToast();
  const { status, setSession, refreshStatus } = useSession();

  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null);
  const [score, setScore] = useState<number | null>(null);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);

  const strengthTimer = useRef<number>();

  useEffect(() => {
    void auth.passwordPolicy().then(setPolicy, () => undefined);
    return () => window.clearTimeout(strengthTimer.current);
  }, []);

  const go = (next: Mode) => {
    setMode(next);
    setError('');
    setCode('');
  };

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    void fn()
      .catch((e: unknown) => setError(t(errorKey(e))))
      .finally(() => setBusy(false));
  };

  /** Vahvuus lasketaan vasta kirjoittamisen tauottua, ei joka näppäimestä. */
  const onPassword = (value: string) => {
    setPassword(value);
    window.clearTimeout(strengthTimer.current);
    if (!value) {
      setScore(null);
      return;
    }
    strengthTimer.current = window.setTimeout(() => {
      void auth.passwordStrength(value).then((s) => setScore(s.score), () => undefined);
    }, STRENGTH_DELAY);
  };

  const passwordHint = policy ? t('auth.passwordRules', { n: policy.minLength }) : '';
  const strengthLabel = score ? t(`auth.strength${score}`) : '';
  const errorAlert = error ? <Alert kind="err">{error}</Alert> : null;
  const noticeAlert = notice ? <Alert kind="info">{notice}</Alert> : null;

  const head = (title: string, lead: string) => (
    <div>
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
    </div>
  );

  // Ilman yhteyttä kirjautumislomakkeen näyttäminen olisi harhaanjohtavaa:
  // tilit, roolit ja asetukset ovat palvelimella.
  if (status && !status.online) {
    return (
      <AuthLayout>
        <div className="auth-card">
          {head(t('auth.offlineTitle'), t('auth.offlineSub'))}
          <Alert kind="err">{t('auth.offlineHelp')}</Alert>
          <Button block busy={busy} variant="primary" onClick={() => run(refreshStatus)}>
            {t('common.retry')}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'register') {
    return (
      <AuthLayout>
        <div className="auth-card">
          {head(t('auth.registerTitle'), t('auth.registerSub'))}
          <Form
            onSubmit={() =>
              run(async () => {
                const res = await auth.register({
                  username,
                  email,
                  password,
                  passwordConfirm,
                  language: lang
                });
                setEmail(res.email);
                setPassword('');
                setPasswordConfirm('');
                setScore(null);
                if (res.requiresVerification) {
                  setNotice(t('auth.verifySent'));
                  go('verify');
                } else {
                  toast.ok(t('auth.verified'));
                  go('login');
                }
              })
            }
          >
            {errorAlert}
            {status && !status.registrationEnabled ? (
              <Alert kind="warn">{t('auth.registrationDisabled')}</Alert>
            ) : null}

            <Field label={t('auth.username')}>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                maxLength={32}
              />
            </Field>
            <Field label={t('auth.email')}>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
              />
            </Field>
            <Field label={t('auth.password')} hint={passwordHint}>
              <PasswordInput
                value={password}
                onChange={(e) => onPassword(e.target.value)}
                autoComplete="new-password"
              />
              <PasswordMeter score={score} label={strengthLabel} />
            </Field>
            <Field label={t('auth.passwordConfirm')}>
              <PasswordInput
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              block
              busy={busy}
              disabled={!status?.registrationEnabled}
            >
              {t('auth.register')}
            </Button>
          </Form>
        </div>
        <div className="auth-foot">
          <span>{t('auth.haveAccount')}</span>
          <button type="button" className="link" onClick={() => go('login')}>
            {t('auth.login')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'verify') {
    return (
      <AuthLayout>
        <div className="auth-card">
          {head(t('auth.verifyTitle'), t('auth.verifySub', { email }))}
          <Form
            onSubmit={() =>
              run(async () => {
                setSession(await auth.verifyEmail(email, code));
              })
            }
          >
            {errorAlert}
            {noticeAlert}

            <Field label={t('auth.verifyCode')} hint={t('auth.codeHint')}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
              />
            </Field>

            <Button type="submit" variant="primary" block busy={busy}>
              {t('auth.verify')}
            </Button>
          </Form>
        </div>
        <div className="auth-foot">
          <button
            type="button"
            className="link"
            onClick={() =>
              run(async () => {
                await auth.resendVerification(email);
                setNotice(t('auth.resendSent'));
              })
            }
          >
            {t('auth.resend')}
          </button>
          <span>·</span>
          <button type="button" className="link" onClick={() => go('login')}>
            {t('auth.backToLogin')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'forgot') {
    return (
      <AuthLayout>
        <div className="auth-card">
          {head(t('auth.resetTitle'), t('auth.resetSub'))}
          <Form
            onSubmit={() =>
              run(async () => {
                await auth.requestPasswordReset(email);
                setNotice(t('auth.resetSent'));
                go('reset');
              })
            }
          >
            {errorAlert}
            <Field label={t('auth.email')}>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoFocus
                autoComplete="email"
              />
            </Field>
            <Button type="submit" variant="primary" block busy={busy}>
              {t('auth.resetRequest')}
            </Button>
          </Form>
        </div>
        <div className="auth-foot">
          <button type="button" className="link" onClick={() => go('login')}>
            {t('auth.backToLogin')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (mode === 'reset') {
    return (
      <AuthLayout>
        <div className="auth-card">
          {head(t('auth.resetTitle'), t('auth.resetSubmit'))}
          <Form
            onSubmit={() =>
              run(async () => {
                await auth.resetPassword(email, code, password);
                toast.ok(t('auth.resetDone'));
                setPassword('');
                setScore(null);
                go('login');
              })
            }
          >
            {errorAlert}
            {noticeAlert}

            <Field label={t('auth.resetCode')} hint={t('auth.codeHint')}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
              />
            </Field>
            <Field label={t('auth.newPassword')} hint={passwordHint}>
              <PasswordInput
                value={password}
                onChange={(e) => onPassword(e.target.value)}
                autoComplete="new-password"
              />
              <PasswordMeter score={score} label={strengthLabel} />
            </Field>

            <Button type="submit" variant="primary" block busy={busy}>
              {t('auth.resetSubmit')}
            </Button>
          </Form>
        </div>
        <div className="auth-foot">
          <button type="button" className="link" onClick={() => go('login')}>
            {t('auth.backToLogin')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        {head(t('auth.signInTitle'), t('auth.signInSub'))}
        <Form
          onSubmit={() =>
            run(async () => {
              setSession(await auth.login({ email, password, remember }));
            })
          }
        >
          {errorAlert}
          {noticeAlert}

          <Field label={t('auth.email')}>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoFocus
              autoComplete="email"
            />
          </Field>
          <Field label={t('auth.password')}>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>

          <div className="toggle-row">
            <div className="tr-txt">
              <strong>{t('auth.remember')}</strong>
            </div>
            <Switch checked={remember} onChange={setRemember} label={t('auth.remember')} />
          </div>

          <Button type="submit" variant="primary" block busy={busy}>
            {t('auth.login')}
          </Button>
        </Form>
      </div>
      <div className="auth-foot">
        <button type="button" className="link" onClick={() => go('forgot')}>
          {t('auth.forgot')}
        </button>
        {status?.registrationEnabled ? (
          <>
            <span>·</span>
            <button type="button" className="link" onClick={() => go('register')}>
              {t('auth.register')}
            </button>
          </>
        ) : null}
      </div>
    </AuthLayout>
  );
}

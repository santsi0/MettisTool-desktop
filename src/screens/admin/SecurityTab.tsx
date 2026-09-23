import { useEffect, useState } from 'react';
import { admin } from '@/api';
import type { GoogleStatus } from '@/api';
import { useI18n } from '@/i18n';
import { useToast } from '@/state/toast';
import { Alert, Badge, Button, Field, Input, Loading, PasswordInput, ToggleRow } from '@/ui';
import { useSettings } from './useSettings';

const NUMBERS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'security.session_hours', label: 'admin.security.sessionHours', min: 1, max: 720 },
  { key: 'security.remember_days', label: 'admin.security.rememberDays', min: 1, max: 365 },
  { key: 'security.max_failed_logins', label: 'admin.security.maxFailed', min: 3, max: 50 },
  { key: 'security.lockout_minutes', label: 'admin.security.lockoutMinutes', min: 1, max: 1440 },
  { key: 'security.verify_token_hours', label: 'admin.security.verifyHours', min: 1, max: 168 },
  { key: 'security.reset_token_minutes', label: 'admin.security.resetMinutes', min: 5, max: 1440 }
];

export function SecurityTab() {
  const { t } = useI18n();
  const toast = useToast();
  const settings = useSettings();

  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void admin.googleStatus().then((s) => alive && setGoogle(s), () => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!settings.values) return <Loading />;

  const saveGoogle = () => {
    setBusy(true);
    void admin
      .googleConfigure({
        clientId: clientId.trim() || undefined,
        clientSecret: clientSecret.trim() || undefined
      })
      .then((s) => {
        setGoogle(s);
        setClientId('');
        setClientSecret('');
        toast.ok(t('common.saved'));
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className="card">
        <div className="card-h">
          <h3>{t('admin.security.title')}</h3>
        </div>
        <div className="card-b">
          {NUMBERS.map((n) => {
            const value = draft[n.key] ?? settings.text(n.key);
            return (
              <Field key={n.key} label={t(n.label)}>
                <Input
                  type="number"
                  min={n.min}
                  max={n.max}
                  value={value}
                  onChange={(e) => setDraft((p) => ({ ...p, [n.key]: e.target.value }))}
                  onBlur={() => {
                    const num = Number.parseInt(value, 10);
                    if (!Number.isFinite(num)) return;
                    const clamped = Math.min(n.max, Math.max(n.min, num));
                    setDraft((p) => ({ ...p, [n.key]: String(clamped) }));
                    if (String(clamped) !== settings.text(n.key)) settings.set(n.key, String(clamped));
                  }}
                />
              </Field>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('admin.security.google')}</h3>
          <span className="right">
            {google?.configured ? <Badge kind="ok">{t('admin.email.configured')}</Badge> : <Badge>{t('admin.email.notConfigured')}</Badge>}
          </span>
        </div>
        <div className="card-b">
          <Alert>{t('admin.security.googleHint')}</Alert>
          <Field label={t('admin.security.googleClientId')} hint={google?.clientIdMasked ?? undefined}>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="….apps.googleusercontent.com"
              autoComplete="off"
            />
          </Field>
          <Field label={t('admin.security.googleClientSecret')} hint={google?.configured ? t('admin.security.secretHidden') : undefined}>
            <PasswordInput value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
          </Field>

          <ToggleRow
            title={t('admin.security.googleEnabled')}
            checked={settings.bool('app.google_login_enabled')}
            disabled={settings.busy || !google?.configured}
            onChange={(v) => {
              settings.setBool('app.google_login_enabled', v);
              void admin.googleConfigure({ enabled: v }).then(setGoogle).catch(toast.fail);
            }}
          />

          <div className="row wrap">
            <Button variant="primary" icon="save" onClick={saveGoogle} busy={busy} disabled={clientId.trim() === '' && clientSecret.trim() === ''}>
              {t('common.save')}
            </Button>
            {google?.configured ? (
              <Button
                variant="danger"
                icon="trash"
                busy={busy}
                onClick={() => {
                  setBusy(true);
                  void admin
                    .googleClear()
                    .then(() => admin.googleStatus().then(setGoogle))
                    .then(() => toast.ok(t('common.saved')))
                    .catch(toast.fail)
                    .finally(() => setBusy(false));
                }}
              >
                {t('admin.security.googleClear')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

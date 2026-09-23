import { useEffect, useState } from 'react';
import { admin } from '@/api';
import type { DiscordStatus } from '@/api';
import { useI18n } from '@/i18n';
import { dateTime } from '@/lib/format';
import { useToast } from '@/state/toast';
import { Alert, Badge, Button, Field, Loading, PasswordInput, Select, ToggleRow } from '@/ui';

const LEVELS = ['ALL', 'SECURITY', 'CRITICAL'];

export function Discord() {
  const { t, locale } = useI18n();
  const toast = useToast();

  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [webhook, setWebhook] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void admin.discordStatus().then((s) => alive && setStatus(s), () => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!status) return <Loading />;

  const update = (p: { webhook?: string; enabled?: boolean; level?: string }) => {
    setBusy(true);
    void admin
      .discordConfigure(p)
      .then((s) => {
        setStatus(s);
        setWebhook('');
        toast.ok(t('common.saved'));
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className="card">
        <div className="card-h">
          <h3>{t('admin.discord.title')}</h3>
          <span className="right">
            {status.configured ? <Badge kind="ok">{t('admin.email.configured')}</Badge> : <Badge>{t('admin.email.notConfigured')}</Badge>}
          </span>
        </div>
        <div className="card-b">
          <Alert>{t('admin.discord.hint')}</Alert>

          <Field label={t('admin.discord.webhook')} hint={status.configured ? t('admin.security.secretHidden') : undefined}>
            <PasswordInput
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
              autoComplete="off"
            />
          </Field>
          {status.webhookMasked ? (
            <Field label={t('admin.discord.current')}>
              <div className="secret-box">{status.webhookMasked}</div>
            </Field>
          ) : null}

          <ToggleRow
            title={t('admin.discord.enabled')}
            checked={status.enabled}
            disabled={busy || !status.configured}
            onChange={(v) => update({ enabled: v })}
          />

          <Field label={t('admin.discord.level')}>
            <Select
              value={status.level}
              disabled={busy}
              onChange={(v) => update({ level: v })}
              options={LEVELS.map((l) => ({ value: l, label: t(`admin.discord.level.${l}`) }))}
            />
          </Field>

          <div className="row wrap">
            <Button variant="primary" icon="save" onClick={() => update({ webhook })} busy={busy} disabled={webhook.trim() === ''}>
              {t('common.save')}
            </Button>
            <Button
              icon="send"
              disabled={!status.configured}
              busy={busy}
              onClick={() => {
                setBusy(true);
                void admin
                  .discordTest()
                  .then(() => toast.ok(t('admin.discord.tested')))
                  .catch(toast.fail)
                  .finally(() => setBusy(false));
              }}
            >
              {t('admin.discord.test')}
            </Button>
            {status.configured ? (
              <Button
                variant="danger"
                icon="trash"
                busy={busy}
                onClick={() => {
                  setBusy(true);
                  void admin
                    .discordClear()
                    .then((s) => {
                      setStatus(s);
                      toast.ok(t('common.saved'));
                    })
                    .catch(toast.fail)
                    .finally(() => setBusy(false));
                }}
              >
                {t('admin.discord.clear')}
              </Button>
            ) : null}
          </div>

          <dl className="kv">
            <dt>{t('admin.email.lastSuccess')}</dt>
            <dd>{dateTime(status.lastSuccess, locale)}</dd>
            <dt>{t('admin.email.lastFailure')}</dt>
            <dd>{dateTime(status.lastFailure, locale)}</dd>
            <dt>{t('admin.email.failures')}</dt>
            <dd>{status.failureCount}</dd>
          </dl>
        </div>
      </div>
    </>
  );
}

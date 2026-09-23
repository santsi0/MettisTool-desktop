import { useEffect, useState } from 'react';
import { admin } from '@/api';
import type { EmailStatus } from '@/api';
import { useI18n } from '@/i18n';
import { dateTime } from '@/lib/format';
import { useToast } from '@/state/toast';
import { Alert, Badge, Button, Field, Input, Loading, PasswordInput } from '@/ui';

export function Email() {
  const { t, locale } = useI18n();
  const toast = useToast();

  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void admin.emailStatus().then((s) => {
      if (!alive) return;
      setStatus(s);
      setSenderName(s.senderName);
      setSenderEmail(s.senderEmail);
    }, () => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!status) return <Loading />;

  const saveConfig = () => {
    setBusy(true);
    void admin
      .emailConfigure({
        apiKey: apiKey.trim() || undefined,
        senderName: senderName.trim(),
        senderEmail: senderEmail.trim()
      })
      .then((s) => {
        setStatus(s);
        setApiKey('');
        toast.ok(t('common.saved'));
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  const clearKey = () => {
    setBusy(true);
    void admin
      .emailClearKey()
      .then((s) => {
        setStatus(s);
        toast.ok(t('common.saved'));
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  const test = () => {
    setBusy(true);
    void admin
      .emailTest(testTo.trim())
      .then(() => {
        toast.ok(t('admin.email.testSent'));
        void admin.emailStatus().then(setStatus, () => undefined);
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className="card">
        <div className="card-h">
          <h3>{t('admin.email.title')}</h3>
          <span className="right">
            {status.configured ? <Badge kind="ok">{t('admin.email.configured')}</Badge> : <Badge kind="warn">{t('admin.email.notConfigured')}</Badge>}
          </span>
        </div>
        <div className="card-b">
          <Alert>{t('admin.email.hint')}</Alert>
          <Field label={t('admin.email.apiKey')} hint={status.configured ? t('admin.security.secretHidden') : undefined}>
            <PasswordInput
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('admin.email.apiKeyPlaceholder')}
              autoComplete="off"
            />
          </Field>
          <Field label={t('admin.email.senderName')}>
            <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={64} />
          </Field>
          <Field label={t('admin.email.senderEmail')}>
            <Input type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} maxLength={254} />
          </Field>
          <div className="row wrap">
            <Button variant="primary" icon="save" onClick={saveConfig} busy={busy}>{t('common.save')}</Button>
            {status.configured ? (
              <Button variant="danger" icon="trash" onClick={clearKey} busy={busy}>{t('admin.email.clearKey')}</Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('admin.email.testSend')}</h3>
        </div>
        <div className="card-b">
          <Field label={t('admin.email.testTo')}>
            <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </Field>
          <div>
            <Button icon="send" onClick={test} busy={busy} disabled={!status.configured || testTo.trim() === ''}>
              {t('admin.email.testSend')}
            </Button>
          </div>
          <dl className="kv">
            <dt>{t('admin.email.sent')}</dt>
            <dd>{status.sentCount}</dd>
            <dt>{t('admin.email.failures')}</dt>
            <dd>{status.failureCount}</dd>
            <dt>{t('admin.email.lastSuccess')}</dt>
            <dd>{dateTime(status.lastSuccess, locale)}</dd>
            <dt>{t('admin.email.lastFailure')}</dt>
            <dd>{dateTime(status.lastFailure, locale)}</dd>
          </dl>
          {status.lastError ? <Alert kind="err">{status.lastError}</Alert> : null}
        </div>
      </div>
    </>
  );
}

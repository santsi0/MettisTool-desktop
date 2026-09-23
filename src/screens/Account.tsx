import { useCallback, useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { account, auth } from '@/api';
import type { LoginMethods, SessionRow, TwoFactorSetup, TwoFactorState } from '@/api';
import { useI18n } from '@/i18n';
import { date, dateTime } from '@/lib/format';
import { usePasswordPolicy, usePasswordStrength } from '@/lib/hooks';
import { useSession } from '@/state/session';
import { useToast } from '@/state/toast';
import {
  Alert, Badge, Button, CopyButton, Field, Form, Icon, Input, Modal, PasswordInput
} from '@/ui';
import { QrCode } from '@/ui/QrCode';
import { PasswordMeter } from './AuthLayout';

type Tab = 'profile' | 'security' | 'sessions' | 'data';
const TABS: Tab[] = ['profile', 'security', 'sessions', 'data'];

export function Account() {
  const { t } = useI18n();
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>('profile');

  if (!user) return null;

  return (
    <div className="page narrow">
      <div className="page-h">
        <div>
          <h1>{t('account.title')}</h1>
          <p>{user.email}</p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((k) => (
          <button key={k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>
            {t(`account.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'profile' ? <Profile /> : null}
      {tab === 'security' ? <Security /> : null}
      {tab === 'sessions' ? <Sessions /> : null}
      {tab === 'data' ? <DataTab /> : null}
    </div>
  );
}

/* ---------- Profiili ---------- */

function Profile() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const [modal, setModal] = useState<'email' | 'username' | 'password' | null>(null);

  if (!user) return null;

  return (
    <>
      <div className="card">
        <div className="card-h">
          <h3>{t('account.profile')}</h3>
        </div>
        <div className="card-b">
          <dl className="kv">
            <dt>{t('auth.username')}</dt>
            <dd>{user.username}</dd>
            <dt>{t('auth.email')}</dt>
            <dd>
              {user.email}{' '}
              {user.emailVerified ? (
                <Badge kind="ok">{t('account.emailVerified')}</Badge>
              ) : (
                <Badge kind="warn">{t('account.emailUnverified')}</Badge>
              )}
            </dd>
            <dt>{t('account.role')}</dt>
            <dd>
              <Badge kind={user.role === 'OWNER' ? 'acc' : undefined}>{t(`role.${user.role}`)}</Badge>
            </dd>
            <dt>{t('account.created')}</dt>
            <dd>{date(user.createdAt, locale)}</dd>
            <dt>{t('account.lastLogin')}</dt>
            <dd>{dateTime(user.lastLoginAt, locale)}</dd>
          </dl>
        </div>
        <div className="card-f">
          <Button icon="edit" onClick={() => setModal('username')}>{t('account.changeUsername')}</Button>
          <Button icon="mail" onClick={() => setModal('email')}>{t('account.changeEmail')}</Button>
          <Button icon="key" onClick={() => setModal('password')}>{t('account.changePassword')}</Button>
        </div>
      </div>

      {modal === 'username' ? <ChangeIdentity mode="username" onClose={() => setModal(null)} /> : null}
      {modal === 'email' ? <ChangeIdentity mode="email" onClose={() => setModal(null)} /> : null}
      {modal === 'password' ? <ChangePassword onClose={() => setModal(null)} /> : null}
    </>
  );
}

function ChangeIdentity({ mode, onClose }: { mode: 'username' | 'email'; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { user, applyUser } = useSession();
  const [password, setPassword] = useState('');
  const [value, setValue] = useState(mode === 'username' ? (user?.username ?? '') : '');
  const [busy, setBusy] = useState(false);

  const save = () => {
    setBusy(true);
    const p = mode === 'username'
      ? account.changeUsername(password, value.trim())
      : account.changeEmail(password, value.trim());
    void p
      .then((u) => {
        applyUser(u);
        toast.ok(t('common.saved'));
        onClose();
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title={t(mode === 'username' ? 'account.changeUsername' : 'account.changeEmail')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} busy={busy} disabled={value.trim() === '' || password === ''}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="modal-b">
        <Field label={t(mode === 'username' ? 'account.newUsername' : 'account.newEmail')}>
          <Input
            type={mode === 'email' ? 'email' : 'text'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={mode === 'email' ? 254 : 32}
            autoFocus
          />
        </Field>
        <Field label={t('auth.password')}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
      </div>
    </Modal>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { refreshSession } = useSession();
  const policy = usePasswordPolicy();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const strength = usePasswordStrength(next);

  const save = () => {
    setBusy(true);
    void account
      .changePassword(current, next)
      .then(async () => {
        await refreshSession();
        toast.ok(t('common.saved'));
        onClose();
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title={t('account.changePassword')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} busy={busy} disabled={current === '' || next === ''}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="modal-b">
        <Field label={t('auth.currentPassword')}>
          <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus autoComplete="current-password" />
        </Field>
        <Field label={t('auth.newPassword')} hint={policy ? t('auth.passwordRules', { n: policy.minLength }) : undefined}>
          <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <PasswordMeter score={strength?.score ?? null} label={strength ? t(`auth.strength${strength.score}`) : ''} />
      </div>
    </Modal>
  );
}

/* ---------- Turvallisuus ---------- */

function Security() {
  const { t } = useI18n();
  const toast = useToast();
  const { refreshSession } = useSession();

  const [status, setStatus] = useState<TwoFactorState | null>(null);
  const [methods, setMethods] = useState<LoginMethods | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [reauth, setReauth] = useState<'disable' | 'codes' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void account.twoFactorStatus().then(setStatus, () => undefined);
    void auth.loginMethods().then(setMethods, () => undefined);
  }, []);

  useEffect(load, [load]);

  const begin = () => {
    setBusy(true);
    void account.twoFactorBegin().then(setSetup).catch(toast.fail).finally(() => setBusy(false));
  };

  const linkGoogle = () => {
    void auth
      .googleBegin(true)
      .then(async (url) => {
        await openUrl(url);
        const timer = window.setInterval(() => {
          void auth.googlePoll().then(
            (res) => {
              if (res.status === 'pending') return;
              window.clearInterval(timer);
              if (res.status === 'ready') {
                toast.ok(t('account.googleLinked'));
                load();
                void refreshSession();
              } else {
                toast.err(t('err.oauth_failed'));
              }
            },
            () => window.clearInterval(timer)
          );
        }, 1200);
      })
      .catch(toast.fail);
  };

  const unlinkGoogle = () => {
    void auth
      .googleUnlink()
      .then(() => {
        load();
        void refreshSession();
        toast.ok(t('common.saved'));
      })
      .catch(toast.fail);
  };

  return (
    <>
      <div className="card">
        <div className="card-h">
          <h3>{t('account.twoFactor')}</h3>
          <span className="right">
            {status?.enabled ? <Badge kind="ok">{t('account.twoFactorOn')}</Badge> : <Badge>{t('account.twoFactorOff')}</Badge>}
          </span>
        </div>
        <div className="card-b">
          {status?.enabled ? (
            <>
              <p className="muted">{t('account.recoveryLeft', { n: status.remainingRecoveryCodes })}</p>
              <div className="row wrap">
                <Button icon="refresh" onClick={() => setReauth('codes')}>{t('account.recoveryNew')}</Button>
                <Button variant="danger" icon="ban" onClick={() => setReauth('disable')}>{t('account.twoFactorDisable')}</Button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">{t('auth.twoFactorSub')}</p>
              <div>
                <Button variant="primary" icon="shield-check" onClick={begin} busy={busy}>
                  {t('account.twoFactorEnable')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('account.loginMethods')}</h3>
        </div>
        <div className="card-b">
          <div className="row">
            <Icon name="key" className="ic ic-sm dim" />
            <span className="grow">{t('account.methodPassword')}</span>
            {methods?.password ? <Badge kind="ok">{t('common.enabled')}</Badge> : <Badge>{t('common.disabled')}</Badge>}
          </div>
          <div className="row">
            <Icon name="globe" className="ic ic-sm dim" />
            <span className="grow">{t('account.methodGoogle')}</span>
            {methods?.google ? (
              <Button size="sm" onClick={unlinkGoogle}>{t('account.unlinkGoogle')}</Button>
            ) : methods?.googleAvailable ? (
              <Button size="sm" onClick={linkGoogle}>{t('account.linkGoogle')}</Button>
            ) : (
              <Badge>{t('common.disabled')}</Badge>
            )}
          </div>
          <Alert>{t('auth.googleHint')}</Alert>
        </div>
      </div>

      {setup ? (
        <TwoFactorSetupModal
          setup={setup}
          onClose={() => setSetup(null)}
          onDone={(c) => {
            setCodes(c);
            setSetup(null);
            load();
            void refreshSession();
          }}
        />
      ) : null}

      {codes ? <RecoveryCodesModal codes={codes} onClose={() => setCodes(null)} /> : null}

      {reauth ? (
        <ReauthModal
          mode={reauth}
          onClose={() => setReauth(null)}
          onDone={(c) => {
            setReauth(null);
            if (c) setCodes(c);
            load();
            void refreshSession();
          }}
        />
      ) : null}
    </>
  );
}

function TwoFactorSetupModal({
  setup, onClose, onDone
}: { setup: TwoFactorSetup; onClose: () => void; onDone: (codes: string[]) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const enable = () => {
    setBusy(true);
    void account
      .twoFactorEnable(code.trim())
      .then((r) => onDone(r.codes))
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title={t('account.twoFactorEnable')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={enable} busy={busy} disabled={code.trim().length < 6}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="modal-b">
        <p className="muted">{t('account.twoFactorScan')}</p>
        <QrCode value={setup.otpauthUrl} />
        <Field label={t('account.twoFactorSecret')}>
          <div className="secret-box">{setup.secret}</div>
        </Field>
        <div>
          <CopyButton value={setup.secret} />
        </div>
        <Form onSubmit={enable}>
          <Field label={t('account.twoFactorConfirm')}>
            <Input className="code-input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} autoFocus />
          </Field>
        </Form>
      </div>
    </Modal>
  );
}

function RecoveryCodesModal({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal
      title={t('account.recoveryCodes')}
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>{t('common.ok')}</Button>}
    >
      <div className="modal-b">
        <Alert kind="warn">{t('account.recoveryWarning')}</Alert>
        <div className="codes">
          {codes.map((c) => (
            <code key={c}>{c}</code>
          ))}
        </div>
        <div>
          <CopyButton value={codes.join('\n')} />
        </div>
      </div>
    </Modal>
  );
}

function ReauthModal({
  mode, onClose, onDone
}: { mode: 'disable' | 'codes'; onClose: () => void; onDone: (codes: string[] | null) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    if (mode === 'disable') {
      void account
        .twoFactorDisable(password)
        .then(() => {
          toast.ok(t('common.saved'));
          onDone(null);
        })
        .catch(toast.fail)
        .finally(() => setBusy(false));
    } else {
      void account
        .twoFactorRecoveryCodes(password)
        .then((r) => onDone(r.codes))
        .catch(toast.fail)
        .finally(() => setBusy(false));
    }
  };

  return (
    <Modal
      title={t(mode === 'disable' ? 'account.twoFactorDisable' : 'account.recoveryNew')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={mode === 'disable' ? 'danger' : 'primary'} onClick={run} busy={busy} disabled={password === ''}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="modal-b">
        <Form onSubmit={run}>
          <Field label={t('account.deleteConfirm')}>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
          </Field>
        </Form>
      </div>
    </Modal>
  );
}

/* ---------- Istunnot ---------- */

function Sessions() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void account.sessions().then(setRows, () => undefined);
  }, []);

  useEffect(load, [load]);

  const revokeOthers = () => {
    setBusy(true);
    void account
      .revokeOtherSessions()
      .then((n) => {
        toast.ok(t('account.revoked', { n }));
        load();
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <div className="card">
      <div className="card-h">
        <h3>{t('account.activeSessions')}</h3>
        <span className="right">
          <Button size="sm" icon="logout" onClick={revokeOthers} busy={busy} disabled={rows.length < 2}>
            {t('account.revokeOthers')}
          </Button>
        </span>
      </div>
      <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('account.thisDevice')}</th>
              <th>{t('account.created')}</th>
              <th>{t('account.lastSeen')}</th>
              <th>{t('account.expires')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className={s.current ? 'sel' : undefined}>
                <td>{s.current ? <Badge kind="acc">{t('account.thisDevice')}</Badge> : (s.device ?? '—')}</td>
                <td>{dateTime(s.createdAt, locale)}</td>
                <td>{dateTime(s.lastSeenAt, locale)}</td>
                <td>{dateTime(s.expiresAt, locale)}</td>
                <td className="act">
                  {s.current ? null : (
                    <Button
                      size="sm"
                      onClick={() => {
                        void account.revokeSession(s.id).then(load).catch(toast.fail);
                      }}
                    >
                      {t('account.revoke')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-row">{t('common.noResults')}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Omat tiedot ---------- */

function DataTab() {
  const { t } = useI18n();
  const toast = useToast();
  const { user, signOut } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const exportData = () => {
    void account
      .exportMyData()
      .then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mettistool-${user?.username ?? 'tili'}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      })
      .catch(toast.fail);
  };

  const remove = () => {
    setBusy(true);
    void account
      .deleteMyAccount(password)
      .then(() => signOut())
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className="card">
        <div className="card-h">
          <h3>{t('account.data')}</h3>
        </div>
        <div className="card-b">
          <p className="muted">{t('account.exportHint')}</p>
          <div>
            <Button icon="download" onClick={exportData}>{t('account.exportData')}</Button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('account.danger')}</h3>
        </div>
        <div className="card-b">
          <Alert kind="err">{t('account.deleteWarning')}</Alert>
          <div>
            <Button variant="danger" icon="trash" onClick={() => setConfirming(true)}>
              {t('account.deleteAccount')}
            </Button>
          </div>
        </div>
      </div>

      {confirming ? (
        <Modal
          title={t('account.deleteAccount')}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={remove} busy={busy} disabled={password === ''}>
                {t('common.delete')}
              </Button>
            </>
          }
        >
          <div className="modal-b">
            <Alert kind="err">{t('account.deleteWarning')}</Alert>
            <Field label={t('account.deleteConfirm')}>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
            </Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { admin } from '@/api';
import type { PermissionInfo, PublicUser, Role, UserFilter } from '@/api';
import { useI18n } from '@/i18n';
import { date, dateTime } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { useSession } from '@/state/session';
import { useToast } from '@/state/toast';
import {
  Alert, Badge, Button, Check, CopyButton, Field, Icon, Input, Loading, Modal, Pager, PasswordInput, Select, Switch
} from '@/ui';

const ROLES: Role[] = ['USER', 'MODERATOR', 'ADMIN', 'OWNER'];
const LIMIT = 25;

export function Users({ onlyAdmins = false }: { onlyAdmins?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { can, isOwner, user: me } = useSession();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [verified, setVerified] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<PublicUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PublicUser | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useDebounced(search, 280);

  const load = useCallback(() => {
    setLoading(true);
    const filter: UserFilter = { limit: LIMIT, offset };
    if (q.trim()) filter.search = q.trim();
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (verified) filter.verified = verified === 'yes';

    void admin
      .listUsers(filter)
      .then((p) => {
        const items = onlyAdmins ? p.items.filter((u) => u.role !== 'USER') : p.items;
        setRows(items);
        setTotal(onlyAdmins ? items.length : p.total);
      })
      .catch(toast.fail)
      .finally(() => setLoading(false));
    // toast.fail on vakaa viittaus
  }, [q, role, status, verified, offset, onlyAdmins, toast.fail]);

  useEffect(load, [load]);
  useEffect(() => setOffset(0), [q, role, status, verified]);

  const refreshRow = (u: PublicUser) => {
    setRows((prev) => prev.map((r) => (r.id === u.id ? u : r)));
    setSelected((prev) => (prev && prev.id === u.id ? u : prev));
  };

  return (
    <>
      <div className="filters">
        <Field className="grow" label={t('common.search')}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.user.searchPlaceholder')} />
        </Field>
        {onlyAdmins ? null : (
          <Field label={t('admin.user.filterRole')}>
            <Select
              value={role}
              onChange={setRole}
              options={[{ value: '', label: t('common.all') }, ...ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))]}
            />
          </Field>
        )}
        <Field label={t('admin.user.filterStatus')}>
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: t('common.all') },
              { value: 'ACTIVE', label: t('status.ACTIVE') },
              { value: 'DISABLED', label: t('status.DISABLED') }
            ]}
          />
        </Field>
        <Field label={t('admin.user.filterVerified')}>
          <Select
            value={verified}
            onChange={setVerified}
            options={[
              { value: '', label: t('common.all') },
              { value: 'yes', label: t('common.yes') },
              { value: 'no', label: t('common.no') }
            ]}
          />
        </Field>
        {can('MANAGE_ADMINS') || isOwner ? (
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            {t('admin.user.new')}
          </Button>
        ) : null}
      </div>

      {loading && rows.length === 0 ? (
        <Loading />
      ) : (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('auth.username')}</th>
                  <th>{t('auth.email')}</th>
                  <th>{t('admin.user.role')}</th>
                  <th>{t('admin.user.status')}</th>
                  <th>{t('admin.user.created')}</th>
                  <th>{t('admin.user.lastLogin')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className={u.id === me?.id ? 'sel' : undefined}>
                    <td>
                      <span className="row">
                        {u.username}
                        {u.totpEnabled ? <Icon name="shield-check" className="ic ic-sm" title="2FA" /> : null}
                      </span>
                    </td>
                    <td className="trunc" style={{ maxWidth: 220 }}>
                      {u.email}{' '}
                      {u.emailVerified ? null : <Badge kind="warn">!</Badge>}
                    </td>
                    <td>
                      <Badge kind={u.role === 'OWNER' ? 'acc' : u.role === 'USER' ? undefined : 'ok'}>{t(`role.${u.role}`)}</Badge>
                    </td>
                    <td>
                      {u.status === 'ACTIVE' ? (
                        u.lockedUntil ? <Badge kind="err">{t('admin.user.lock')}</Badge> : <Badge kind="ok">{t('status.ACTIVE')}</Badge>
                      ) : (
                        <Badge>{t('status.DISABLED')}</Badge>
                      )}
                    </td>
                    <td>{date(u.createdAt, locale)}</td>
                    <td>{dateTime(u.lastLoginAt, locale)}</td>
                    <td className="act">
                      <Button size="sm" onClick={() => setSelected(u)}>{t('common.edit')}</Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-row">{t('common.noResults')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {onlyAdmins ? null : <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />}
        </>
      )}

      {selected ? (
        <UserModal
          user={selected}
          onClose={() => setSelected(null)}
          onChanged={refreshRow}
          onDeleted={() => {
            setSelected(null);
            load();
          }}
        />
      ) : null}

      {creating ? (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}
    </>
  );
}

/* ---------- Käyttäjän tiedot ---------- */

function UserModal({
  user, onClose, onChanged, onDeleted
}: { user: PublicUser; onClose: () => void; onChanged: (u: PublicUser) => void; onDeleted: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { can, isOwner, user: me } = useSession();
  const [busy, setBusy] = useState(false);
  const [perms, setPerms] = useState<PermissionInfo[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const self = me?.id === user.id;

  useEffect(() => {
    if (!isOwner) return;
    void admin.listPermissions(user.id).then(setPerms, () => undefined);
  }, [isOwner, user.id]);

  const act = <T,>(p: Promise<T>, after?: (v: T) => void) => {
    setBusy(true);
    void p
      .then((v) => {
        after?.(v);
        toast.ok(t('common.saved'));
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={t('admin.user.edit')} onClose={onClose} wide>
      <div className="modal-b">
        <dl className="kv">
          <dt>{t('auth.username')}</dt>
          <dd>{user.username}</dd>
          <dt>{t('auth.email')}</dt>
          <dd>
            {user.email}{' '}
            {user.emailVerified ? <Badge kind="ok">{t('admin.user.verified')}</Badge> : <Badge kind="warn">{t('account.emailUnverified')}</Badge>}
          </dd>
          <dt>{t('admin.user.created')}</dt>
          <dd>{dateTime(user.createdAt, locale)}</dd>
          <dt>{t('admin.user.lastLogin')}</dt>
          <dd>{dateTime(user.lastLoginAt, locale)}</dd>
          <dt>{t('admin.user.failedLogins')}</dt>
          <dd>{user.failedLogins}</dd>
          {user.lockedUntil ? (
            <>
              <dt>{t('admin.user.lock')}</dt>
              <dd>{t('admin.user.lockedUntil', { time: dateTime(user.lockedUntil, locale) })}</dd>
            </>
          ) : null}
        </dl>

        {can('MANAGE_ROLES') ? (
          <Field label={t('admin.user.role')} hint={t('admin.admins.hint')}>
            <Select
              value={user.role}
              disabled={busy || self}
              onChange={(r) => act(admin.setUserRole(user.id, r as Role), onChanged)}
              options={ROLES.filter((r) => r !== 'OWNER' || isOwner).map((r) => ({ value: r, label: t(`role.${r}`) }))}
            />
          </Field>
        ) : null}

        <div className="col">
          {can('EDIT_USERS') ? (
            <>
              <div className="row">
                <span className="grow">{t('status.ACTIVE')}</span>
                <Switch
                  label={t('status.ACTIVE')}
                  checked={user.status === 'ACTIVE'}
                  disabled={busy || self}
                  onChange={(v) => act(admin.setUserStatus(user.id, v), onChanged)}
                />
              </div>
              <div className="row wrap">
                {user.lockedUntil ? (
                  <Button size="sm" icon="unlock" busy={busy} onClick={() => act(admin.setUserLock(user.id, false), onChanged)}>
                    {t('admin.user.unlock')}
                  </Button>
                ) : (
                  <Button size="sm" icon="lock" busy={busy} disabled={self} onClick={() => act(admin.setUserLock(user.id, true), onChanged)}>
                    {t('admin.user.lock')}
                  </Button>
                )}
                {user.emailVerified ? null : (
                  <>
                    <Button size="sm" icon="check" busy={busy} onClick={() => act(admin.verifyUserEmail(user.id), onChanged)}>
                      {t('admin.user.verifyEmail')}
                    </Button>
                    <Button size="sm" icon="mail" busy={busy} onClick={() => act(admin.sendVerification(user.id))}>
                      {t('admin.user.sendVerification')}
                    </Button>
                  </>
                )}
                <Button size="sm" icon="logout" busy={busy} onClick={() => act(admin.revokeUserSessions(user.id))}>
                  {t('admin.user.revokeSessions')}
                </Button>
              </div>
            </>
          ) : null}

          {can('RESET_PASSWORDS') ? (
            <div className="row wrap">
              <Button size="sm" icon="key" busy={busy} onClick={() => act(admin.resetPassword(user.id))}>
                {t('admin.user.resetPassword')}
              </Button>
              <Button size="sm" icon="refresh" busy={busy} onClick={() => act(admin.forcePasswordChange(user.id), onChanged)}>
                {t('admin.user.forceChange')}
              </Button>
            </div>
          ) : null}
        </div>

        {isOwner && perms ? (
          <div className="card">
            <div className="card-h">
              <h3>{t('admin.user.permissions')}</h3>
              <p className="right dim">{t('admin.user.permissionsHint')}</p>
            </div>
            <div className="card-b">
              {perms.map((p) => (
                <div className="toggle-row" key={p.name}>
                  <div className="tr-txt">
                    <strong>{t(`perm.${p.name}`)}</strong>
                    <span>{p.fromRole ? t('admin.user.fromRole') : p.name}</span>
                  </div>
                  <Switch
                    label={t(`perm.${p.name}`)}
                    checked={p.granted}
                    disabled={busy || user.role === 'OWNER'}
                    onChange={(v) => {
                      setBusy(true);
                      void admin
                        .setUserPermission(user.id, p.name, v)
                        .then(() => admin.listPermissions(user.id).then(setPerms))
                        .catch(toast.fail)
                        .finally(() => setBusy(false));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {can('DELETE_USERS') && !self ? (
          <>
            <Alert kind="err">{t('admin.user.deleteConfirm', { name: user.username })}</Alert>
            {confirmDelete ? (
              <div className="row wrap">
                <Button variant="danger" icon="trash" busy={busy} onClick={() => {
                  setBusy(true);
                  void admin.deleteUser(user.id).then(onDeleted).catch(toast.fail).finally(() => setBusy(false));
                }}>
                  {t('common.confirm')}
                </Button>
                <Button onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
              </div>
            ) : (
              <div>
                <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
                  {t('admin.user.delete')}
                </Button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---------- Uusi käyttäjä ---------- */

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { isOwner } = useSession();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [sendInvite, setSendInvite] = useState(true);
  const [password, setPassword] = useState('');
  const [markVerified, setMarkVerified] = useState(false);
  const [requireChange, setRequireChange] = useState(true);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<PublicUser | null>(null);

  const create = () => {
    setBusy(true);
    void admin
      .createUser({
        username: username.trim(),
        email: email.trim(),
        role,
        sendInvite,
        password: sendInvite ? undefined : password,
        markVerified,
        requirePasswordChange: requireChange
      })
      .then(setCreated)
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  if (created) {
    return (
      <Modal
        title={t('admin.user.create')}
        onClose={onCreated}
        footer={<Button variant="primary" onClick={onCreated}>{t('common.ok')}</Button>}
      >
        <div className="modal-b">
          <Alert kind="ok">{created.username} · {created.email}</Alert>
          {sendInvite ? (
            <p className="muted">{t('auth.codeHint')}</p>
          ) : (
            <>
              <Alert kind="warn">{t('admin.user.tempPasswordHint')}</Alert>
              <Field label={t('admin.user.tempPassword')}>
                <div className="secret-box">{password}</div>
              </Field>
              <div>
                <CopyButton value={password} />
              </div>
            </>
          )}
        </div>
      </Modal>
    );
  }

  const ready = username.trim() !== '' && email.trim() !== '' && (sendInvite || password !== '');

  return (
    <Modal
      title={t('admin.user.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={create} busy={busy} disabled={!ready}>
            {t('admin.user.create')}
          </Button>
        </>
      }
    >
      <div className="modal-b">
        <Field label={t('auth.username')}>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} autoFocus />
        </Field>
        <Field label={t('auth.email')}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        </Field>
        <Field label={t('admin.user.role')} hint={t('admin.admins.hint')}>
          <Select
            value={role}
            onChange={(r) => setRole(r as Role)}
            options={ROLES.filter((r) => r !== 'OWNER' || isOwner).map((r) => ({ value: r, label: t(`role.${r}`) }))}
          />
        </Field>
        <Check checked={sendInvite} onChange={setSendInvite} label={t('admin.user.sendInvite')} />
        {sendInvite ? null : (
          <Field label={t('admin.user.tempPassword')} hint={t('admin.user.tempPasswordHint')}>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        )}
        <Check checked={markVerified} onChange={setMarkVerified} label={t('admin.user.markVerified')} />
        {sendInvite ? null : (
          <Check checked={requireChange} onChange={setRequireChange} label={t('admin.user.requireChange')} />
        )}
      </div>
    </Modal>
  );
}

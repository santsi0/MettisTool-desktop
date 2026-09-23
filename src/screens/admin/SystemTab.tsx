import { useCallback, useEffect, useState } from 'react';
import { admin } from '@/api';
import type { BackupRow, SystemInfo } from '@/api';
import { useI18n } from '@/i18n';
import { bytes, dateTime, duration } from '@/lib/format';
import { useSession } from '@/state/session';
import { useToast } from '@/state/toast';
import { Badge, Button, ConfirmModal, Loading } from '@/ui';

export function SystemTab() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { isOwner } = useSession();

  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<BackupRow | null>(null);

  const load = useCallback(() => {
    void admin.systemInfo().then(setInfo, () => undefined);
    void admin.backupList().then(setBackups, () => undefined);
  }, []);

  useEffect(load, [load]);

  if (!info) return <Loading />;

  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      <div className="card">
        <div className="card-h">
          <h3>{t('admin.system.title')}</h3>
        </div>
        <div className="card-b">
          <dl className="kv">
            <dt>{t('admin.system.version')}</dt>
            <dd className="mono">{info.appVersion}</dd>
            <dt>{t('admin.system.os')}</dt>
            <dd className="mono">{info.os} · {info.arch}</dd>
            <dt>{t('admin.system.uptime')}</dt>
            <dd>{duration(now - info.startedAt)}</dd>
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('admin.system.database')}</h3>
          <span className="right">
            {info.database.integrityOk ? <Badge kind="ok">{t('admin.system.dbIntegrity')}</Badge> : <Badge kind="err">{t('admin.system.dbIntegrity')}</Badge>}
          </span>
        </div>
        <div className="card-b">
          <dl className="kv">
            <dt>{t('admin.system.dbSize')}</dt>
            <dd>{bytes(info.database.sizeBytes, t, locale)}</dd>
            <dt>{t('admin.stat.totalUsers')}</dt>
            <dd>{info.database.users}</dd>
            <dt>{t('admin.audit')}</dt>
            <dd>{info.database.auditEntries}</dd>
            <dt>{t('admin.stat.activeSessions')}</dt>
            <dd>{info.database.activeSessions}</dd>
            <dt>{t('admin.system.schema')}</dt>
            <dd>{info.database.schemaVersion}</dd>
            <dt>{t('admin.system.dbPath')}</dt>
            <dd className="mono" style={{ fontSize: 11.5 }}>{info.database.path}</dd>
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('admin.system.backups')}</h3>
          <span className="right">
            <Button
              size="sm"
              icon="save"
              busy={busy}
              onClick={() => {
                setBusy(true);
                void admin
                  .backupCreate()
                  .then(() => {
                    toast.ok(t('admin.system.backupCreated'));
                    load();
                  })
                  .catch(toast.fail)
                  .finally(() => setBusy(false));
              }}
            >
              {t('admin.system.backupCreate')}
            </Button>
          </span>
        </div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('admin.user.created')}</th>
                <th>{t('admin.user.filterStatus')}</th>
                <th>{t('admin.system.dbSize')}</th>
                <th>{t('admin.system.version')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id}>
                  <td>{dateTime(b.createdAt, locale)}</td>
                  <td>{t(`admin.system.backupKind.${b.kind}`)}</td>
                  <td>{bytes(b.size, t, locale)}</td>
                  <td className="mono">{b.appVersion ?? '—'}</td>
                  <td className="act">
                    {isOwner ? (
                      <Button size="sm" onClick={() => setRestoring(b)}>{t('admin.system.backupRestore')}</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-row">{t('admin.system.noBackups')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {restoring ? (
        <ConfirmModal
          title={t('admin.system.backupRestore')}
          message={t('admin.system.backupRestoreConfirm')}
          danger
          busy={busy}
          onClose={() => setRestoring(null)}
          onConfirm={() => {
            setBusy(true);
            void admin
              .backupRestore(restoring.path)
              .catch(toast.fail)
              .finally(() => {
                setBusy(false);
                setRestoring(null);
              });
          }}
        />
      ) : null}
    </>
  );
}

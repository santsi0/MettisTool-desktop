import { useEffect, useState } from 'react';
import { admin } from '@/api';
import type { AdminStats, AuditEntry } from '@/api';
import { useI18n } from '@/i18n';
import { dateTime, num } from '@/lib/format';
import { Badge, Loading } from '@/ui';
import { DailyChart } from './Chart';

const CARDS: { key: string; pick: (s: AdminStats) => number; kind?: 'ok' | 'warn' | 'err' | 'acc' }[] = [
  { key: 'totalUsers', pick: (s) => s.totalUsers, kind: 'acc' },
  { key: 'verified', pick: (s) => s.verifiedUsers, kind: 'ok' },
  { key: 'unverified', pick: (s) => s.unverifiedUsers, kind: 'warn' },
  { key: 'disabled', pick: (s) => s.disabledUsers },
  { key: 'locked', pick: (s) => s.lockedUsers, kind: 'err' },
  { key: 'activeSessions', pick: (s) => s.activeSessions },
  { key: 'registrations7d', pick: (s) => s.registrations7d },
  { key: 'logins7d', pick: (s) => s.logins7d },
  { key: 'failed7d', pick: (s) => s.failedLogins7d, kind: 'err' },
  { key: 'security7d', pick: (s) => s.securityEvents7d, kind: 'warn' }
];

export function Overview({ canAudit }: { canAudit: boolean }) {
  const { t, locale } = useI18n();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [events, setEvents] = useState<AuditEntry[]>([]);

  useEffect(() => {
    let alive = true;
    void admin.stats().then((s) => alive && setStats(s), () => undefined);
    if (canAudit) {
      void admin
        .auditList({ limit: 10, offset: 0 })
        .then((p) => alive && setEvents(p.items), () => undefined);
    }
    return () => {
      alive = false;
    };
  }, [canAudit]);

  if (!stats) return <Loading />;

  return (
    <>
      <div className="stat-grid">
        {CARDS.map((c) => (
          <div key={c.key} className={c.kind ? `stat ${c.kind}` : 'stat'}>
            <span className="v">{num(c.pick(stats), locale)}</span>
            <span className="k">{t(`admin.stat.${c.key}`)}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('admin.chart.title')}</h3>
        </div>
        <div className="card-b">
          <DailyChart data={stats.daily} />
        </div>
      </div>

      {canAudit ? (
        <div className="card">
          <div className="card-h">
            <h3>{t('admin.recentEvents')}</h3>
          </div>
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('admin.audit.time')}</th>
                  <th>{t('admin.audit.event')}</th>
                  <th>{t('admin.audit.actor')}</th>
                  <th>{t('admin.audit.severity')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{dateTime(e.ts, locale)}</td>
                    <td className="mono">{e.event}</td>
                    <td>{e.actorName ?? t('admin.audit.system')}</td>
                    <td>
                      <Badge kind={e.severity === 'CRITICAL' ? 'err' : e.severity === 'WARNING' ? 'warn' : undefined}>
                        {t(`sev.${e.severity}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-row">{t('common.noResults')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { admin } from '@/api';
import type { AuditEntry, AuditFilter } from '@/api';
import { useI18n } from '@/i18n';
import { dateTime } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { useSession } from '@/state/session';
import { useToast } from '@/state/toast';
import { Badge, Button, Field, Input, Loading, Modal, Pager, Select } from '@/ui';

const LIMIT = 50;
const CATEGORIES = ['AUTH', 'ACCOUNT', 'ADMIN', 'SECURITY', 'SYSTEM'];
const SEVERITIES = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'];

export function Audit() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { isOwner } = useSession();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const [pruning, setPruning] = useState(false);

  const q = useDebounced(search, 280);

  const filter = useCallback((limit: number, off: number): AuditFilter => {
    const f: AuditFilter = { limit, offset: off };
    if (q.trim()) f.search = q.trim();
    if (category) f.category = category;
    if (severity) f.severity = severity;
    return f;
  }, [q, category, severity]);

  const load = useCallback(() => {
    setLoading(true);
    void admin
      .auditList(filter(LIMIT, offset))
      .then((p) => {
        setRows(p.items);
        setTotal(p.total);
      })
      .catch(toast.fail)
      .finally(() => setLoading(false));
  }, [filter, offset, toast]);

  useEffect(load, [load]);
  useEffect(() => setOffset(0), [q, category, severity]);

  const exportCsv = () => {
    void admin
      .auditExport(filter(5000, 0))
      .then((csv) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mettistool-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      })
      .catch(toast.fail);
  };

  return (
    <>
      <div className="filters">
        <Field className="grow" label={t('common.search')}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.audit.search')} />
        </Field>
        <Field label={t('admin.audit.category')}>
          <Select
            value={category}
            onChange={setCategory}
            options={[{ value: '', label: t('common.all') }, ...CATEGORIES.map((c) => ({ value: c, label: t(`cat.${c}`) }))]}
          />
        </Field>
        <Field label={t('admin.audit.severity')}>
          <Select
            value={severity}
            onChange={setSeverity}
            options={[{ value: '', label: t('common.all') }, ...SEVERITIES.map((s) => ({ value: s, label: t(`sev.${s}`) }))]}
          />
        </Field>
        <Button icon="download" onClick={exportCsv}>{t('admin.audit.exportCsv')}</Button>
        {isOwner ? (
          <Button icon="trash" onClick={() => setPruning(true)}>{t('admin.audit.prune')}</Button>
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
                  <th>{t('admin.audit.time')}</th>
                  <th>{t('admin.audit.event')}</th>
                  <th>{t('admin.audit.category')}</th>
                  <th>{t('admin.audit.actor')}</th>
                  <th>{t('admin.audit.target')}</th>
                  <th>{t('admin.audit.result')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>{dateTime(e.ts, locale)}</td>
                    <td className="mono">{e.event}</td>
                    <td>{t(`cat.${e.category}`)}</td>
                    <td>{e.actorName ?? t('admin.audit.system')}</td>
                    <td>{e.targetName ?? '—'}</td>
                    <td>
                      <Badge kind={e.result === 'SUCCESS' ? 'ok' : 'err'}>{t(`result.${e.result}`)}</Badge>
                    </td>
                    <td className="act">
                      {e.meta ? (
                        <Button size="sm" onClick={() => setDetail(e)}>{t('admin.audit.details')}</Button>
                      ) : null}
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
          <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
        </>
      )}

      {detail ? (
        <Modal title={detail.event} onClose={() => setDetail(null)} wide>
          <div className="modal-b">
            <dl className="kv">
              <dt>{t('admin.audit.time')}</dt>
              <dd>{dateTime(detail.ts, locale)}</dd>
              <dt>{t('admin.audit.severity')}</dt>
              <dd>{t(`sev.${detail.severity}`)}</dd>
              <dt>{t('admin.audit.actor')}</dt>
              <dd>{detail.actorName ?? t('admin.audit.system')}</dd>
              <dt>{t('admin.audit.target')}</dt>
              <dd>{detail.targetName ?? '—'}</dd>
              <dt>{t('admin.system.version')}</dt>
              <dd>{detail.appVersion ?? '—'}</dd>
            </dl>
            <pre className="secret-box" style={{ whiteSpace: 'pre-wrap' }}>{detail.meta}</pre>
          </div>
        </Modal>
      ) : null}

      {pruning ? <PruneModal onClose={() => setPruning(false)} onDone={load} /> : null}
    </>
  );
}

function PruneModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [days, setDays] = useState('90');
  const [busy, setBusy] = useState(false);

  const run = () => {
    const n = Number.parseInt(days, 10);
    if (!Number.isFinite(n) || n < 1) return;
    setBusy(true);
    void admin
      .auditPrune(n)
      .then((removed) => {
        toast.ok(t('admin.audit.pruned', { n: removed }));
        onDone();
        onClose();
      })
      .catch(toast.fail)
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title={t('admin.audit.prune')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={run} busy={busy}>{t('common.confirm')}</Button>
        </>
      }
    >
      <div className="modal-b">
        <Field label={t('admin.audit.pruneHint', { n: days || '0' })}>
          <Input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

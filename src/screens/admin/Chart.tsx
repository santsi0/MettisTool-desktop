import { useI18n } from '@/i18n';
import type { DailyPoint } from '@/api';

const W = 600;
const H = 132;
const PAD = 6;

function path(values: number[], max: number): string {
  if (values.length < 2) return '';
  const stepX = (W - PAD * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - (max === 0 ? 0 : (v / max) * (H - PAD * 2));
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Kolmen sarjan viivakaavio audit-datasta. Ei kaaviokirjastoa. */
export function DailyChart({ data }: { data: DailyPoint[] }) {
  const { t } = useI18n();
  if (data.length === 0) return null;

  const regs = data.map((d) => d.registrations);
  const logins = data.map((d) => d.logins);
  const failed = data.map((d) => d.failed);
  const max = Math.max(1, ...regs, ...logins, ...failed);

  return (
    <div className="col">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('admin.chart.title')}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="grid-line" x1={PAD} x2={W - PAD} y1={PAD + f * (H - PAD * 2)} y2={PAD + f * (H - PAD * 2)} />
        ))}
        <path className="ln b" d={path(logins, max)} />
        <path className="ln a" d={path(regs, max)} />
        <path className="ln c" d={path(failed, max)} />
      </svg>
      <div className="chart-x">
        <span>{data[0]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
      <div className="chart-legend">
        <span><i style={{ background: 'var(--info)' }} />{t('admin.chart.logins')}</span>
        <span><i style={{ background: 'var(--acc)' }} />{t('admin.chart.registrations')}</span>
        <span><i style={{ background: 'var(--err)' }} />{t('admin.chart.failed')}</span>
      </div>
    </div>
  );
}

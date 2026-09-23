import type { ReactNode } from 'react';
import { Icon, Select } from '@/ui';
import { LANGUAGES, useI18n } from '@/i18n';
import type { LangCode } from '@/i18n';

export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="auth">
      <div className={wide ? 'auth-box wide' : 'auth-box'}>
        <div className="auth-brand">
          <div className="mark">
            <Icon name="layers" className="ic ic-lg" />
          </div>
          <div className="name">{t('app.name')}</div>
          <div className="sub">{t('app.tagline')}</div>
        </div>
        {children}
        <div className="auth-lang">
          <Icon name="globe" className="ic ic-sm dim" />
          <Select<LangCode>
            value={lang}
            onChange={setLang}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
          />
        </div>
      </div>
    </div>
  );
}

export function PasswordMeter({ score, label }: { score: number | null; label: string }) {
  return (
    <div>
      <div className="strength" data-score={score ?? 0}>
        <i /><i /><i /><i />
      </div>
      {score ? <span className="hint" style={{ marginTop: 4, display: 'block' }}>{label}</span> : null}
    </div>
  );
}

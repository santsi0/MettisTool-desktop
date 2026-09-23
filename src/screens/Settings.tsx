import { useEffect, useState } from 'react';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { account, system } from '@/api';
import type { UpdateInfo } from '@/api';
import { LANGUAGES, useI18n } from '@/i18n';
import type { LangCode } from '@/i18n';
import { useSession } from '@/state/session';
import { applyTheme, ACCENTS, THEMES, isAccent, isTheme } from '@/state/theme';
import type { Accent, Theme } from '@/state/theme';
import { useToast } from '@/state/toast';
import { Alert, Button, CopyButton, Field, Icon, Select, ToggleRow } from '@/ui';

export function Settings() {
  const { t, setLang } = useI18n();
  const toast = useToast();
  const { user, session, applyUser } = useSession();

  const [autostart, setAutostart] = useState(false);
  const [dataDir, setDataDir] = useState('');
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void system.autostartEnabled().then(setAutostart, () => undefined);
    void system.openDataFolder().then(setDataDir, () => undefined);
  }, []);

  if (!user) return null;

  const theme: Theme = isTheme(user.theme) ? user.theme : 'dark';
  const accent: Accent = isAccent(user.accent) ? user.accent : 'crimson';

  const savePrefs = (p: { language?: string; theme?: string; accent?: string }) => {
    // Sovelletaan heti, jotta muutos tuntuu välittömältä; palvelin vahvistaa perässä.
    applyTheme((p.theme as Theme) ?? theme, (p.accent as Accent) ?? accent);
    if (p.language && p.language !== user.language) setLang(p.language as LangCode);
    void account.updatePreferences(p).then(applyUser).catch(toast.fail);
  };

  const check = () => {
    setChecking(true);
    void system
      .checkUpdates()
      .then(setUpdate)
      .catch(toast.fail)
      .finally(() => setChecking(false));
  };

  return (
    <div className="page narrow">
      <div className="page-h">
        <div>
          <h1>{t('settings.title')}</h1>
          <p>{t('dash.version', { v: session?.appVersion ?? '' })}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('settings.appearance')}</h3>
        </div>
        <div className="card-b">
          <Field label={t('settings.theme')}>
            <Select<Theme>
              value={theme}
              onChange={(v) => savePrefs({ theme: v })}
              options={THEMES.map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))}
            />
          </Field>
          <Field label={t('settings.accent')}>
            <Select<Accent>
              value={accent}
              onChange={(v) => savePrefs({ accent: v })}
              options={ACCENTS.map((v) => ({ value: v, label: t(`settings.accent.${v}`) }))}
            />
          </Field>
          <Field label={t('settings.language')}>
            <Select<LangCode>
              value={(LANGUAGES.find((l) => l.code === user.language)?.code ?? 'fi') as LangCode}
              onChange={(v) => savePrefs({ language: v })}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
            />
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('settings.behaviour')}</h3>
        </div>
        <div className="card-b">
          <ToggleRow
            title={t('settings.autostart')}
            checked={autostart}
            onChange={(v) => {
              setAutostart(v);
              void system.setAutostart(v).then(setAutostart).catch((e) => {
                setAutostart(!v);
                toast.fail(e);
              });
            }}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('settings.checkNow')}</h3>
        </div>
        <div className="card-b">
          {update ? (
            update.updateAvailable ? (
              <Alert kind="warn">{t('settings.updateAvailable', { v: update.latestVersion ?? '' })}</Alert>
            ) : update.latestVersion ? (
              <Alert kind="ok">{t('settings.upToDate', { v: update.currentVersion })}</Alert>
            ) : (
              <Alert>{t('settings.updateRepoMissing')}</Alert>
            )
          ) : null}
          <div className="row wrap">
            <Button icon="refresh" onClick={check} busy={checking}>{t('settings.checkNow')}</Button>
            {update?.downloadUrl ? (
              <Button
                icon="external-link"
                onClick={() => {
                  void openUrl(update.downloadUrl as string).catch(toast.fail);
                }}
              >
                {t('settings.updateOpen')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('settings.dataFolder')}</h3>
        </div>
        <div className="card-b">
          <div className="secret-box">{dataDir || '—'}</div>
          <div className="row wrap">
            <Button
              icon="folder"
              disabled={dataDir === ''}
              onClick={() => {
                void openPath(dataDir).catch(toast.fail);
              }}
            >
              {t('settings.openDataFolder')}
            </Button>
            {dataDir ? <CopyButton value={dataDir} /> : null}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{t('settings.about')}</h3>
        </div>
        <div className="card-b">
          <p className="muted">{t('settings.aboutText')}</p>
          <div className="row">
            <Icon name="package" className="ic ic-sm dim" />
            <span className="mono">{t('app.name')}</span>
            <span className="dim">·</span>
            <span className="dim">{t('settings.licence')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

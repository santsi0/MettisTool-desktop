import { useState } from 'react';
import { useI18n } from '@/i18n';
import { Button, Field, Input, Loading, ToggleRow } from '@/ui';
import { useSettings } from './useSettings';

export function AppSettings() {
  const { t } = useI18n();
  const settings = useSettings();
  const [repo, setRepo] = useState<string | null>(null);

  if (!settings.values) return <Loading />;

  const repoValue = repo ?? settings.text('app.update_repo');

  return (
    <div className="card">
      <div className="card-h">
        <h3>{t('admin.settings')}</h3>
      </div>
      <div className="card-b">
        <ToggleRow
          title={t('admin.settings.registration')}
          checked={settings.bool('app.registration_enabled')}
          disabled={settings.busy}
          onChange={(v) => settings.setBool('app.registration_enabled', v)}
        />
        <ToggleRow
          title={t('admin.settings.requireVerification')}
          checked={settings.bool('app.require_email_verification')}
          disabled={settings.busy}
          onChange={(v) => settings.setBool('app.require_email_verification', v)}
        />
        <ToggleRow
          title={t('settings.minimizeToTray')}
          checked={settings.bool('app.minimize_to_tray')}
          disabled={settings.busy}
          onChange={(v) => settings.setBool('app.minimize_to_tray', v)}
        />
        <ToggleRow
          title={t('settings.autoBackup')}
          checked={settings.bool('app.auto_backup')}
          disabled={settings.busy}
          onChange={(v) => settings.setBool('app.auto_backup', v)}
        />
        <ToggleRow
          title={t('settings.updateCheck')}
          checked={settings.bool('app.update_check')}
          disabled={settings.busy}
          onChange={(v) => settings.setBool('app.update_check', v)}
        />

        <Field label={t('admin.settings.updateRepo')} hint={t('admin.settings.updateRepoHint')}>
          <Input value={repoValue} onChange={(e) => setRepo(e.target.value)} placeholder="kayttaja/repo" />
        </Field>
        <div>
          <Button
            icon="save"
            disabled={settings.busy || repo === null || repo === settings.text('app.update_repo')}
            onClick={() => {
              if (repo !== null) settings.set('app.update_repo', repo.trim());
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

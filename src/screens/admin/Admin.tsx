import { useI18n } from '@/i18n';
import { useRouter } from '@/state/router';
import { useSession } from '@/state/session';
import { Alert } from '@/ui';
import { AppSettings } from './AppSettings';
import { Audit } from './Audit';
import { Discord } from './Discord';
import { Email } from './Email';
import { Overview } from './Overview';
import { SecurityTab } from './SecurityTab';
import { SystemTab } from './SystemTab';
import { Users } from './Users';

interface TabDef {
  id: string;
  label: string;
  permission: string;
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'admin.overview', permission: 'VIEW_USERS' },
  { id: 'users', label: 'admin.users', permission: 'VIEW_USERS' },
  { id: 'admins', label: 'admin.admins', permission: 'MANAGE_ROLES' },
  { id: 'security', label: 'admin.security', permission: 'MANAGE_SECURITY' },
  { id: 'audit', label: 'admin.audit', permission: 'VIEW_AUDIT_LOGS' },
  { id: 'email', label: 'admin.email', permission: 'MANAGE_EMAIL' },
  { id: 'discord', label: 'admin.discord', permission: 'MANAGE_DISCORD' },
  { id: 'system', label: 'admin.system', permission: 'MANAGE_SYSTEM' },
  { id: 'settings', label: 'admin.settings', permission: 'MANAGE_SETTINGS' }
];

export function Admin({ tab }: { tab: string }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { can } = useSession();

  const allowed = TABS.filter((x) => can(x.permission));
  const current = allowed.find((x) => x.id === tab) ?? allowed[0];

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>{t('admin.title')}</h1>
          <p>{current ? t(current.label) : ''}</p>
        </div>
      </div>

      {allowed.length === 0 || !current ? (
        <Alert kind="warn">{t('admin.noAccess')}</Alert>
      ) : (
        <>
          <div className="tabs">
            {allowed.map((x) => (
              <button
                key={x.id}
                className={x.id === current.id ? 'tab active' : 'tab'}
                onClick={() => navigate({ name: 'admin', tab: x.id })}
              >
                {t(x.label)}
              </button>
            ))}
          </div>

          {current.id === 'overview' ? <Overview canAudit={can('VIEW_AUDIT_LOGS')} /> : null}
          {current.id === 'users' ? <Users /> : null}
          {current.id === 'admins' ? <Users onlyAdmins /> : null}
          {current.id === 'security' ? <SecurityTab /> : null}
          {current.id === 'audit' ? <Audit /> : null}
          {current.id === 'email' ? <Email /> : null}
          {current.id === 'discord' ? <Discord /> : null}
          {current.id === 'system' ? <SystemTab /> : null}
          {current.id === 'settings' ? <AppSettings /> : null}
        </>
      )}
    </div>
  );
}

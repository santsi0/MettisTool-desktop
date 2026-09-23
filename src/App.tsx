import { useEffect } from 'react';
import { system } from '@/api';
import { useT } from '@/i18n';
import { Shell } from '@/shell/Shell';
import { AuthScreen } from '@/screens/AuthScreen';
import { MustChangePassword } from '@/screens/MustChangePassword';
import { Setup } from '@/screens/Setup';
import { useSession } from '@/state/session';

export function App() {
  const t = useT();
  const { status, session, booting } = useSession();

  // Ikkuna näytetään vasta kun ensimmäinen näkymä on valmis — ei tyhjää välähdystä.
  useEffect(() => {
    if (!booting) void system.appReady().catch(() => undefined);
  }, [booting]);

  if (booting || !status) {
    return (
      <div className="boot-splash">
        <div className="boot-mark" />
        <div className="boot-name">{t('app.name')}</div>
        <div className="boot-sub">{t('app.tagline')}</div>
      </div>
    );
  }

  if (!status.setupComplete) return <Setup />;
  if (!session) return <AuthScreen />;
  if (session.user.mustChangePassword) return <MustChangePassword />;

  return <Shell />;
}

import { useEffect } from 'react';
import { system } from '@/api';
import { useT } from '@/i18n';
import { Shell } from '@/shell/Shell';
import { AuthScreen } from '@/screens/AuthScreen';
import { useSession } from '@/state/session';

export function App() {
  const t = useT();
  const { session, booting } = useSession();

  // Ikkuna näytetään vasta kun ensimmäinen näkymä on valmis — ei tyhjää välähdystä.
  useEffect(() => {
    if (!booting) void system.appReady().catch(() => undefined);
  }, [booting]);

  if (booting) {
    return (
      <div className="boot-splash">
        <div className="boot-mark" />
        <div className="boot-name">{t('app.name')}</div>
        <div className="boot-sub">{t('app.tagline')}</div>
      </div>
    );
  }

  return session ? <Shell /> : <AuthScreen />;
}

import { useState } from 'react';
import { Dashboard, ToolList } from '@/screens/Dashboard';
import { ToolView } from '@/screens/ToolView';
import { useRouter } from '@/state/router';
import { ToolsProvider } from '@/state/tools';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Shell() {
  const { route } = useRouter();
  const [sideHidden, setSideHidden] = useState(false);

  return (
    <ToolsProvider>
      <div className={sideHidden ? 'app side-hidden' : 'app'}>
        <Topbar sideHidden={sideHidden} onToggleSidebar={() => setSideHidden((v) => !v)} />
        <Sidebar />
        <main className="work">
          {route.name === 'home' ? <Dashboard /> : null}
          {route.name === 'tool' ? <ToolView id={route.id} key={route.id} /> : null}
          {route.name === 'category' ? <ToolList kind="category" key={route.id} /> : null}
          {route.name === 'favorites' ? <ToolList kind="favorites" /> : null}
          {route.name === 'recent' ? <ToolList kind="recent" /> : null}
        </main>
      </div>
    </ToolsProvider>
  );
}

import { useMemo, useState } from 'react';
import { useT } from '@/i18n';
import { useRouter } from '@/state/router';
import { useTools } from '@/state/tools';
import { Icon } from '@/ui';

export function Sidebar() {
  const t = useT();
  const { route, navigate } = useRouter();
  const { engine, favorites, isFav, toggleFav } = useTools();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const cats = engine?.CATS ?? [];
  const activeTool = route.name === 'tool' ? route.id : '';

  const byCat = useMemo(() => {
    const map: Record<string, { id: string; name: string }[]> = {};
    (engine?.tools ?? []).forEach((tool) => {
      (map[tool.cat] ??= []).push({ id: tool.id, name: tool.name });
    });
    return map;
  }, [engine]);

  const link = (
    key: string,
    icon: string,
    label: string,
    active: boolean,
    onClick: () => void,
    count?: number
  ) => (
    <button key={key} className={active ? 'side-link active' : 'side-link'} onClick={onClick}>
      <Icon name={icon} className="ic ic-sm" />
      <span className="trunc grow">{label}</span>
      {count != null ? <span className="dim">{count}</span> : null}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="side-scroll">
        {link('home', 'home', t('nav.dashboard'), route.name === 'home', () => navigate({ name: 'home' }))}
        {link('fav', 'star', t('nav.favorites'), route.name === 'favorites', () => navigate({ name: 'favorites' }), favorites.length)}
        {link('recent', 'clock', t('nav.recent'), route.name === 'recent', () => navigate({ name: 'recent' }))}

        <div style={{ height: 10 }} />

        {cats.map((c) => {
          const list = byCat[c.id] ?? [];
          const isOpen = open[c.id] ?? (route.name === 'tool' && list.some((x) => x.id === activeTool));
          return (
            <div className="side-group" key={c.id}>
              <button
                className={isOpen ? 'side-title open' : 'side-title'}
                onClick={() => setOpen((p) => ({ ...p, [c.id]: !isOpen }))}
                aria-expanded={isOpen}
              >
                <Icon name="chevron-right" className="ic ic-sm chev" />
                <span className="trunc">{c.name}</span>
                <span className="n">{list.length}</span>
              </button>
              {isOpen
                ? list.map((tool) => (
                    <button
                      key={tool.id}
                      className={tool.id === activeTool ? 'side-link active' : 'side-link'}
                      onClick={() => navigate({ name: 'tool', id: tool.id })}
                      style={{ paddingLeft: 24 }}
                    >
                      <span className="trunc grow">{tool.name}</span>
                      <span
                        className={isFav(tool.id) ? 'star on' : 'star'}
                        role="button"
                        tabIndex={-1}
                        title={t(isFav(tool.id) ? 'tool.unfavorite' : 'tool.favorite')}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFav(tool.id);
                        }}
                      >
                        <Icon name="star" className="ic ic-sm" />
                      </span>
                    </button>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

import { useEffect, useRef } from 'react';
import { useT } from '@/i18n';
import { useRouter } from '@/state/router';
import { useTools } from '@/state/tools';
import { Alert, Icon, IconButton, Loading } from '@/ui';

export function ToolView({ id }: { id: string }) {
  const t = useT();
  const { navigate } = useRouter();
  const { engine, failed, isFav, toggleFav, noteUsed } = useTools();
  const hostRef = useRef<HTMLDivElement>(null);

  const tool = engine?.byId[id];
  const cat = engine?.CATS.find((c) => c.id === tool?.cat);

  useEffect(() => {
    const el = hostRef.current;
    if (!engine || !el || !engine.byId[id]) return;
    const unmount = engine.mount(el, id);
    noteUsed(id);
    return unmount;
  }, [engine, id, noteUsed]);

  if (failed) {
    return (
      <div className="page">
        <Alert kind="err">{t('tool.loadFailed')}</Alert>
      </div>
    );
  }
  if (!engine) return <Loading label={t('tool.loading')} />;

  if (!tool) {
    return (
      <div className="page">
        <Alert kind="err">{t('tool.notFound')}</Alert>
      </div>
    );
  }

  const fav = isFav(id);

  return (
    <div className="page">
      <div className="tool-head">
        <div className="ti">
          <Icon name="zap" className="ic ic-lg" />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          {cat ? (
            <button className="lbl" onClick={() => navigate({ name: 'category', id: cat.id })} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
              {cat.name}
            </button>
          ) : null}
          <h1 style={{ fontSize: 19, marginTop: 3 }}>{tool.name}</h1>
          {tool.desc ? <p className="muted" style={{ marginTop: 3, fontSize: 12.5 }}>{tool.desc}</p> : null}
        </div>
        <IconButton
          icon="star"
          title={t(fav ? 'tool.unfavorite' : 'tool.favorite')}
          active={fav}
          onClick={() => toggleFav(id)}
        />
      </div>

      <div className="tool-host" ref={hostRef} />
    </div>
  );
}

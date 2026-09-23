import { useMemo } from 'react';
import { useI18n } from '@/i18n';
import { time } from '@/lib/format';
import { useRouter } from '@/state/router';
import { useSession } from '@/state/session';
import { useTools } from '@/state/tools';
import { Icon, Loading } from '@/ui';
import type { ToolDef } from '@/tools/runtime';

function ToolTile({ tool, sub, onOpen }: { tool: ToolDef; sub?: string; onOpen: () => void }) {
  return (
    <button className="tile" onClick={onOpen}>
      <span className="ti">
        <Icon name="zap" className="ic ic-sm" />
      </span>
      <span className="tt">
        <b className="trunc">{tool.name}</b>
        <span className="trunc">{sub ?? tool.desc ?? ''}</span>
      </span>
    </button>
  );
}

export function Dashboard() {
  const { t, locale } = useI18n();
  const { navigate } = useRouter();
  const { user, session } = useSession();
  const { engine, favorites, usage, recent } = useTools();

  const top = useMemo(() => {
    if (!engine) return [];
    return Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => engine.byId[id])
      .filter((x): x is ToolDef => Boolean(x))
      .slice(0, 8);
  }, [engine, usage]);

  if (!engine) return <Loading />;

  const recentTools = recent.map((id) => engine.byId[id]).filter((x): x is ToolDef => Boolean(x)).slice(0, 8);
  const favTools = favorites.map((id) => engine.byId[id]).filter((x): x is ToolDef => Boolean(x)).slice(0, 8);
  const quick = top.length > 0 ? top : engine.tools.slice(0, 8);

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>{t('dash.welcome', { name: user?.username ?? '' })}</h1>
          <p>{t('dash.subtitle', { tools: engine.tools.length, categories: engine.CATS.length })}</p>
        </div>
        <div className="acts">
          <span className="status-pill">
            <Icon name="shield" className="ic ic-sm" />
            {t(`role.${user?.role ?? 'USER'}`)}
          </span>
          {session ? (
            <span className="status-pill">
              <Icon name="clock" className="ic ic-sm" />
              {t('dash.sessionExpires', { time: time(session.expiresAt, locale) })}
            </span>
          ) : null}
        </div>
      </div>

      <section className="section">
        <h2>{t('dash.quickAccess')}</h2>
        <div className="tiles">
          {quick.map((tool) => (
            <ToolTile key={tool.id} tool={tool} onOpen={() => navigate({ name: 'tool', id: tool.id })} />
          ))}
        </div>
      </section>

      <section className="section">
        <h2>{t('dash.favorites')}</h2>
        {favTools.length === 0 ? (
          <p className="dim" style={{ fontSize: 12.5 }}>{t('dash.noFavorites')}</p>
        ) : (
          <div className="tiles">
            {favTools.map((tool) => (
              <ToolTile key={tool.id} tool={tool} onOpen={() => navigate({ name: 'tool', id: tool.id })} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>{t('dash.recent')}</h2>
        {recentTools.length === 0 ? (
          <p className="dim" style={{ fontSize: 12.5 }}>{t('dash.noRecent')}</p>
        ) : (
          <div className="tiles">
            {recentTools.map((tool) => (
              <ToolTile key={tool.id} tool={tool} onOpen={() => navigate({ name: 'tool', id: tool.id })} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>{t('dash.categories')}</h2>
        <div className="tiles">
          {engine.CATS.map((c) => (
            <button key={c.id} className="tile" onClick={() => navigate({ name: 'category', id: c.id })}>
              <span className="ti">
                <Icon name="layers" className="ic ic-sm" />
              </span>
              <span className="tt">
                <b className="trunc">{c.name}</b>
                <span className="trunc">{c.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Suosikit, viimeisimmät ja kategoriasivu — sama esitys, eri lähde. */
export function ToolList({ kind }: { kind: 'favorites' | 'recent' | 'category' }) {
  const { t } = useI18n();
  const { navigate, route } = useRouter();
  const { engine, favorites, recent } = useTools();
  if (!engine) return <Loading />;

  let list: ToolDef[] = [];
  let heading = '';
  let lead = '';

  if (kind === 'favorites') {
    heading = t('nav.favorites');
    lead = t('dash.noFavorites');
    list = favorites.map((id) => engine.byId[id]).filter((x): x is ToolDef => Boolean(x));
  } else if (kind === 'recent') {
    heading = t('nav.recent');
    lead = t('dash.noRecent');
    list = recent.map((id) => engine.byId[id]).filter((x): x is ToolDef => Boolean(x));
  } else {
    const id = route.name === 'category' ? route.id : '';
    const cat = engine.CATS.find((c) => c.id === id);
    heading = cat?.name ?? t('nav.tools');
    lead = cat?.desc ?? '';
    list = engine.tools.filter((x) => x.cat === id);
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>{heading}</h1>
          <p>{list.length > 0 ? t('common.results', { n: list.length }) : lead}</p>
        </div>
      </div>
      {list.length > 0 ? (
        <div className="tiles">
          {list.map((tool) => (
            <ToolTile key={tool.id} tool={tool} onOpen={() => navigate({ name: 'tool', id: tool.id })} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

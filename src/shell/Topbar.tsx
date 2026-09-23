import { useEffect, useMemo, useRef, useState } from 'react';
import { system } from '@/api';
import type { NotificationRow } from '@/api';
import { useI18n } from '@/i18n';
import { dateTime, initials } from '@/lib/format';
import { useRouter } from '@/state/router';
import { useSession } from '@/state/session';
import { useTools } from '@/state/tools';
import { Icon, IconButton } from '@/ui';

type Menu = 'none' | 'user' | 'notifications';

export function Topbar({ sideHidden, onToggleSidebar }: { sideHidden: boolean; onToggleSidebar: () => void }) {
  const { t, locale } = useI18n();
  const { navigate } = useRouter();
  const { user, isAdmin, signOut } = useSession();
  const { engine } = useTools();

  const [menu, setMenu] = useState<Menu>('none');
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void system.notifications().then(
        (rows) => alive && setNotifications(rows),
        () => undefined
      );
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (menu === 'none') return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setMenu('none');
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  const hits = useMemo(() => {
    if (!engine || query.trim() === '') return [];
    return engine.search(query, 12);
  }, [engine, query]);

  const unread = notifications.filter((n) => !n.read).length;

  const markRead = () => {
    void system.markRead().then(
      () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))),
      () => undefined
    );
  };

  return (
    <header className="topbar" ref={boxRef}>
      <IconButton icon="menu" title={t(sideHidden ? 'nav.expand' : 'nav.collapse')} onClick={onToggleSidebar} />
      <div className="brand">
        <div className="brand-mark">
          <Icon name="layers" />
        </div>
        <div>
          <div className="brand-name">{t('app.name')}</div>
          <div className="brand-sub">{t('app.tagline')}</div>
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 560, margin: '0 auto', position: 'relative' }}>
        <div className="omnibox">
          <Icon name="search" className="ic ic-sm" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('nav.searchPlaceholder')}
            aria-label={t('nav.searchPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
              if (e.key === 'Enter' && hits[0]) {
                navigate({ name: 'tool', id: hits[0].id });
                setQuery('');
              }
            }}
          />
          {query ? <IconButton icon="x" title={t('common.clear')} onClick={() => setQuery('')} /> : null}
        </div>
        {hits.length > 0 ? (
          <div className="menu wide" style={{ top: 38, right: 'auto', left: 0, width: '100%' }}>
            <div className="menu-scroll">
              {hits.map((tool) => (
                <button
                  key={tool.id}
                  className="menu-item"
                  onClick={() => {
                    navigate({ name: 'tool', id: tool.id });
                    setQuery('');
                  }}
                >
                  <Icon name="zap" className="ic ic-sm" />
                  <span className="trunc grow">{tool.name}</span>
                  <span className="dim" style={{ fontSize: 11 }}>{tool.cat}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="topbar-right">
        <span className="status-pill" title={t(online ? 'dash.online' : 'dash.offline')}>
          <Icon name={online ? 'wifi' : 'wifi-off'} className="ic ic-sm" />
          {t(online ? 'dash.online' : 'dash.offline')}
        </span>

        <span className="notif-btn">
          <IconButton
            icon="bell"
            title={t('nav.notifications')}
            active={menu === 'notifications'}
            onClick={() => setMenu(menu === 'notifications' ? 'none' : 'notifications')}
          />
          {unread > 0 ? <span className="cnt">{unread}</span> : null}
        </span>

        <button className="user-btn" onClick={() => setMenu(menu === 'user' ? 'none' : 'user')}>
          <span className="avatar">{initials(user?.username ?? '')}</span>
          <span className="un trunc">{user?.username}</span>
          <Icon name="chevron-down" className="ic ic-sm dim" />
        </button>
      </div>

      {menu === 'notifications' ? (
        <div className="menu wide" style={{ right: 60 }}>
          <div className="menu-scroll">
            {notifications.length === 0 ? (
              <div className="notif-item dim">{t('nav.noNotifications')}</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={n.read ? 'notif-item' : 'notif-item unread'}>
                  <span className="nt">{n.title}</span>
                  {n.body ? <span className="nb">{n.body}</span> : null}
                  <span className="ntime">{dateTime(n.ts, locale)}</span>
                </div>
              ))
            )}
          </div>
          {unread > 0 ? (
            <>
              <div className="menu-sep" />
              <button className="menu-item" onClick={markRead}>
                <Icon name="check" className="ic ic-sm" />
                {t('nav.markAllRead')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {menu === 'user' ? (
        <div className="menu">
          <div className="menu-head">
            <span className="avatar">{initials(user?.username ?? '')}</span>
            <div className="txt trunc">
              <div className="n trunc">{user?.username}</div>
              <div className="e trunc">{user?.email}</div>
            </div>
          </div>
          <button
            className="menu-item"
            onClick={() => {
              navigate({ name: 'account' });
              setMenu('none');
            }}
          >
            <Icon name="user" className="ic ic-sm" />
            {t('nav.account')}
          </button>
          <button
            className="menu-item"
            onClick={() => {
              navigate({ name: 'settings' });
              setMenu('none');
            }}
          >
            <Icon name="settings" className="ic ic-sm" />
            {t('nav.settings')}
          </button>
          {isAdmin ? (
            <button
              className="menu-item"
              onClick={() => {
                navigate({ name: 'admin', tab: 'overview' });
                setMenu('none');
              }}
            >
              <Icon name="shield" className="ic ic-sm" />
              {t('nav.admin')}
            </button>
          ) : null}
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => void system.minimizeToTray()}>
            <Icon name="minimize" className="ic ic-sm" />
            {t('nav.minimize')}
          </button>
          <button className="menu-item danger" onClick={() => void signOut()}>
            <Icon name="logout" className="ic ic-sm" />
            {t('auth.logout')}
          </button>
        </div>
      ) : null}
    </header>
  );
}

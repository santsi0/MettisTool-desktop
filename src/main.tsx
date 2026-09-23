import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n';
import { RouterProvider } from './state/router';
import { SessionProvider } from './state/session';
import { ToastProvider } from './state/toast';
import { restoreTheme } from './state/theme';
import './styles/app.css';
import './styles/tools.css';

restoreTheme();

// Selaimen oma valikko ja vedä-ja-pudota eivät kuulu työpöytäsovellukseen.
document.addEventListener('contextmenu', (e) => {
  const el = e.target as HTMLElement;
  if (!el.closest('input, textarea, [contenteditable="true"], .ed-out')) e.preventDefault();
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  if (!(e.target as HTMLElement)?.closest('.ed')) e.preventDefault();
});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <ToastProvider>
          <RouterProvider>
            <SessionProvider>
              <App />
            </SessionProvider>
          </RouterProvider>
        </ToastProvider>
      </I18nProvider>
    </StrictMode>
  );
}

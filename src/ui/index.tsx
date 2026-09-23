/** Pienet käyttöliittymäpalikat. Ei ulkoisia komponenttikirjastoja. */
import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';
import { useT } from '@/i18n';

export { Icon, GoogleMark } from './Icon';

/* ---------- Kentät ---------- */

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  return (
    <div className={className ? `field ${className}` : 'field'}>
      {label ? <label>{label}</label> : null}
      {children}
      {error ? <span className="err-txt">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ invalid, className, ...rest }: InputProps) {
  return <input {...rest} className={`input${invalid ? ' invalid' : ''}${className ? ` ${className}` : ''}`} />;
}

export function PasswordInput(props: InputProps) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <Input {...props} type={show ? 'text' : 'password'} />
      <button
        type="button"
        className="icon-btn"
        onClick={() => setShow((v) => !v)}
        title={show ? t('common.hide') : t('common.show')}
        aria-label={show ? t('common.hide') : t('common.show')}
        tabIndex={-1}
      >
        <Icon name={show ? 'eye-off' : 'eye'} className="ic ic-sm" />
      </button>
    </div>
  );
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Select<T extends string>({ value, onChange, options, disabled, id, className }: SelectProps<T>) {
  return (
    <select
      id={id}
      className={className ? `select ${className}` : 'select'}
      value={value}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({
  checked, onChange, label, disabled
}: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Switch({
  checked, onChange, disabled, label
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <span className="switch">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </span>
  );
}

export function ToggleRow({
  title, desc, checked, onChange, disabled
}: { title: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="toggle-row">
      <div className="tr-txt">
        <strong>{title}</strong>
        {desc ? <span>{desc}</span> : null}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

/* ---------- Ilmoitukset ---------- */

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'err' | 'ok' | 'warn'; children: ReactNode }) {
  const icon = kind === 'err' ? 'alert-circle' : kind === 'ok' ? 'check_circle' : kind === 'warn' ? 'alert-triangle' : 'info';
  return (
    <div className={kind === 'info' ? 'alert' : `alert ${kind}`} role={kind === 'err' ? 'alert' : undefined}>
      <Icon name={icon} className="ic ic-sm" />
      <span>{children}</span>
    </div>
  );
}

export function Badge({ kind, children }: { kind?: 'ok' | 'warn' | 'err' | 'acc'; children: ReactNode }) {
  return <span className={kind ? `badge ${kind}` : 'badge'}>{children}</span>;
}

export function Spinner({ large }: { large?: boolean }) {
  return <span className={large ? 'spinner lg' : 'spinner'} aria-hidden="true" />;
}

export function Loading({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="center-fill">
      <Spinner large />
      <span>{label ?? t('app.loading')}</span>
    </div>
  );
}

/* ---------- Painikkeet ---------- */

interface BtnProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  busy?: boolean;
  disabled?: boolean;
  block?: boolean;
  icon?: string;
  title?: string;
}

export function Button({
  children, onClick, type = 'button', variant = 'default', size = 'md',
  busy, disabled, block, icon, title
}: BtnProps) {
  const cls = ['btn'];
  if (variant !== 'default') cls.push(variant);
  if (size !== 'md') cls.push(size);
  if (block) cls.push('block');
  return (
    <button type={type} className={cls.join(' ')} onClick={onClick} disabled={disabled || busy} title={title}>
      {busy ? <Spinner /> : icon ? <Icon name={icon} className="ic ic-sm" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon, onClick, title, active, disabled, type = 'button'
}: { icon: string; onClick?: () => void; title: string; active?: boolean; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      className={active ? 'icon-btn on' : 'icon-btn'}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
    >
      <Icon name={icon} className="ic ic-sm" />
    </button>
  );
}

/* ---------- Modaali ---------- */

export function Modal({
  title, onClose, children, footer, wide
}: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-h">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="x" onClick={onClose} title={t('common.close')} />
        </div>
        {children}
        {footer ? <div className="modal-f">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmModal({
  title, message, confirmLabel, danger, busy, onConfirm, onClose
}: {
  title: string; message: string; confirmLabel?: string; danger?: boolean;
  busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const t = useT();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="modal-b">
        <p className="muted" style={{ lineHeight: 1.55 }}>{message}</p>
      </div>
    </Modal>
  );
}

/* ---------- Muut ---------- */

export function Pager({
  offset, limit, total, onChange
}: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  const t = useT();
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <Button size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        {t('common.prev')}
      </Button>
      <span>{t('common.page', { n: `${page} ${t('common.of')} ${pages}` })}</span>
      <Button size="sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>
        {t('common.next')}
      </Button>
      <span className="right">{t('common.results', { n: total })}</span>
    </div>
  );
}

export function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={submit} style={{ display: 'contents' }}>
      {children}
    </form>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 1400);
    });
  };

  return (
    <Button size="sm" icon={done ? 'check' : 'copy'} onClick={copy}>
      {done ? t('common.copied') : (label ?? t('common.copy'))}
    </Button>
  );
}

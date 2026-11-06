import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { config } from '../config';

export function Shell({ title, back, children }: { title: string; back?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-10">
      <header className="flex items-center gap-3 py-5">
        {back}
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      </header>
      <main className="flex flex-1 flex-col gap-5">{children}</main>
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  busy?: boolean;
};

export function Button({ variant = 'primary', busy, children, className = '', disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: 'bg-indigo text-white active:bg-indigo-deep',
    secondary: 'bg-wash text-indigo active:bg-indigo/15',
    danger: 'bg-white text-danger ring-1 ring-danger/40',
    quiet: 'text-indigo underline underline-offset-4',
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`min-h-12 rounded-xl px-5 text-base font-semibold disabled:opacity-50 ${styles} ${className}`}
    >
      {busy ? 'Working…' : children}
    </button>
  );
}

export const fmtSats = (n: number) => `${n.toLocaleString('en-NG')} sats`;
export const fmtNaira = (n: number) =>
  `₦${Math.round(n * config.ngnPerSat).toLocaleString('en-NG')}`;

export function Sats({ value, big }: { value: number; big?: boolean }) {
  return (
    <span className="num">
      <span className={big ? 'font-display text-5xl font-bold' : 'font-semibold'}>{value.toLocaleString('en-NG')}</span>
      <span className={big ? 'ml-2 text-lg' : 'ml-1'}>sats</span>
      <span className={`block ${big ? 'text-base' : 'text-sm'} opacity-75`}>≈ {fmtNaira(value)}</span>
    </span>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'good'; children: ReactNode }) {
  const styles = {
    info: 'bg-wash text-ink',
    error: 'bg-danger/10 text-danger',
    good: 'bg-palm/10 text-palm',
  }[tone];
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${styles}`}>{children}</p>;
}

export function Countdown({ to, now }: { to: number; now: number }) {
  const s = Math.max(0, Math.round(to - now));
  return <span className="num">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}

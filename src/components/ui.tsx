'use client';

/** Small, shared presentational primitives for the control overlay. */

import { ReactNode } from 'react';

export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`pointer-events-auto rounded-xl border border-white/10 bg-panel p-3.5 shadow-2xl backdrop-blur-md ${className}`}
    >
      {title && (
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block select-none">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-white/70">{label}</span>
        <span className="font-mono text-xs tabular-nums text-accent">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5"
      />
      {hint && <p className="mt-1 text-[10px] leading-snug text-white/35">{hint}</p>}
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-accent/20 text-accent'
              : 'text-white/55 hover:bg-white/5 hover:text-white/80'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div
        className={`mt-0.5 font-mono text-base tabular-nums ${accent ? 'text-accent' : 'text-white/90'}`}
      >
        {value}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between py-0.5 text-left"
    >
      <span className="text-xs text-white/70">{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${
          value ? 'bg-accent/50' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
            value ? 'left-[14px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary';
  className?: string;
}) {
  const styles =
    variant === 'primary'
      ? 'bg-accent/20 text-accent hover:bg-accent/30 border-accent/30'
      : 'bg-white/5 text-white/75 hover:bg-white/10 border-white/10';
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

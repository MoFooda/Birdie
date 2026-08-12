/**
 * UI primitives.
 *
 * A small shadcn-style set built directly on the design tokens in `globals.css`, so the
 * whole app re-themes from one file. Kept deliberately minimal — this is an internal
 * tool, and the interesting complexity belongs in the analysis, not the component layer.
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-fg hover:bg-brand-strong',
        secondary: 'border bg-surface text-fg hover:bg-surface-2',
        ghost: 'text-fg hover:bg-surface-2',
        danger: 'bg-danger text-white hover:opacity-90',
        accent: 'bg-accent text-accent-fg hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-bold', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const badgeVariants = cva('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'bg-surface-2 text-muted',
      brand: 'bg-brand-soft text-brand',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      info: 'bg-info-soft text-info',
      accent: 'bg-accent-soft text-accent',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4', className)}>
      <label className="label">{label}</label>
      {children}
      {hint && !error && <p className="hint mt-1">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('input', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn('input min-h-24 resize-y', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn('input', className)} {...props}>
        {children}
      </select>
    );
  },
);

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function Progress({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-sm bg-surface-2', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <div className="mt-1 max-w-3xl text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Labels how a claim was established. The product's core promise is that a reviewer can
 * always tell a measurement from an interpretation, so this chip appears next to every
 * finding, score item and competitor signal.
 */
export function SourceChip({ source }: { source: string }) {
  const map: Record<string, { label: string; tone: BadgeProps['tone'] }> = {
    http_check: { label: 'Measured · HTTP', tone: 'info' },
    dom_parse: { label: 'Measured · page source', tone: 'info' },
    pagespeed: { label: 'Measured · PageSpeed', tone: 'info' },
    screenshot: { label: 'Observed · screenshot', tone: 'info' },
    ai_interpretation: { label: 'AI interpretation', tone: 'accent' },
    human: { label: 'Human / playbook', tone: 'brand' },
    fixture: { label: 'Demo fixture', tone: 'warning' },
  };
  const entry = map[source] ?? { label: source, tone: 'neutral' as const };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

export function ScoreDial({
  value,
  label,
  caption,
  tone = 'brand',
}: {
  value: number | null;
  label: string;
  caption?: string;
  tone?: 'brand' | 'accent' | 'warning';
}) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'warning' ? 'text-warning' : 'text-brand';
  return (
    <div className="rounded-lg border bg-surface-2/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('mt-1 text-3xl font-extrabold tabular-nums', color)}>
        {value == null ? <span className="text-lg font-bold text-muted">not measured</span> : value}
      </p>
      {caption && <p className="mt-1 text-xs text-muted">{caption}</p>}
    </div>
  );
}

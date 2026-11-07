import Link from "next/link";
import { AlertCircle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { PRIORITY_LABEL, STATUS_LABEL } from "./tasks";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size }: { name: string; size?: "sm" | "lg" }) {
  return <span className={`avatar${size ? ` ${size}` : ""}`} aria-hidden="true">{initials(name)}</span>;
}

export function Person({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="person">
      <Avatar name={name} size="sm" />
      <span>{name}{sub && <span className="sub-line">{sub}</span>}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge st-${status.toLowerCase()}`}>{STATUS_LABEL[status] ?? status}</span>;
}
export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`badge pr-${priority.toLowerCase()}`}>{PRIORITY_LABEL[priority] ?? priority}</span>;
}

export type Crumb = { label: string; href?: string };

export function PageHeader({
  title, description, crumbs, actions, children,
}: { title: string; description?: string; crumbs?: Crumb[]; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="crumbs">
            {crumbs.map((c, i) => (
              <li key={c.label}>
                {c.href && i < crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {description && <p className="sub">{description}</p>}
          {children}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </>
  );
}

export function EmptyState({
  icon: Icon, title, children, action,
}: { icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <span className="ico"><Icon className="ic" aria-hidden="true" /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Alert({ kind, children }: { kind: "err" | "ok" | "info"; children: React.ReactNode }) {
  const Icon = kind === "err" ? AlertCircle : kind === "ok" ? CheckCircle2 : Info;
  return (
    <div className={`alert ${kind}`} role={kind === "err" ? "alert" : "status"}>
      <Icon className="ic" aria-hidden="true" /><span>{children}</span>
    </div>
  );
}

export function Field({
  id, label, required, hint, children,
}: { id: string; label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}</label>
      {children}
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
}

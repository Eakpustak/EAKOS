"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, Briefcase, ListChecks, FileText, Receipt, FileSpreadsheet, RefreshCw, Server, ShoppingCart, LifeBuoy, Store, CalendarCheck, CalendarDays, HeartHandshake, ClipboardList, FolderKanban, Handshake, LayoutDashboard, Megaphone, Menu, Settings, Users, UserCog, X } from "lucide-react";

const ICONS = { work: LayoutDashboard, tasks: ClipboardList, handovers: Handshake, hub: Megaphone, leads: Briefcase, projects: FolderKanban, holidays: CalendarCheck, hr: HeartHandshake, leave: CalendarDays, bell: Bell, people: Users, admin: UserCog, settings: Settings, pipeline: BarChart3, checklists: ListChecks, documents: FileText, expenses: Receipt, purchases: ShoppingCart, service: LifeBuoy, vendors: Store, invoices: FileSpreadsheet, renewals: RefreshCw, assets: Server } as const;
export type NavIcon = keyof typeof ICONS;

export function NavItem({ href, label, icon, count, countLabel = "unread" }: { href: string; label: string; icon: NavIcon; count?: number; countLabel?: string }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  const Icon = ICONS[icon];
  return (
    <Link href={href} aria-current={active ? "page" : undefined}>
      <Icon className="ic" aria-hidden="true" />
      {label}
      {count ? <span className="count" aria-label={`${count} ${countLabel}`}>{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}

/** Desktop: sidebar is always visible. Mobile: a drawer toggled from the top bar. */
export function ShellFrame({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="app" data-nav={open ? "open" : "closed"}>
      <a className="skip-link" href="#main">Skip to content</a>
      <div id="sidebar" className="sidebar">{sidebar}</div>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="content-col">
        <div className="mobilebar">
          <span className="brand"><span className="brand-mark" aria-hidden="true">EP</span><span className="brand-name">EAK PUSTAK</span></span>
          <button ref={toggle} type="button" className="quiet icon" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen((v) => !v)}>
            {open ? <X className="ic" aria-hidden="true" /> : <Menu className="ic" aria-hidden="true" />}
          </button>
        </div>
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

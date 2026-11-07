import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { EmptyState, Field, PageHeader } from "@/lib/ui";
import { fmtDate, todayStr } from "@/lib/tasks";
import { MAX_HOLIDAY_NAME, canManageHolidays, untilLabel } from "@/lib/holidays";
import { addHoliday, removeHoliday } from "./actions";

export const dynamic = "force-dynamic";

export default async function Holidays({ searchParams }: { searchParams: { year?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  const today = todayStr();
  const thisYear = Number(today.slice(0, 4));
  const y = Number(searchParams.year);
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : thisYear;
  const manage = canManageHolidays(user);
  const rows = await db.holiday.findMany({
    where: { date: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lt: new Date(`${year + 1}-01-01T00:00:00.000Z`) } },
    orderBy: { date: "asc" },
  });
  const weekday = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(d);

  return (
    <Shell>
      <PageHeader title="Company holidays" description="Days the company is closed. Informational: leave requests are still counted in calendar days." />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <nav aria-label="Year" className="btn-row" style={{ marginBottom: "1rem" }}>
        <Link className="btn ghost" href={`/holidays?year=${year - 1}`}>← {year - 1}</Link>
        <span className="badge plain" aria-current="page">{year}</span>
        <Link className="btn ghost" href={`/holidays?year=${year + 1}`}>{year + 1} →</Link>
      </nav>
      {rows.length === 0 ? (
        <div className="table-wrap"><EmptyState icon={CalendarDays} title={`No holidays set for ${year}`}>{manage ? "Add the first one below." : "The HR head has not added any yet."}</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <div className="table-scroll">
            <table className="responsive">
              <thead><tr><th>Date</th><th>Day</th><th>Holiday</th>{manage && <th><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {rows.map((h) => {
                  const ds = h.date.toISOString().slice(0, 10);
                  return (
                    <tr key={h.id}>
                      <td className="primary num">{fmtDate(h.date)}{ds >= today && <span className="sub-line muted">{untilLabel(ds, today)}</span>}</td>
                      <td data-label="Day">{weekday(h.date)}</td>
                      <td data-label="Holiday">{h.name}</td>
                      {manage && (
                        <td>
                          <form action={removeHoliday}>
                            <input type="hidden" name="id" value={h.id} />
                            <button type="submit" className="quiet danger-text" aria-label={`Remove ${h.name}`}>Remove</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {manage && (
        <form action={addHoliday} className="panel form-narrow" style={{ marginTop: "1.5rem" }}>
          <div className="form-grid">
            <Field id="h-date" label="Date" required><input id="h-date" name="date" type="date" required defaultValue={`${year}-01-01`} /></Field>
            <Field id="h-name" label="Holiday" required><input id="h-name" name="name" maxLength={MAX_HOLIDAY_NAME} required /></Field>
          </div>
          <div className="btn-row"><button type="submit">Add holiday</button></div>
        </form>
      )}
    </Shell>
  );
}

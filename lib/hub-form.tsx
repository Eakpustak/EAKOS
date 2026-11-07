"use client";
import { useState } from "react";
import Link from "next/link";
import { saveContent, type SaveResult } from "@/app/hub/actions";
import { Alert, Field } from "./ui";
import { MAX_BODY, MAX_TITLE, TYPE_LABEL } from "./hub";

export type HubFormProps = {
  contentId?: string;
  version?: number;
  clientToken: string;
  initial: { type: string; title: string; body: string; resourceUrl: string; scope: string; departmentIds: string[] };
  /** Only audiences the signed-in user could publish to themselves. */
  allowed: { companyWide: boolean; departments: { id: string; name: string }[] };
  cancelHref: string;
};

/**
 * Client form so a validation error keeps everything the user typed (RULES 4). The server action
 * returns { error } on failure and redirects on success; there is no optimistic success state.
 */
export default function HubForm({ contentId, version, clientToken, initial, allowed, cancelHref }: HubFormProps) {
  const editing = !!contentId;
  const [type, setType] = useState(initial.type);
  const [scope, setScope] = useState(
    initial.scope === "ALL" && allowed.companyWide ? "ALL"
      : initial.scope === "DEPARTMENTS" && allowed.departments.length ? "DEPARTMENTS"
      : allowed.companyWide ? "ALL" : "DEPARTMENTS",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res: SaveResult = await saveContent(fd); // redirects on success
      if (res?.error) setError(res.error);
    } catch {
      // A redirect from the action is handled by Next; anything else is a real failure.
      setError("It could not be saved. Nothing was changed; check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel form-narrow" noValidate={false}>
      {error && <Alert kind="err">{error}</Alert>}
      <input type="hidden" name="clientToken" value={clientToken} />
      {contentId && <input type="hidden" name="contentId" value={contentId} />}
      {version !== undefined && <input type="hidden" name="version" value={version} />}
      <div className="form-grid">
        <Field id="type" label="Type" required>
          {editing ? (
            <>
              <input type="hidden" name="type" value={type} />
              <input id="type" value={TYPE_LABEL[type]} disabled readOnly />
            </>
          ) : (
            <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} required>
              <option value="ANNOUNCEMENT">{TYPE_LABEL.ANNOUNCEMENT}</option>
              <option value="POLICY">{TYPE_LABEL.POLICY}</option>
              <option value="RESOURCE">{TYPE_LABEL.RESOURCE}</option>
            </select>
          )}
        </Field>
        <div className="full"><Field id="title" label="Title" required>
          <input id="title" name="title" defaultValue={initial.title} maxLength={MAX_TITLE} required />
        </Field></div>
        {type === "RESOURCE" && (
          <div className="full"><Field id="resourceUrl" label="Link" required hint="A full web address starting with http:// or https://. Do not put passwords or secrets in it.">
            <input id="resourceUrl" name="resourceUrl" type="url" defaultValue={initial.resourceUrl} maxLength={2000} required placeholder="https://" />
          </Field></div>
        )}
        <div className="full"><Field
          id="body"
          label={type === "RESOURCE" ? "Description" : "Content"}
          required={type !== "RESOURCE"}
          hint="Plain text. Leave a blank line between paragraphs. Formatting characters are shown as typed."
        >
          <textarea id="body" name="body" defaultValue={initial.body} rows={type === "RESOURCE" ? 4 : 14} maxLength={MAX_BODY} required={type !== "RESOURCE"} />
        </Field></div>
        <fieldset className="full audience">
          <legend>Who can see this once it is published</legend>
          {allowed.companyWide && (
            <label className="choice"><input type="radio" name="scope" value="ALL" checked={scope === "ALL"} onChange={() => setScope("ALL")} /> Everyone in the company</label>
          )}
          {allowed.departments.length > 0 && (
            <label className="choice"><input type="radio" name="scope" value="DEPARTMENTS" checked={scope === "DEPARTMENTS"} onChange={() => setScope("DEPARTMENTS")} /> Only selected departments</label>
          )}
          {scope === "DEPARTMENTS" && (
            <div className="choice-list" role="group" aria-label="Departments">
              {allowed.departments.map((d) => (
                <label key={d.id} className="choice">
                  <input type="checkbox" name="departmentIds" value={d.id} defaultChecked={initial.departmentIds.includes(d.id)} /> {d.name}
                </label>
              ))}
            </div>
          )}
          <span className="hint">You can only choose audiences you are allowed to publish to.</span>
        </fieldset>
      </div>
      <div className="btn-row">
        <button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Save draft"}</button>
        <Link className="btn ghost" href={cancelHref}>Cancel</Link>
      </div>
      <p className="hint" style={{ marginTop: "1rem" }}>
        {editing ? "Saving keeps the previous version in the history." : "A draft is visible only to you and the people who can publish it."}
      </p>
    </form>
  );
}

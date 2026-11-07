"use client";
import { useId, useRef } from "react";

/** Submit button that asks for confirmation in a dialog before the surrounding form posts. */
export function ConfirmSubmit({
  label, title, message, confirmLabel, danger,
}: { label: string; title: string; message: string; confirmLabel: string; danger?: boolean }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button type="button" className={`quiet sm${danger ? " danger-text" : ""}`} onClick={() => dlg.current?.showModal()}>{label}</button>
      <dialog ref={dlg} aria-labelledby={`${id}-t`} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
        <div className="dlg-body"><h2 id={`${id}-t`}>{title}</h2><p>{message}</p></div>
        <div className="dlg-foot">
          <button type="button" className="quiet" autoFocus onClick={() => dlg.current?.close()}>Cancel</button>
          <button type="submit" className={danger ? "danger" : ""}>{confirmLabel}</button>
        </div>
      </dialog>
    </>
  );
}

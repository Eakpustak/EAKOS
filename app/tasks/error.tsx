"use client";
import { AlertTriangle } from "lucide-react";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ maxWidth: "32rem" }}>
      <div className="empty-state">
        <span className="ico"><AlertTriangle className="ic" aria-hidden="true" /></span>
        <h3>Something went wrong</h3>
        <p role="alert">This page could not be loaded. Nothing has been changed.</p>
        <button onClick={reset}>Try again</button>
      </div>
    </main>
  );
}

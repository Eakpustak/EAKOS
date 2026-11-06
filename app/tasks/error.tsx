"use client";
export default function TaskError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p className="err" role="alert">The tasks could not be loaded. Nothing has been changed.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}

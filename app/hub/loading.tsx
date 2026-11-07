export default function Loading() {
  return (
    <div className="app" aria-busy="true">
      <div className="sidebar" aria-hidden="true" />
      <div className="content-col">
        <main role="status" aria-label="Loading">
          <div className="skeleton" style={{ height: "2rem", width: "14rem", marginBottom: "1.5rem" }} />
          <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: "6rem" }} />)}</div>
          <div className="skeleton" style={{ height: "14rem", marginTop: "2rem" }} />
          <span className="sr-only">Loading…</span>
        </main>
      </div>
    </div>
  );
}

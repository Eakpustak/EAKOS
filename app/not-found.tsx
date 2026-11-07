import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main style={{ maxWidth: "32rem" }}>
      <div className="empty-state">
        <span className="ico"><FileQuestion className="ic" aria-hidden="true" /></span>
        <h3>Page not found</h3>
        <p>The page does not exist, or you do not have access to it.</p>
        <Link className="btn" href="/">Back to My work</Link>
      </div>
    </main>
  );
}

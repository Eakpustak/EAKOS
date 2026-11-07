import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "EAK PUSTAK Workspace", template: "%s · EAK PUSTAK" }, description: "Company workspace for tasks and coordination." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

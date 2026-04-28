import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mumzgift — AI Gift Finder",
  description: "Find the perfect baby gift with AI — in English and Arabic",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-purple-50">{children}</body>
    </html>
  );
}

/**
 * CareerPilot — Root Layout
 * ===========================
 * App-wide layout with persistent sidebar, light theme, and Google Fonts.
 * Uses Next.js App Router layout pattern.
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AppShell from "@/components/layout/app-shell";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CareerPilot — AI Career Co-Pilot",
  description:
    "Your AI-powered career co-pilot. RAG-grounded job search, fit scoring, cover letters, and application tracking — all powered by your CV.",
  keywords: ["career", "AI", "job search", "resume", "co-pilot", "RAG"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased`}
        suppressHydrationWarning
      >
        <AppShell>{children}</AppShell>
        <Analytics />
      </body>
    </html>
  );
}

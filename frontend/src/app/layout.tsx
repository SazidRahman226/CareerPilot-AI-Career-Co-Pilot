/**
 * CareerPilot — Root Layout
 * ===========================
 * App-wide layout with persistent sidebar, dark theme, and Google Fonts.
 * Uses Next.js App Router layout pattern.
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Sidebar from "@/components/layout/sidebar";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

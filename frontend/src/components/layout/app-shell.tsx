/**
 * CareerPilot — App Shell (Client Wrapper)
 * ==========================================
 * Client component that wraps the app layout with providers.
 * Needed because the root layout is a server component (exports metadata).
 * Includes AuthProvider for JWT authentication.
 */

"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { CvStatusProvider } from "@/contexts/cv-status-context";
import Sidebar from "@/components/layout/sidebar";

function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();

  // Login page — no sidebar, no auth guard
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Loading state — show minimal loading screen
  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__spinner" />
        <p>Loading CareerPilot...</p>
      </div>
    );
  }

  // Not authenticated — AuthContext will redirect, show nothing
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated — show full layout with sidebar
  return (
    <CvStatusProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
    </CvStatusProvider>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </AuthProvider>
  );
}

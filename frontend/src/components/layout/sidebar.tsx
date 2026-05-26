/**
 * CareerPilot — Sidebar Navigation
 * ====================================
 * Premium sidebar with glassmorphism, gradient highlights, and CV status.
 * Persistent across all pages via the root layout.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { getCVStatus } from "@/lib/api";

// Navigation items with icons (using Unicode for zero-dependency icons)
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "📊", description: "Overview & stats" },
  { href: "/chat", label: "AI Assistant", icon: "🤖", description: "Chat with your co-pilot" },
  { href: "/jobs", label: "Job Hunter", icon: "🔍", description: "Find matching jobs" },
  { href: "/tracker", label: "Tracker", icon: "📋", description: "Application Kanban" },
  { href: "/profile", label: "Profile", icon: "👤", description: "CV & settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [cvUploaded, setCvUploaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Check CV status on mount
  useEffect(() => {
    getCVStatus()
      .then((status) => setCvUploaded(status.uploaded))
      .catch(() => setCvUploaded(false));
  }, []);

  return (
    <aside
      className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}
    >
      {/* --- Logo & Brand --- */}
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <span className="sidebar__logo-icon">🚀</span>
          {!collapsed && (
            <div className="sidebar__logo-text">
              <h1>CareerPilot</h1>
              <span>AI Career Co-Pilot</span>
            </div>
          )}
        </div>
        <button
          className="sidebar__toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* --- Navigation --- */}
      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar__link ${isActive ? "sidebar__link--active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar__link-icon">{item.icon}</span>
              {!collapsed && (
                <div className="sidebar__link-text">
                  <span className="sidebar__link-label">{item.label}</span>
                  <span className="sidebar__link-desc">{item.description}</span>
                </div>
              )}
              {isActive && <div className="sidebar__link-indicator" />}
            </Link>
          );
        })}
      </nav>

      {/* --- CV Status --- */}
      {!collapsed && (
        <div className="sidebar__footer">
          <div className={`sidebar__cv-status ${cvUploaded ? "sidebar__cv-status--uploaded" : ""}`}>
            <div className={`sidebar__cv-dot ${cvUploaded ? "sidebar__cv-dot--active" : ""}`} />
            <span>{cvUploaded ? "CV Uploaded" : "No CV Uploaded"}</span>
          </div>
          <div className="sidebar__version">v1.0.0 — Hackathon Edition</div>
        </div>
      )}
    </aside>
  );
}

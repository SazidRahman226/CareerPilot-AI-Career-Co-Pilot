/**
 * CareerPilot — Sidebar Navigation
 * ====================================
 * Professional sidebar with clean design, SVG icons, CV status,
 * user info, and logout. Persistent across all pages via the root layout.
 * Uses shared CvStatusContext for real-time CV status updates.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCvStatus } from "@/contexts/cv-status-context";
import { useAuth } from "@/contexts/auth-context";
import {
  LayoutDashboard,
  MessageSquare,
  Search,
  Kanban,
  FileText,
  User,
  Compass,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

// Navigation items with Lucide icons
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, description: "Overview & stats" },
  { href: "/chat", label: "AI Assistant", icon: MessageSquare, description: "Chat with your co-pilot" },
  { href: "/jobs", label: "Job Hunter", icon: Search, description: "Find matching jobs" },
  { href: "/tracker", label: "Tracker", icon: Kanban, description: "Application Kanban" },
  { href: "/cv-builder", label: "CV Builder", icon: FileText, description: "Build & export CV" },
  { href: "/profile", label: "Profile", icon: User, description: "CV & settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { cvStatus } = useCvStatus();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}
    >
      {/* --- Logo & Brand --- */}
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <span className="sidebar__logo-icon">
            <Compass size={20} />
          </span>
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
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* --- Navigation --- */}
      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar__link ${isActive ? "sidebar__link--active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar__link-icon">
                <Icon size={18} />
              </span>
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

      {/* --- Footer: User Info + CV Status --- */}
      {!collapsed && (
        <div className="sidebar__footer">
          {/* User Profile */}
          {user && (
            <div className="sidebar__user">
              <div className="sidebar__user-avatar">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="sidebar__user-info">
                <span className="sidebar__user-name">{user.name}</span>
                <span className="sidebar__user-email">{user.email}</span>
              </div>
              <button
                className="sidebar__logout"
                onClick={logout}
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}

          {/* CV Status */}
          <div className={`sidebar__cv-status ${cvStatus.uploaded ? "sidebar__cv-status--uploaded" : ""}`}>
            <div className={`sidebar__cv-dot ${cvStatus.uploaded ? "sidebar__cv-dot--active" : ""}`} />
            <span>{cvStatus.uploaded ? "CV Uploaded" : "No CV Uploaded"}</span>
          </div>
          <div className="sidebar__version">v2.0.0 — With Auth</div>
        </div>
      )}
    </aside>
  );
}

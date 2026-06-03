/**
 * CareerPilot — Dashboard Page
 * ===============================
 * Main dashboard with stats cards, quick actions, and activity feed.
 * This is the landing page after login.
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getDashboardStats, type DashboardStats } from "@/lib/api";
import {
  Send,
  CheckCircle,
  Mic,
  Target,
  Upload,
  Search,
  MessageSquare,
  Kanban,
  FileText,
  SearchIcon,
  Mail,
  MessageCircle,
  CheckSquare,
  Pin,
  Lightbulb,
} from "lucide-react";

// Stat card configurations with Lucide icons
const STAT_CONFIGS = [
  { key: "total_applications", label: "Total Applications", icon: Send, format: (v: number) => v.toString() },
  { key: "applied_count", label: "Applied", icon: CheckCircle, format: (v: number) => v.toString() },
  { key: "interviewing_count", label: "Interviewing", icon: Mic, format: (v: number) => v.toString() },
  { key: "avg_fit_score", label: "Avg Fit Score", icon: Target, format: (v: number) => `${v}%` },
];

const QUICK_ACTIONS = [
  { href: "/profile", icon: Upload, text: "Upload CV", desc: "Start with your resume" },
  { href: "/jobs", icon: Search, text: "Search Jobs", desc: "Find matching roles" },
  { href: "/chat", icon: MessageSquare, text: "Ask AI", desc: "Get career advice" },
  { href: "/tracker", icon: Kanban, text: "Track Apps", desc: "Manage applications" },
];

function getActivityIcon(type: string) {
  switch (type) {
    case "cv_upload": return <FileText size={14} />;
    case "job_search": return <SearchIcon size={14} />;
    case "application": return <Mail size={14} />;
    case "chat": return <MessageCircle size={14} />;
    case "todo": return <CheckSquare size={14} />;
    default: return <Pin size={14} />;
  }
}

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-header__title">Dashboard</h1>
        <p className="page-header__subtitle">
          Welcome back! Here&apos;s your career progress at a glance.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        {STAT_CONFIGS.map((config) => {
          const Icon = config.icon;
          return (
            <div key={config.key} className="stat-card">
              <div className="stat-card__icon"><Icon size={22} /></div>
              <div className="stat-card__value">
                {loading ? (
                  <div className="skeleton" style={{ width: 60, height: 32 }} />
                ) : (
                  config.format((stats as any)?.[config.key] ?? 0)
                )}
              </div>
              <div className="stat-card__label">{config.label}</div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>
          Quick Actions
        </h2>
        <div className="quick-actions">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href} className="quick-action">
                <div className="quick-action__icon"><Icon size={20} /></div>
                <div>
                  <div className="quick-action__text">{action.text}</div>
                  <div className="quick-action__desc">{action.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Two column layout: Activity + Todos Progress */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Activity Feed */}
        <div className="card">
          <div className="card__header">
            <h3 className="card__title">Recent Activity</h3>
          </div>
          <div className="activity-feed">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="activity-item">
                  <div className="skeleton" style={{ width: 32, height: 32 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: "80%", height: 14, marginBottom: 6 }} />
                    <div className="skeleton" style={{ width: "40%", height: 10 }} />
                  </div>
                </div>
              ))
            ) : stats?.recent_activities.length ? (
              stats.recent_activities.map((activity) => (
                <div key={activity.id} className="activity-item">
                  <div className="activity-item__icon">
                    {getActivityIcon(activity.activity_type)}
                  </div>
                  <div className="activity-item__content">
                    <div className="activity-item__text">{activity.description}</div>
                    <div className="activity-item__time">{timeAgo(activity.created_at)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                <p style={{ color: "var(--text-muted)" }}>No activity yet. Start by uploading your CV!</p>
              </div>
            )}
          </div>
        </div>

        {/* Progress Card */}
        <div className="card">
          <div className="card__header">
            <h3 className="card__title">Progress Overview</h3>
          </div>

          {/* Application Pipeline */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <span>Application Pipeline</span>
              <span>{stats?.total_applications ?? 0} total</span>
            </div>
            <div style={{ display: "flex", gap: 4, height: 8, borderRadius: "var(--radius-full)", overflow: "hidden", background: "var(--bg-elevated)" }}>
              {stats && stats.total_applications > 0 && (
                <>
                  <div style={{ width: `${(stats.applied_count / stats.total_applications) * 100}%`, background: "var(--color-info)", borderRadius: "var(--radius-full)" }} />
                  <div style={{ width: `${(stats.interviewing_count / stats.total_applications) * 100}%`, background: "var(--color-warning)", borderRadius: "var(--radius-full)" }} />
                  <div style={{ width: `${(stats.offers_count / stats.total_applications) * 100}%`, background: "var(--color-success)", borderRadius: "var(--radius-full)" }} />
                  <div style={{ width: `${(stats.rejected_count / stats.total_applications) * 100}%`, background: "var(--color-danger)", borderRadius: "var(--radius-full)" }} />
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
              <span><span className="legend-dot legend-dot--blue" />Applied</span>
              <span><span className="legend-dot legend-dot--yellow" />Interviewing</span>
              <span><span className="legend-dot legend-dot--green" />Offers</span>
              <span><span className="legend-dot legend-dot--red" />Rejected</span>
            </div>
          </div>

          {/* Todos Progress */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <span>Tasks Completed</span>
              <span>{stats?.todos_completed ?? 0} / {stats?.todos_total ?? 0}</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar__fill"
                style={{
                  width: stats && stats.todos_total > 0
                    ? `${(stats.todos_completed / stats.todos_total) * 100}%`
                    : "0%"
                }}
              />
            </div>
          </div>

          {/* AI Nudge */}
          <div style={{
            marginTop: 20,
            padding: 16,
            background: "var(--bg-elevated)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <Lightbulb size={16} style={{ color: "var(--color-warning)" }} /> AI Nudge
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {stats?.total_applications === 0
                ? "Start by uploading your CV to unlock personalized job recommendations!"
                : stats?.interviewing_count && stats.interviewing_count > 0
                  ? "You have active interviews! Ask the AI assistant for interview prep tips."
                  : "Keep the momentum going — try searching for new jobs this week!"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

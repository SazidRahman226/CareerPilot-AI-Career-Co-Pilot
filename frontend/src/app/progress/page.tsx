/**
 * CareerPilot — Progress Dashboard
 * ===================================
 * Comprehensive progress dashboard with streak counter, application
 * funnel, weekly activity chart, goals summary, and smart AI nudges.
 * Streak data persisted in localStorage.
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  getDashboardStats,
  getApplications,
  getTodos,
  type DashboardStats,
  type Application,
  type Todo,
} from "@/lib/api";
import {
  Flame,
  TrendingUp,
  Send,
  Mic,
  PartyPopper,
  XCircle,
  Star,
  Target,
  CheckCircle2,
  CalendarDays,
  Lightbulb,
  ArrowRight,
  Zap,
  Trophy,
  BarChart3,
  Search,
  MessageSquare,
  Briefcase,
} from "lucide-react";

// ── Streak storage ───────────────────────────────────────

const STREAK_KEY = "careerpilot-streak";

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // ISO date
  activeDates: string[]; // last 30 days
}

function loadStreak(): StreakData {
  if (typeof window === "undefined") return { currentStreak: 0, longestStreak: 0, lastActiveDate: "", activeDates: [] };
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    return raw ? JSON.parse(raw) : { currentStreak: 0, longestStreak: 0, lastActiveDate: "", activeDates: [] };
  } catch {
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: "", activeDates: [] };
  }
}

function saveStreak(data: StreakData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

function computeStreak(activities: { created_at: string }[]): StreakData {
  if (activities.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: "", activeDates: [] };
  }

  // Get unique dates of activity
  const dates = [...new Set(
    activities
      .map((a) => a.created_at?.split("T")[0])
      .filter(Boolean)
  )].sort();

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Current streak
  let currentStreak = 0;
  let checkDate = dates.includes(today) ? today : yesterday;

  if (dates.includes(checkDate)) {
    currentStreak = 1;
    let d = new Date(checkDate);
    while (true) {
      d.setDate(d.getDate() - 1);
      const ds = d.toISOString().split("T")[0];
      if (dates.includes(ds)) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Longest streak
  let longestStreak = 0;
  let tempStreak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  // Last 30 days active dates
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentDates = dates.filter((d) => new Date(d) >= thirtyDaysAgo);

  return {
    currentStreak,
    longestStreak,
    lastActiveDate: dates[dates.length - 1] || "",
    activeDates: recentDates,
  };
}

// ── Weekly activity ──────────────────────────────────────

function getWeeklyActivity(applications: Application[], todos: Todo[]): { day: string; count: number; label: string }[] {
  const result: { day: string; count: number; label: string }[] = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayLabel = i === 0 ? "Today" : i === 1 ? "Yesterday" : dayNames[d.getDay()];

    const appCount = applications.filter((a) =>
      (a.applied_date || a.created_at)?.split("T")[0] === dateStr
    ).length;

    const todoCount = todos.filter((t) =>
      t.updated_at?.split("T")[0] === dateStr && t.completed
    ).length;

    result.push({
      day: dayLabel,
      count: appCount + todoCount,
      label: dateStr,
    });
  }

  return result;
}

// ── Component ────────────────────────────────────────────

export default function ProgressPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState<StreakData>(loadStreak());

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getApplications(),
      getTodos(),
    ])
      .then(([statsData, appsData, todosData]) => {
        setStats(statsData);
        setApplications(appsData);
        setTodos(todosData);

        // Compute streak from all activities
        const allActivities = [
          ...appsData.map((a) => ({ created_at: a.created_at })),
          ...todosData.filter((t) => t.completed).map((t) => ({ created_at: t.updated_at })),
        ];
        const streakData = computeStreak(allActivities);
        setStreak(streakData);
        saveStreak(streakData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Weekly activity data
  const weeklyActivity = useMemo(
    () => getWeeklyActivity(applications, todos),
    [applications, todos]
  );
  const maxActivity = Math.max(...weeklyActivity.map((d) => d.count), 1);

  // Funnel data
  const funnel = useMemo(() => {
    if (!stats) return [];
    const total = stats.total_applications || 1;
    return [
      { label: "Wishlist", count: total - stats.applied_count, color: "var(--color-info)", icon: Star },
      { label: "Applied", count: stats.applied_count, color: "var(--color-primary)", icon: Send },
      { label: "Interviewing", count: stats.interviewing_count, color: "var(--color-warning)", icon: Mic },
      { label: "Offers", count: stats.offers_count, color: "var(--color-success)", icon: PartyPopper },
      { label: "Rejected", count: stats.rejected_count, color: "var(--color-danger)", icon: XCircle },
    ];
  }, [stats]);

  // Goals from localStorage
  const [goals, setGoals] = useState<any[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("careerpilot-goals");
      if (raw) setGoals(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  const activeGoals = goals.filter((g: any) => g.status === "active");
  const completedGoals = goals.filter((g: any) => g.status === "completed");

  // Smart nudges
  const nudges = useMemo(() => {
    const result: { message: string; action: string; href: string; icon: any; type: string }[] = [];

    // No applications this week
    const thisWeekApps = applications.filter((a) => {
      const d = a.applied_date || a.created_at;
      if (!d) return false;
      const appDate = new Date(d);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return appDate >= weekAgo;
    });
    if (thisWeekApps.length === 0) {
      result.push({
        message: "You haven't applied this week — browse matching openings to keep momentum!",
        action: "Search Jobs",
        href: "/jobs",
        icon: Search,
        type: "warning",
      });
    }

    // Streak encouragement
    if (streak.currentStreak >= 3) {
      result.push({
        message: `Amazing ${streak.currentStreak}-day streak! 🔥 Keep the momentum going!`,
        action: "View Calendar",
        href: "/calendar",
        icon: Flame,
        type: "success",
      });
    }

    // Interviews scheduled
    if (stats && stats.interviewing_count > 0) {
      result.push({
        message: `You have ${stats.interviewing_count} active interview${stats.interviewing_count > 1 ? "s" : ""} — prepare with the AI Assistant!`,
        action: "Open AI Chat",
        href: "/chat",
        icon: MessageSquare,
        type: "info",
      });
    }

    // Pending todos
    const pendingTodos = todos.filter((t) => !t.completed);
    if (pendingTodos.length > 3) {
      result.push({
        message: `${pendingTodos.length} pending tasks — knock a few out today!`,
        action: "View Calendar",
        href: "/calendar",
        icon: CheckCircle2,
        type: "warning",
      });
    }

    // No goals
    if (activeGoals.length === 0) {
      result.push({
        message: "Set a career goal to stay focused and track your progress!",
        action: "Set Goals",
        href: "/goals",
        icon: Target,
        type: "info",
      });
    }

    // Completed goals celebration
    if (completedGoals.length > 0) {
      result.push({
        message: `🎉 You've completed ${completedGoals.length} goal${completedGoals.length > 1 ? "s" : ""}! Set new ones to keep growing.`,
        action: "View Goals",
        href: "/goals",
        icon: Trophy,
        type: "success",
      });
    }

    // Default nudge if nothing else
    if (result.length === 0) {
      result.push({
        message: "Start by uploading your CV to unlock personalized job recommendations!",
        action: "Upload CV",
        href: "/profile",
        icon: Briefcase,
        type: "info",
      });
    }

    return result.slice(0, 4); // max 4 nudges
  }, [applications, todos, stats, streak, activeGoals, completedGoals]);

  // Response rate
  const responseRate = stats && stats.total_applications > 0
    ? Math.round(((stats.interviewing_count + stats.offers_count) / stats.total_applications) * 100)
    : 0;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-header__title">Progress</h1>
        <p className="page-header__subtitle">
          Your career journey at a glance — stats, streaks, and smart nudges.
        </p>
      </div>

      {/* Top Stats Row */}
      <div className="prog-stats-row">
        {/* Streak Card */}
        <div className="prog-streak-card">
          <div className="prog-streak__flame">
            <Flame size={28} />
          </div>
          <div className="prog-streak__info">
            <div className="prog-streak__count">
              {loading ? (
                <div className="skeleton" style={{ width: 40, height: 36 }} />
              ) : (
                streak.currentStreak
              )}
            </div>
            <div className="prog-streak__label">Day Streak</div>
          </div>
          <div className="prog-streak__best">
            <Trophy size={12} />
            Best: {streak.longestStreak}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="prog-stat-card">
          <div className="prog-stat-card__icon"><Send size={20} /></div>
          <div className="prog-stat-card__value">
            {loading ? <div className="skeleton" style={{ width: 40, height: 28 }} /> : stats?.total_applications ?? 0}
          </div>
          <div className="prog-stat-card__label">Applications Sent</div>
        </div>

        <div className="prog-stat-card">
          <div className="prog-stat-card__icon" style={{ color: "var(--color-warning)" }}><Mic size={20} /></div>
          <div className="prog-stat-card__value">
            {loading ? <div className="skeleton" style={{ width: 40, height: 28 }} /> : stats?.interviewing_count ?? 0}
          </div>
          <div className="prog-stat-card__label">Interviews</div>
        </div>

        <div className="prog-stat-card">
          <div className="prog-stat-card__icon" style={{ color: "var(--color-success)" }}><PartyPopper size={20} /></div>
          <div className="prog-stat-card__value">
            {loading ? <div className="skeleton" style={{ width: 40, height: 28 }} /> : stats?.offers_count ?? 0}
          </div>
          <div className="prog-stat-card__label">Offers</div>
        </div>

        <div className="prog-stat-card">
          <div className="prog-stat-card__icon" style={{ color: "var(--color-info)" }}><TrendingUp size={20} /></div>
          <div className="prog-stat-card__value">
            {loading ? <div className="skeleton" style={{ width: 40, height: 28 }} /> : `${responseRate}%`}
          </div>
          <div className="prog-stat-card__label">Response Rate</div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="prog-grid">
        {/* Left: Funnel + Activity */}
        <div className="prog-col">
          {/* Application Funnel */}
          <div className="card">
            <div className="card__header">
              <h3 className="card__title">
                <BarChart3 size={16} style={{ marginRight: 6 }} />
                Application Funnel
              </h3>
            </div>
            <div className="prog-funnel">
              {funnel.map((stage, i) => {
                const Icon = stage.icon;
                const width = stats && stats.total_applications > 0
                  ? Math.max((stage.count / stats.total_applications) * 100, 8)
                  : 100;
                return (
                  <div key={stage.label} className="prog-funnel__stage">
                    <div className="prog-funnel__label">
                      <Icon size={14} style={{ color: stage.color }} />
                      <span>{stage.label}</span>
                      <span className="prog-funnel__count">{stage.count}</span>
                    </div>
                    <div className="prog-funnel__bar-track">
                      <div
                        className="prog-funnel__bar-fill"
                        style={{
                          width: `${width}%`,
                          background: stage.color,
                          animationDelay: `${i * 100}ms`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly Activity */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card__header">
              <h3 className="card__title">
                <CalendarDays size={16} style={{ marginRight: 6 }} />
                Weekly Activity
              </h3>
            </div>
            <div className="prog-activity">
              {weeklyActivity.map((day) => (
                <div key={day.label} className="prog-activity__bar-group">
                  <div className="prog-activity__bar-wrapper">
                    <div
                      className="prog-activity__bar"
                      style={{
                        height: `${day.count > 0 ? Math.max((day.count / maxActivity) * 100, 12) : 4}%`,
                      }}
                    />
                  </div>
                  <div className="prog-activity__count">{day.count}</div>
                  <div className="prog-activity__label">{day.day}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Goals + Nudges */}
        <div className="prog-col">
          {/* Goals Summary */}
          <div className="card">
            <div className="card__header">
              <h3 className="card__title">
                <Target size={16} style={{ marginRight: 6 }} />
                Goals Progress
              </h3>
              <Link href="/goals" className="btn btn--ghost" style={{ fontSize: 12, padding: "4px 10px" }}>
                View All <ArrowRight size={12} />
              </Link>
            </div>

            {activeGoals.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                  No active goals yet
                </p>
                <Link href="/goals" className="btn btn--primary" style={{ fontSize: 12 }}>
                  Set a Goal
                </Link>
              </div>
            ) : (
              <div className="prog-goals">
                {activeGoals.slice(0, 4).map((goal: any) => {
                  const progress = goal.targetCount > 0
                    ? Math.min((goal.currentCount / goal.targetCount) * 100, 100)
                    : 0;
                  return (
                    <div key={goal.id} className="prog-goal-item">
                      <div className="prog-goal-item__info">
                        <span className="prog-goal-item__title">{goal.title}</span>
                        <span className="prog-goal-item__count">
                          {goal.currentCount}/{goal.targetCount}
                        </span>
                      </div>
                      <div className="prog-goal-item__bar">
                        <div
                          className="prog-goal-item__bar-fill"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completion stats */}
            {goals.length > 0 && (
              <div className="prog-goals-stats">
                <span>
                  <CheckCircle2 size={12} style={{ color: "var(--color-success)" }} />
                  {completedGoals.length} completed
                </span>
                <span>
                  <Target size={12} style={{ color: "var(--color-primary)" }} />
                  {activeGoals.length} active
                </span>
              </div>
            )}
          </div>

          {/* Tasks Overview */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card__header">
              <h3 className="card__title">
                <CheckCircle2 size={16} style={{ marginRight: 6 }} />
                Tasks Overview
              </h3>
              <Link href="/calendar" className="btn btn--ghost" style={{ fontSize: 12, padding: "4px 10px" }}>
                Calendar <ArrowRight size={12} />
              </Link>
            </div>
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
                    : "0%",
                }}
              />
            </div>
          </div>

          {/* Smart AI Nudges */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card__header">
              <h3 className="card__title">
                <Lightbulb size={16} style={{ marginRight: 6, color: "var(--color-warning)" }} />
                Smart Nudges
              </h3>
            </div>
            <div className="prog-nudges">
              {nudges.map((nudge, i) => {
                const Icon = nudge.icon;
                return (
                  <div key={i} className={`prog-nudge prog-nudge--${nudge.type}`}>
                    <div className="prog-nudge__icon">
                      <Icon size={16} />
                    </div>
                    <div className="prog-nudge__content">
                      <p className="prog-nudge__message">{nudge.message}</p>
                      <Link href={nudge.href} className="prog-nudge__action">
                        {nudge.action} <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

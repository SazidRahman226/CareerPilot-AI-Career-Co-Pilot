/**
 * CareerPilot — Goals Page
 * ==========================
 * SMART goal setting with progress bars, categories, templates,
 * and auto-progress tracking. Data persisted in localStorage.
 * Application-type goals auto-count from Kanban data.
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getApplications, type Application } from "@/lib/api";
import {
  Target,
  Plus,
  X,
  CheckCircle2,
  Circle,
  Trash2,
  Flame,
  Briefcase,
  GraduationCap,
  Users,
  Zap,
  Clock,
  Trophy,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────

interface Goal {
  id: string;
  title: string;
  category: "applications" | "learning" | "networking" | "skills";
  targetCount: number;
  currentCount: number;
  deadline: string; // ISO date string
  status: "active" | "completed" | "expired";
  createdAt: string;
  autoTrack: boolean; // for application goals
}

const GOAL_TEMPLATES: Omit<Goal, "id" | "createdAt" | "currentCount" | "status">[] = [
  {
    title: "Apply to 5 jobs this week",
    category: "applications",
    targetCount: 5,
    deadline: getEndOfWeek(),
    autoTrack: true,
  },
  {
    title: "Apply to 20 jobs this month",
    category: "applications",
    targetCount: 20,
    deadline: getEndOfMonth(),
    autoTrack: true,
  },
  {
    title: "Finish DSA course by Friday",
    category: "learning",
    targetCount: 1,
    deadline: getNextFriday(),
    autoTrack: false,
  },
  {
    title: "Complete 10 LeetCode problems",
    category: "learning",
    targetCount: 10,
    deadline: getEndOfWeek(),
    autoTrack: false,
  },
  {
    title: "Attend 2 networking events",
    category: "networking",
    targetCount: 2,
    deadline: getEndOfMonth(),
    autoTrack: false,
  },
  {
    title: "Connect with 10 professionals on LinkedIn",
    category: "networking",
    targetCount: 10,
    deadline: getEndOfMonth(),
    autoTrack: false,
  },
  {
    title: "Learn a new framework",
    category: "skills",
    targetCount: 1,
    deadline: getEndOfMonth(),
    autoTrack: false,
  },
  {
    title: "Practice 3 mock interviews",
    category: "skills",
    targetCount: 3,
    deadline: getEndOfWeek(),
    autoTrack: false,
  },
];

// ── Date helpers ─────────────────────────────────────────

function getEndOfWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return d.toISOString().split("T")[0];
}

function getEndOfMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().split("T")[0];
}

function getNextFriday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day <= 5 ? 5 - day : 6;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T23:59:59");
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDeadline(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return "Expired";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `${days} days left`;
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Storage ──────────────────────────────────────────────

const STORAGE_KEY = "careerpilot-goals";

function loadGoals(): Goal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGoals(goals: Goal[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

// ── Category config ──────────────────────────────────────

const CATEGORIES = {
  applications: { label: "Applications", icon: Briefcase, color: "var(--color-primary)" },
  learning: { label: "Learning", icon: GraduationCap, color: "var(--color-info)" },
  networking: { label: "Networking", icon: Users, color: "var(--color-success)" },
  skills: { label: "Skills", icon: Zap, color: "var(--color-warning)" },
};

// ── Component ────────────────────────────────────────────

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "expired">("all");
  const [loaded, setLoaded] = useState(false);

  // New goal form
  const [newGoal, setNewGoal] = useState({
    title: "",
    category: "applications" as Goal["category"],
    targetCount: 5,
    deadline: getEndOfWeek(),
    autoTrack: false,
  });

  // Load goals from localStorage
  useEffect(() => {
    setGoals(loadGoals());
    setLoaded(true);
  }, []);

  // Load applications for auto-tracking
  useEffect(() => {
    getApplications()
      .then(setApplications)
      .catch(console.error);
  }, []);

  // Save goals whenever they change
  useEffect(() => {
    if (loaded) saveGoals(goals);
  }, [goals, loaded]);

  // Auto-track application goals
  const processedGoals = useMemo(() => {
    const now = new Date();
    return goals.map((goal) => {
      let g = { ...goal };

      // Auto-track application count
      if (g.autoTrack && g.category === "applications") {
        const goalCreated = new Date(g.createdAt);
        const appsAfterCreation = applications.filter((app) => {
          const appDate = app.applied_date || app.created_at;
          return appDate && new Date(appDate) >= goalCreated;
        });
        g.currentCount = appsAfterCreation.length;
      }

      // Auto-update status
      if (g.status === "active") {
        if (g.currentCount >= g.targetCount) {
          g.status = "completed";
        } else if (daysUntil(g.deadline) < 0) {
          g.status = "expired";
        }
      }

      return g;
    });
  }, [goals, applications]);

  // Stats
  const stats = useMemo(() => {
    const active = processedGoals.filter((g) => g.status === "active").length;
    const completed = processedGoals.filter((g) => g.status === "completed").length;
    const expired = processedGoals.filter((g) => g.status === "expired").length;
    const total = processedGoals.length;
    return { active, completed, expired, total };
  }, [processedGoals]);

  // Filtered goals
  const filteredGoals = useMemo(() => {
    if (filter === "all") return processedGoals;
    return processedGoals.filter((g) => g.status === filter);
  }, [processedGoals, filter]);

  // Add goal
  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.title.trim()) return;

    const goal: Goal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...newGoal,
      currentCount: 0,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    setGoals([goal, ...goals]);
    setShowAddModal(false);
    setNewGoal({
      title: "",
      category: "applications",
      targetCount: 5,
      deadline: getEndOfWeek(),
      autoTrack: false,
    });
  };

  // Use template
  const handleUseTemplate = (template: typeof GOAL_TEMPLATES[0]) => {
    const goal: Goal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...template,
      currentCount: 0,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    setGoals([goal, ...goals]);
    setShowTemplates(false);
  };

  // Increment manual goal
  const handleIncrement = (goalId: string) => {
    setGoals(goals.map((g) =>
      g.id === goalId ? { ...g, currentCount: Math.min(g.currentCount + 1, g.targetCount) } : g
    ));
  };

  // Decrement manual goal
  const handleDecrement = (goalId: string) => {
    setGoals(goals.map((g) =>
      g.id === goalId ? { ...g, currentCount: Math.max(g.currentCount - 1, 0) } : g
    ));
  };

  // Delete goal
  const handleDeleteGoal = (goalId: string) => {
    setGoals(goals.filter((g) => g.id !== goalId));
  };

  // Reset goal
  const handleResetGoal = (goalId: string) => {
    setGoals(goals.map((g) =>
      g.id === goalId
        ? { ...g, currentCount: 0, status: "active" as const, deadline: getEndOfWeek(), createdAt: new Date().toISOString() }
        : g
    ));
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-header__title">Goals</h1>
          <p className="page-header__subtitle">
            Set career targets and track your progress toward landing your dream job.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn--secondary" onClick={() => setShowTemplates(true)}>
            <Sparkles size={14} /> Templates
          </button>
          <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>
            <Plus size={14} /> New Goal
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="goals-stats">
        <div className="goals-stat">
          <div className="goals-stat__value">{stats.total}</div>
          <div className="goals-stat__label">Total Goals</div>
        </div>
        <div className="goals-stat">
          <div className="goals-stat__value" style={{ color: "var(--color-primary)" }}>{stats.active}</div>
          <div className="goals-stat__label">Active</div>
        </div>
        <div className="goals-stat">
          <div className="goals-stat__value" style={{ color: "var(--color-success)" }}>{stats.completed}</div>
          <div className="goals-stat__label">Completed</div>
        </div>
        <div className="goals-stat">
          <div className="goals-stat__value" style={{ color: "var(--color-danger)" }}>{stats.expired}</div>
          <div className="goals-stat__label">Expired</div>
        </div>
      </div>

      {/* Filters */}
      <div className="goals-filters">
        {(["all", "active", "completed", "expired"] as const).map((f) => (
          <button
            key={f}
            className={`goals-filter ${filter === f ? "goals-filter--active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Goals Grid */}
      {filteredGoals.length === 0 ? (
        <div className="goals-empty">
          <Target size={48} style={{ color: "var(--text-muted)", marginBottom: 16 }} />
          <h3>No {filter !== "all" ? filter : ""} goals yet</h3>
          <p>Set your first career goal or use a template to get started!</p>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn--secondary" onClick={() => setShowTemplates(true)}>
              <Sparkles size={14} /> Browse Templates
            </button>
            <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>
              <Plus size={14} /> Create Goal
            </button>
          </div>
        </div>
      ) : (
        <div className="goals-grid">
          {filteredGoals.map((goal) => {
            const cat = CATEGORIES[goal.category];
            const Icon = cat.icon;
            const progress = goal.targetCount > 0
              ? Math.min((goal.currentCount / goal.targetCount) * 100, 100)
              : 0;
            const deadlineLabel = formatDeadline(goal.deadline);
            const isUrgent = daysUntil(goal.deadline) <= 2 && goal.status === "active";

            return (
              <div
                key={goal.id}
                className={`goal-card goal-card--${goal.status}`}
              >
                {/* Category strip */}
                <div className="goal-card__strip" style={{ background: cat.color }} />

                <div className="goal-card__body">
                  {/* Header */}
                  <div className="goal-card__header">
                    <div className="goal-card__category" style={{ color: cat.color }}>
                      <Icon size={14} />
                      <span>{cat.label}</span>
                    </div>
                    <div className="goal-card__actions">
                      {goal.status !== "active" && (
                        <button
                          className="goal-card__action"
                          title="Reset goal"
                          onClick={() => handleResetGoal(goal.id)}
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                      <button
                        className="goal-card__action goal-card__action--danger"
                        title="Delete goal"
                        onClick={() => handleDeleteGoal(goal.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="goal-card__title">{goal.title}</h3>

                  {/* Progress */}
                  <div className="goal-card__progress-area">
                    <div className="goal-card__progress-bar">
                      <div
                        className="goal-card__progress-fill"
                        style={{
                          width: `${progress}%`,
                          background: goal.status === "completed"
                            ? "var(--color-success)"
                            : goal.status === "expired"
                              ? "var(--color-danger)"
                              : cat.color,
                        }}
                      />
                    </div>
                    <div className="goal-card__progress-text">
                      <span className="goal-card__count">
                        {goal.currentCount} / {goal.targetCount}
                      </span>
                      <span className="goal-card__percent">{Math.round(progress)}%</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="goal-card__footer">
                    <span className={`goal-card__deadline ${isUrgent ? "goal-card__deadline--urgent" : ""}`}>
                      <Clock size={12} />
                      {deadlineLabel}
                    </span>

                    {/* Status badge */}
                    {goal.status === "completed" && (
                      <span className="goal-card__badge goal-card__badge--success">
                        <Trophy size={11} /> Done!
                      </span>
                    )}
                    {goal.status === "expired" && (
                      <span className="goal-card__badge goal-card__badge--danger">
                        Expired
                      </span>
                    )}
                    {goal.autoTrack && goal.status === "active" && (
                      <span className="goal-card__badge goal-card__badge--auto">
                        <Zap size={11} /> Auto
                      </span>
                    )}
                  </div>

                  {/* Manual increment/decrement for non-auto goals */}
                  {!goal.autoTrack && goal.status === "active" && (
                    <div className="goal-card__manual">
                      <button
                        className="goal-card__manual-btn"
                        onClick={() => handleDecrement(goal.id)}
                        disabled={goal.currentCount <= 0}
                      >
                        −
                      </button>
                      <span className="goal-card__manual-count">{goal.currentCount}</span>
                      <button
                        className="goal-card__manual-btn goal-card__manual-btn--plus"
                        onClick={() => handleIncrement(goal.id)}
                        disabled={goal.currentCount >= goal.targetCount}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Templates Modal */}
      {showTemplates && (
        <div className="modal-overlay" onClick={() => setShowTemplates(false)}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">
              <Sparkles size={18} style={{ color: "var(--color-warning)" }} /> Goal Templates
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
              Quick-start with a pre-built goal. Click to add it to your goals.
            </p>
            <div className="goal-templates">
              {GOAL_TEMPLATES.map((template, i) => {
                const cat = CATEGORIES[template.category];
                const Icon = cat.icon;
                return (
                  <button
                    key={i}
                    className="goal-template"
                    onClick={() => handleUseTemplate(template)}
                  >
                    <div className="goal-template__icon" style={{ color: cat.color }}>
                      <Icon size={20} />
                    </div>
                    <div className="goal-template__content">
                      <div className="goal-template__title">{template.title}</div>
                      <div className="goal-template__meta">
                        <span style={{ color: cat.color }}>{cat.label}</span>
                        <span>·</span>
                        <span>Target: {template.targetCount}</span>
                        <span>·</span>
                        <span>{formatDeadline(template.deadline)}</span>
                      </div>
                    </div>
                    <ArrowRight size={16} className="goal-template__arrow" />
                  </button>
                );
              })}
            </div>
            <div className="modal__actions">
              <button className="btn btn--secondary" onClick={() => setShowTemplates(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Create New Goal</h2>
            <form onSubmit={handleAddGoal}>
              <div className="form-group">
                <label>Goal Title *</label>
                <input
                  className="input"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  placeholder="e.g., Apply to 10 jobs this week"
                  required
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    className="select"
                    value={newGoal.category}
                    onChange={(e) => setNewGoal({
                      ...newGoal,
                      category: e.target.value as Goal["category"],
                      autoTrack: e.target.value === "applications",
                    })}
                  >
                    <option value="applications">Applications</option>
                    <option value="learning">Learning</option>
                    <option value="networking">Networking</option>
                    <option value="skills">Skills</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Target Count</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100}
                    value={newGoal.targetCount}
                    onChange={(e) => setNewGoal({ ...newGoal, targetCount: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Deadline</label>
                <input
                  className="input"
                  type="date"
                  value={newGoal.deadline}
                  onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                />
              </div>
              {newGoal.category === "applications" && (
                <div style={{
                  padding: "10px 14px",
                  background: "rgba(79, 70, 229, 0.04)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(79, 70, 229, 0.1)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <Zap size={14} style={{ color: "var(--color-primary)" }} />
                  Progress will auto-track from your Kanban board applications.
                </div>
              )}
              <div className="modal__actions">
                <button type="button" className="btn btn--secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary">
                  Create Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

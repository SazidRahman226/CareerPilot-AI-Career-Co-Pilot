/**
 * CareerPilot — Calendar View
 * =============================
 * Interactive monthly calendar with deadline reminders, to-do items,
 * and application events. Color-coded dots indicate event types.
 * Sources data from existing Applications and Todos APIs.
 */

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getApplications,
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  type Application,
  type Todo,
} from "@/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  X,
  Clock,
  MapPin,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Trash2,
  Target,
  Briefcase,
  GraduationCap,
  Zap,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: string, b: string): boolean {
  return a === b;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

interface CalendarEvent {
  id: string;
  type: "deadline" | "applied" | "todo-pending" | "todo-done" | "interview";
  title: string;
  subtitle: string;
  date: string;
  rawTodo?: Todo;
  rawApp?: Application;
}

// ── Component ────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(formatDate(today));
  const [applications, setApplications] = useState<Application[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState<string>(formatDate(today));

  // New todo form
  const [newTodo, setNewTodo] = useState({
    title: "",
    description: "",
    priority: "medium",
    category: "general",
    due_date: "",
  });

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [apps, todosData] = await Promise.all([
        getApplications(),
        getTodos(),
      ]);
      setApplications(apps);
      setTodos(todosData);
    } catch (err) {
      console.error("Failed to load calendar data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build events map
  const events = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];

    applications.forEach((app) => {
      if (app.deadline) {
        result.push({
          id: `deadline-${app.id}`,
          type: "deadline",
          title: `Deadline: ${app.role}`,
          subtitle: app.company,
          date: app.deadline.split("T")[0],
          rawApp: app,
        });
      }
      if (app.applied_date) {
        result.push({
          id: `applied-${app.id}`,
          type: "applied",
          title: `Applied: ${app.role}`,
          subtitle: app.company,
          date: app.applied_date.split("T")[0],
          rawApp: app,
        });
      }
      if (app.status === "interviewing" && app.deadline) {
        result.push({
          id: `interview-${app.id}`,
          type: "interview",
          title: `Interview: ${app.role}`,
          subtitle: app.company,
          date: app.deadline.split("T")[0],
          rawApp: app,
        });
      }
    });

    todos.forEach((todo) => {
      if (todo.due_date) {
        result.push({
          id: `todo-${todo.id}`,
          type: todo.completed ? "todo-done" : "todo-pending",
          title: todo.title,
          subtitle: todo.category || "General",
          date: todo.due_date.split("T")[0],
          rawTodo: todo,
        });
      }
    });

    return result;
  }, [applications, todos]);

  // Events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((evt) => {
      if (!map[evt.date]) map[evt.date] = [];
      map[evt.date].push(evt);
    });
    return map;
  }, [events]);

  // Navigation
  const goToPrev = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNext = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(formatDate(today));
  };

  // Calendar grid data
  const totalDays = daysInMonth(currentYear, currentMonth);
  const startDay = firstDayOfMonth(currentYear, currentMonth);
  const todayStr = formatDate(today);

  // Build grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Selected date events
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  // Is overdue?
  const isOverdue = (dateStr: string) => dateStr < todayStr;
  const isUpcoming = (dateStr: string) => {
    const diff = (new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 3;
  };

  // Toggle todo
  const handleToggleTodo = async (todo: Todo) => {
    try {
      await updateTodo(todo.id, { completed: !todo.completed });
      loadData();
    } catch (err) {
      console.error("Failed to toggle todo:", err);
    }
  };

  // Delete todo
  const handleDeleteTodo = async (todoId: number) => {
    try {
      await deleteTodo(todoId);
      loadData();
    } catch (err) {
      console.error("Failed to delete todo:", err);
    }
  };

  // Add todo
  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.title.trim()) return;

    try {
      await createTodo({
        ...newTodo,
        due_date: addDate,
      });
      setShowAddModal(false);
      setNewTodo({ title: "", description: "", priority: "medium", category: "general", due_date: "" });
      loadData();
    } catch (err) {
      console.error("Failed to create todo:", err);
    }
  };

  // Open add modal for specific date
  const handleAddForDate = (dateStr: string) => {
    setAddDate(dateStr);
    setShowAddModal(true);
  };

  // Dot type color
  const getDotClass = (type: CalendarEvent["type"]) => {
    switch (type) {
      case "deadline": return "cal-dot--deadline";
      case "applied": return "cal-dot--applied";
      case "todo-done": return "cal-dot--done";
      case "todo-pending": return "cal-dot--pending";
      case "interview": return "cal-dot--interview";
    }
  };

  const getEventIcon = (type: CalendarEvent["type"]) => {
    switch (type) {
      case "deadline": return <AlertTriangle size={14} />;
      case "applied": return <Briefcase size={14} />;
      case "todo-done": return <CheckCircle2 size={14} />;
      case "todo-pending": return <Circle size={14} />;
      case "interview": return <GraduationCap size={14} />;
    }
  };

  const getEventTypeLabel = (type: CalendarEvent["type"]) => {
    switch (type) {
      case "deadline": return "Deadline";
      case "applied": return "Applied";
      case "todo-done": return "Completed";
      case "todo-pending": return "To-Do";
      case "interview": return "Interview";
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-header__title">Calendar</h1>
          <p className="page-header__subtitle">
            Track deadlines, interviews, and to-do items on your career timeline.
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => handleAddForDate(selectedDate || todayStr)}>
          <Plus size={14} /> Add Event
        </button>
      </div>

      {/* Legend */}
      <div className="cal-legend">
        <span className="cal-legend__item">
          <span className="cal-dot cal-dot--deadline" /> Deadline
        </span>
        <span className="cal-legend__item">
          <span className="cal-dot cal-dot--applied" /> Applied
        </span>
        <span className="cal-legend__item">
          <span className="cal-dot cal-dot--interview" /> Interview
        </span>
        <span className="cal-legend__item">
          <span className="cal-dot cal-dot--pending" /> To-Do
        </span>
        <span className="cal-legend__item">
          <span className="cal-dot cal-dot--done" /> Completed
        </span>
      </div>

      <div className="cal-layout">
        {/* Calendar Grid */}
        <div className="cal-grid-wrapper">
          {/* Month Navigation */}
          <div className="cal-nav">
            <button className="cal-nav__btn" onClick={goToPrev}>
              <ChevronLeft size={18} />
            </button>
            <div className="cal-nav__title">
              <CalendarIcon size={18} />
              {MONTHS[currentMonth]} {currentYear}
            </div>
            <button className="cal-nav__btn" onClick={goToNext}>
              <ChevronRight size={18} />
            </button>
            <button className="cal-nav__today" onClick={goToToday}>
              Today
            </button>
          </div>

          {/* Weekday headers */}
          <div className="cal-weekdays">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-weekday">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          {loading ? (
            <div className="cal-grid">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="cal-cell cal-cell--empty">
                  <div className="skeleton" style={{ width: 20, height: 14 }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="cal-grid">
              {cells.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-${i}`} className="cal-cell cal-cell--outside" />;
                }

                const dateStr = formatDate(new Date(currentYear, currentMonth, day));
                const dayEvents = eventsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const hasOverdue = dayEvents.some(
                  (e) => (e.type === "deadline" || e.type === "todo-pending") && isOverdue(dateStr)
                );
                const hasUpcoming = dayEvents.some(
                  (e) => (e.type === "deadline") && isUpcoming(dateStr)
                );

                return (
                  <div
                    key={dateStr}
                    className={[
                      "cal-cell",
                      isToday && "cal-cell--today",
                      isSelected && "cal-cell--selected",
                      hasOverdue && "cal-cell--overdue",
                      hasUpcoming && !hasOverdue && "cal-cell--upcoming",
                    ].filter(Boolean).join(" ")}
                    onClick={() => setSelectedDate(dateStr)}
                  >
                    <span className="cal-cell__day">{day}</span>
                    {dayEvents.length > 0 && (
                      <div className="cal-cell__dots">
                        {/* Show up to 4 unique dots */}
                        {[...new Set(dayEvents.map((e) => e.type))].slice(0, 4).map((type) => (
                          <span key={type} className={`cal-dot ${getDotClass(type)}`} />
                        ))}
                      </div>
                    )}
                    {dayEvents.length > 0 && (
                      <span className="cal-cell__count">{dayEvents.length}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Day Detail Panel */}
        <div className="cal-detail">
          <div className="cal-detail__header">
            <h3 className="cal-detail__title">
              {selectedDate
                ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                : "Select a day"}
            </h3>
            {selectedDate && (
              <button
                className="btn btn--ghost"
                style={{ padding: "4px 8px", fontSize: 12 }}
                onClick={() => handleAddForDate(selectedDate)}
              >
                <Plus size={12} /> Add
              </button>
            )}
          </div>

          {selectedEvents.length === 0 ? (
            <div className="cal-detail__empty">
              <CalendarIcon size={32} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
              <p>No events on this day</p>
              {selectedDate && (
                <button
                  className="btn btn--secondary"
                  style={{ marginTop: 12, fontSize: 12 }}
                  onClick={() => handleAddForDate(selectedDate)}
                >
                  <Plus size={12} /> Add a to-do
                </button>
              )}
            </div>
          ) : (
            <div className="cal-detail__events">
              {selectedEvents.map((evt) => (
                <div
                  key={evt.id}
                  className={`cal-event cal-event--${evt.type}`}
                >
                  <div className="cal-event__icon">
                    {getEventIcon(evt.type)}
                  </div>
                  <div className="cal-event__content">
                    <div className="cal-event__title">{evt.title}</div>
                    <div className="cal-event__meta">
                      <span className={`cal-event__type cal-event__type--${evt.type}`}>
                        {getEventTypeLabel(evt.type)}
                      </span>
                      <span>{evt.subtitle}</span>
                    </div>
                  </div>
                  <div className="cal-event__actions">
                    {evt.rawTodo && (
                      <>
                        <button
                          className="cal-event__action-btn"
                          title={evt.rawTodo.completed ? "Mark incomplete" : "Mark complete"}
                          onClick={() => handleToggleTodo(evt.rawTodo!)}
                        >
                          {evt.rawTodo.completed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                        </button>
                        <button
                          className="cal-event__action-btn cal-event__action-btn--danger"
                          title="Delete"
                          onClick={() => handleDeleteTodo(evt.rawTodo!.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upcoming deadlines section */}
          {selectedDate === todayStr && (
            <div className="cal-detail__upcoming">
              <h4 className="cal-detail__section-title">
                <Zap size={14} style={{ color: "var(--color-warning)" }} />
                Upcoming (Next 3 Days)
              </h4>
              {events
                .filter((e) => {
                  const diff = (new Date(e.date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                  return diff > 0 && diff <= 3 && (e.type === "deadline" || e.type === "todo-pending" || e.type === "interview");
                })
                .slice(0, 5)
                .map((evt) => (
                  <div key={evt.id} className="cal-upcoming-item">
                    <span className={`cal-dot ${getDotClass(evt.type)}`} />
                    <span className="cal-upcoming-item__title">{evt.title}</span>
                    <span className="cal-upcoming-item__date">
                      {new Date(evt.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              {events.filter((e) => {
                const diff = (new Date(e.date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                return diff > 0 && diff <= 3;
              }).length === 0 && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
                  No upcoming deadlines — you&apos;re all clear! 🎉
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Add To-Do</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              For {new Date(addDate + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <form onSubmit={handleAddTodo}>
              <div className="form-group">
                <label>Title *</label>
                <input
                  className="input"
                  value={newTodo.title}
                  onChange={(e) => setNewTodo({ ...newTodo, title: e.target.value })}
                  placeholder="e.g., Prepare for Google interview"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  className="input"
                  value={newTodo.description}
                  onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })}
                  placeholder="Optional details..."
                  rows={2}
                  style={{ resize: "vertical" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label>Priority</label>
                  <select
                    className="select"
                    value={newTodo.priority}
                    onChange={(e) => setNewTodo({ ...newTodo, priority: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    className="select"
                    value={newTodo.category}
                    onChange={(e) => setNewTodo({ ...newTodo, category: e.target.value })}
                  >
                    <option value="general">General</option>
                    <option value="application">Application</option>
                    <option value="interview">Interview Prep</option>
                    <option value="learning">Learning</option>
                    <option value="networking">Networking</option>
                  </select>
                </div>
              </div>
              <div className="modal__actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary">
                  Add To-Do
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

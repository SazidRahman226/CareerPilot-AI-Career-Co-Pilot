/**
 * CareerPilot — Application Tracker (Kanban Board)
 * ===================================================
 * Drag-and-drop Kanban board with 5 columns for tracking applications.
 * Uses native HTML drag-and-drop API (no extra dependencies).
 * Persisted to SQLite via the backend API.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  type Application,
} from "@/lib/api";

// Kanban column definitions
const COLUMNS = [
  { id: "wishlist", label: "Wishlist", emoji: "⭐", color: "var(--color-info)" },
  { id: "applied", label: "Applied", emoji: "📨", color: "var(--color-primary)" },
  { id: "interviewing", label: "Interviewing", emoji: "🎙️", color: "var(--color-warning)" },
  { id: "offer", label: "Offer", emoji: "🎉", color: "var(--color-success)" },
  { id: "rejected", label: "Rejected", emoji: "❌", color: "var(--color-danger)" },
];

function KanbanCard({
  app,
  onDragStart,
  onDelete,
}: {
  app: Application;
  onDragStart: (e: React.DragEvent, appId: number) => void;
  onDelete: (id: number) => void;
}) {
  const scoreClass = app.fit_score >= 75 ? "high" : app.fit_score >= 50 ? "medium" : "low";

  return (
    <div
      className="kanban__card"
      draggable
      onDragStart={(e) => onDragStart(e, app.id)}
    >
      <div className="kanban__card-title">{app.role}</div>
      <div className="kanban__card-company">{app.company}</div>
      <div className="kanban__card-meta">
        <span>
          {app.location && `📍 ${app.location}`}
          {!app.location && app.applied_date && `📅 ${app.applied_date}`}
          {!app.location && !app.applied_date && "No details"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {app.fit_score > 0 && (
            <span className={`kanban__card-score kanban__card-score--${scoreClass}`}>
              {Math.round(app.fit_score)}%
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(app.id);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
              padding: 2,
            }}
            title="Delete application"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TrackerPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  // New application form state
  const [newApp, setNewApp] = useState({
    company: "",
    role: "",
    status: "wishlist",
    url: "",
    location: "",
    salary: "",
    notes: "",
  });

  // Load applications
  const loadApplications = useCallback(async () => {
    try {
      const data = await getApplications();
      setApplications(data);
    } catch (err) {
      console.error("Failed to load applications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, appId: number) => {
    setDraggedId(appId);
    e.dataTransfer.effectAllowed = "move";
    // Add dragging class
    const target = e.target as HTMLElement;
    setTimeout(() => target.classList.add("kanban__card--dragging"), 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const column = (e.target as HTMLElement).closest(".kanban__column");
    column?.classList.add("kanban__column--drag-over");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const column = (e.target as HTMLElement).closest(".kanban__column");
    column?.classList.remove("kanban__column--drag-over");
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const column = (e.target as HTMLElement).closest(".kanban__column");
    column?.classList.remove("kanban__column--drag-over");

    if (draggedId === null) return;

    // Optimistic update
    setApplications((prev) =>
      prev.map((app) =>
        app.id === draggedId ? { ...app, status: newStatus } : app
      )
    );

    try {
      await updateApplication(draggedId, { status: newStatus });
    } catch (err) {
      // Revert on error
      loadApplications();
      console.error("Failed to update application:", err);
    }

    setDraggedId(null);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.classList.remove("kanban__card--dragging");
    // Remove all drag-over classes
    document.querySelectorAll(".kanban__column--drag-over").forEach((el) => {
      el.classList.remove("kanban__column--drag-over");
    });
    setDraggedId(null);
  };

  // Create new application
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApp.company || !newApp.role) return;

    try {
      await createApplication(newApp);
      setShowModal(false);
      setNewApp({ company: "", role: "", status: "wishlist", url: "", location: "", salary: "", notes: "" });
      loadApplications();
    } catch (err) {
      console.error("Failed to create application:", err);
    }
  };

  // Delete application
  const handleDelete = async (id: number) => {
    if (!confirm("Remove this application?")) return;

    setApplications((prev) => prev.filter((app) => app.id !== id));
    try {
      await deleteApplication(id);
    } catch (err) {
      loadApplications();
    }
  };

  // Group applications by status
  const getColumnApps = (status: string) =>
    applications.filter((app) => app.status === status);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-header__title">Application Tracker</h1>
          <p className="page-header__subtitle">
            Drag and drop cards to update your application status.
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowModal(true)}>
          ➕ Add Application
        </button>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="kanban">
          {COLUMNS.map((col) => (
            <div key={col.id} className="kanban__column">
              <div className="kanban__column-header">
                <span className="kanban__column-title">{col.emoji} {col.label}</span>
              </div>
              <div className="kanban__column-cards">
                <div className="skeleton" style={{ height: 80, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 80 }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const colApps = getColumnApps(col.id);
            return (
              <div
                key={col.id}
                className="kanban__column"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                <div className="kanban__column-header">
                  <span className="kanban__column-title">
                    {col.emoji} {col.label}
                  </span>
                  <span className="kanban__column-count">{colApps.length}</span>
                </div>
                <div className="kanban__column-cards">
                  {colApps.length === 0 ? (
                    <div style={{
                      padding: 16,
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      border: "1px dashed var(--border-color)",
                      borderRadius: "var(--radius-sm)",
                    }}>
                      Drop here
                    </div>
                  ) : (
                    colApps.map((app) => (
                      <KanbanCard
                        key={app.id}
                        app={app}
                        onDragStart={handleDragStart}
                        onDelete={handleDelete}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Application Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Add Application</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Company *</label>
                <input
                  className="input"
                  value={newApp.company}
                  onChange={(e) => setNewApp({ ...newApp, company: e.target.value })}
                  placeholder="e.g., Google"
                  required
                />
              </div>
              <div className="form-group">
                <label>Role *</label>
                <input
                  className="input"
                  value={newApp.role}
                  onChange={(e) => setNewApp({ ...newApp, role: e.target.value })}
                  placeholder="e.g., Software Engineer"
                  required
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  className="select"
                  value={newApp.status}
                  onChange={(e) => setNewApp({ ...newApp, status: e.target.value })}
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.emoji} {col.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Location</label>
                <input
                  className="input"
                  value={newApp.location}
                  onChange={(e) => setNewApp({ ...newApp, location: e.target.value })}
                  placeholder="e.g., Dhaka, Bangladesh"
                />
              </div>
              <div className="form-group">
                <label>Job URL</label>
                <input
                  className="input"
                  value={newApp.url}
                  onChange={(e) => setNewApp({ ...newApp, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="form-group">
                <label>Salary</label>
                <input
                  className="input"
                  value={newApp.salary}
                  onChange={(e) => setNewApp({ ...newApp, salary: e.target.value })}
                  placeholder="e.g., BDT 80,000/month"
                />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  className="input"
                  value={newApp.notes}
                  onChange={(e) => setNewApp({ ...newApp, notes: e.target.value })}
                  placeholder="Any notes about this application..."
                  rows={3}
                  style={{ resize: "vertical" }}
                />
              </div>
              <div className="modal__actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary">
                  Add Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

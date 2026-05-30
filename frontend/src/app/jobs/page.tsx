/**
 * CareerPilot — Job Hunter Page
 * ================================
 * Natural language job search with fit score cards.
 * Shows results from multiple sources with CV-grounded fit analysis.
 * Tracks which jobs are already in the tracker to prevent duplicates.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  searchJobs,
  createApplication,
  getApplications,
  type JobCard,
  type JobSearchResponse,
  type Application,
} from "@/lib/api";

function FitScoreCircle({ score }: { score: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const colorClass = score >= 75 ? "high" : score >= 50 ? "medium" : "low";

  return (
    <div className="fit-score">
      <svg className="fit-score__circle" viewBox="0 0 56 56">
        <circle className="fit-score__bg" cx="28" cy="28" r={radius} />
        <circle
          className={`fit-score__fill fit-score__fill--${colorClass}`}
          cx="28"
          cy="28"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="fit-score__value">{Math.round(score)}</div>
    </div>
  );
}

/**
 * Generates a unique key for a job based on title + company (normalized).
 * Used to check if a job is already tracked.
 */
function getJobKey(title: string, company: string): string {
  return `${title.toLowerCase().trim()}::${company.toLowerCase().trim()}`;
}

function JobCardComponent({
  job,
  onAddToTracker,
  isTracked,
}: {
  job: JobCard;
  onAddToTracker: (job: JobCard) => void;
  isTracked: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (isTracked) return; // Already tracked, do nothing
    setAdding(true);
    try {
      await onAddToTracker(job);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="job-card">
      <div className="job-card__header">
        <div>
          <h3 className="job-card__title">{job.title}</h3>
          <div className="job-card__company">{job.company}</div>
        </div>
        <FitScoreCircle score={job.fit_score} />
      </div>

      {/* Meta tags */}
      <div className="job-card__meta">
        {job.location && <span className="job-card__tag">📍 {job.location}</span>}
        {job.salary_range && <span className="job-card__tag">💰 {job.salary_range}</span>}
        {job.job_type && <span className="job-card__tag">📋 {job.job_type}</span>}
        {job.deadline && <span className="job-card__tag">⏰ {job.deadline}</span>}
        <span className="job-card__tag" style={{ textTransform: "uppercase", fontSize: 9 }}>
          via {job.source}
        </span>
      </div>

      {/* Description */}
      <p className="job-card__description">{job.description}</p>

      {/* Skills */}
      {job.requirements.length > 0 && (
        <div className="job-card__skills">
          {job.requirements.map((skill, i) => (
            <span key={i} className="job-card__skill">{skill}</span>
          ))}
        </div>
      )}

      {/* Match Reasons (expandable) */}
      {job.match_reasons.length > 0 && (
        <>
          <button
            className="btn btn--ghost"
            onClick={() => setExpanded(!expanded)}
            style={{ fontSize: 12, padding: "4px 8px", marginBottom: 8 }}
          >
            {expanded ? "▼" : "▶"} Why it matches
          </button>
          {expanded && (
            <div className="job-card__reasons">
              <ul style={{ paddingLeft: 16, margin: 0 }}>
                {job.match_reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              {job.fit_breakdown && Object.keys(job.fit_breakdown).length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
                  Skills: {job.fit_breakdown.skill_match}% | 
                  Experience: {job.fit_breakdown.experience_match}% | 
                  Education: {job.fit_breakdown.education_match}%
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="job-card__actions">
        <button
          className={`btn ${isTracked ? "btn--tracked" : "btn--primary"}`}
          onClick={handleAdd}
          disabled={adding || isTracked}
          style={{ flex: 1 }}
        >
          {adding ? "Adding..." : isTracked ? "✅ In Tracker" : "📋 Add to Tracker"}
        </button>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--secondary"
          >
            🔗 View
          </a>
        )}
      </div>
    </div>
  );
}

export default function JobsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JobSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Set of job keys (title::company) already in the tracker
  const [trackedJobs, setTrackedJobs] = useState<Set<string>>(new Set());

  /**
   * Fetch existing tracker applications on mount to know which jobs
   * are already tracked, preventing duplicate additions.
   */
  const loadTrackedJobs = useCallback(async () => {
    try {
      const apps = await getApplications();
      const keys = new Set(apps.map((app: Application) => getJobKey(app.role, app.company)));
      setTrackedJobs(keys);
    } catch {
      // Non-critical — we just won't show "In Tracker" state
    }
  }, []);

  useEffect(() => {
    loadTrackedJobs();
  }, [loadTrackedJobs]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");

    try {
      const data = await searchJobs(query);
      setResults(data);
      // Refresh tracked jobs in case user added some since last load
      loadTrackedJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToTracker = async (job: JobCard) => {
    const jobKey = getJobKey(job.title, job.company);

    // Double-check to prevent race conditions
    if (trackedJobs.has(jobKey)) {
      return;
    }

    try {
      await createApplication({
        company: job.company,
        role: job.title,
        status: "wishlist",
        url: job.url,
        location: job.location,
        salary: job.salary_range,
        fit_score: job.fit_score,
        deadline: job.deadline,
        notes: job.description || "",
      });

      // Immediately update tracked set so button changes to "In Tracker"
      setTrackedJobs((prev) => {
        const next = new Set(prev);
        next.add(jobKey);
        return next;
      });
    } catch (err) {
      alert("Failed to add to tracker. Please try again.");
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-header__title">Job Hunter</h1>
        <p className="page-header__subtitle">
          Search with natural language. Results are scored against your CV.
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="search-bar">
        <input
          type="text"
          className="search-bar__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try: "ML internships in Dhaka" or "remote Python developer"'
        />
        <button
          type="submit"
          className="btn btn--primary"
          disabled={loading || !query.trim()}
        >
          {loading ? "⏳ Searching..." : "🔍 Search"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div style={{ padding: 16, background: "rgba(239, 68, 68, 0.1)", borderRadius: "var(--radius-md)", color: "var(--color-danger)", marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Results info */}
      {results && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" }}>
          <span>
            Found <strong style={{ color: "var(--text-primary)" }}>{results.total_found}</strong> jobs for &quot;{results.query}&quot;
          </span>
          <span>
            Sources: {results.sources_used.map((s) => (
              <span key={s} className="badge badge--primary" style={{ marginLeft: 4 }}>{s}</span>
            ))}
          </span>
        </div>
      )}

      {/* Job Cards Grid */}
      {loading ? (
        <div className="jobs-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="job-card">
              <div className="skeleton" style={{ height: 20, width: "70%", marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: "50%", marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 60, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 32 }} />
            </div>
          ))}
        </div>
      ) : results?.jobs.length ? (
        <div className="jobs-grid">
          {results.jobs.map((job) => (
            <JobCardComponent
              key={job.id}
              job={job}
              onAddToTracker={handleAddToTracker}
              isTracked={trackedJobs.has(getJobKey(job.title, job.company))}
            />
          ))}
        </div>
      ) : results ? (
        <div className="empty-state">
          <div className="empty-state__icon">🔍</div>
          <h3 className="empty-state__title">No jobs found</h3>
          <p className="empty-state__text">
            Try a different search query or broaden your criteria.
          </p>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state__icon">🎯</div>
          <h3 className="empty-state__title">Start Your Search</h3>
          <p className="empty-state__text">
            Describe the role you&apos;re looking for in plain English.
            We&apos;ll search across multiple sources and score each result against your CV.
          </p>
        </div>
      )}
    </div>
  );
}

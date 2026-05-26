/**
 * CareerPilot — API Client
 * =========================
 * Centralized HTTP client for communicating with the FastAPI backend.
 * All API calls go through this module for consistency and error handling.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || `API Error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

// ============================
//  CV / Profile API
// ============================

export async function uploadCV(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/cv/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "CV upload failed");
  }

  return response.json();
}

export async function getCVStatus() {
  return apiFetch<{
    uploaded: boolean;
    filename: string;
    chunk_count: number;
    sections_detected: string[];
  }>("/api/cv/status");
}

export async function clearCV() {
  return apiFetch("/api/cv/clear", { method: "DELETE" });
}

// ============================
//  Chat API
// ============================

export interface ChatResponse {
  response: string;
  conversation_id: string;
  sources: string[];
  fit_score?: {
    score: number;
    breakdown: Record<string, number>;
    matched_skills: string[];
    missing_skills: string[];
  };
}

export async function sendChatMessage(
  message: string,
  conversationId: string = "default"
): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
    }),
  });
}

export async function clearChatHistory(conversationId: string) {
  return apiFetch(`/api/chat/history/${conversationId}`, {
    method: "DELETE",
  });
}

// ============================
//  Jobs API
// ============================

export interface JobCard {
  id: string;
  title: string;
  company: string;
  location: string;
  salary_range: string;
  job_type: string;
  deadline: string;
  description: string;
  requirements: string[];
  url: string;
  source: string;
  fit_score: number;
  fit_breakdown: Record<string, number>;
  match_reasons: string[];
}

export interface JobSearchResponse {
  jobs: JobCard[];
  total_found: number;
  query: string;
  sources_used: string[];
}

export async function searchJobs(
  query: string,
  location: string = "",
  limit: number = 10
): Promise<JobSearchResponse> {
  return apiFetch<JobSearchResponse>("/api/jobs/search", {
    method: "POST",
    body: JSON.stringify({ query, location, limit }),
  });
}

// ============================
//  Tracker API
// ============================

export interface Application {
  id: number;
  company: string;
  role: string;
  status: string;
  url: string;
  location: string;
  salary: string;
  notes: string;
  fit_score: number;
  applied_date: string;
  deadline: string;
  created_at: string;
  updated_at: string;
}

export async function getApplications(status?: string): Promise<Application[]> {
  const params = status ? `?status=${status}` : "";
  return apiFetch<Application[]>(`/api/tracker/applications${params}`);
}

export async function createApplication(data: {
  company: string;
  role: string;
  status?: string;
  url?: string;
  location?: string;
  salary?: string;
  notes?: string;
  fit_score?: number;
  applied_date?: string;
  deadline?: string;
}): Promise<Application> {
  return apiFetch<Application>("/api/tracker/applications", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateApplication(
  id: number,
  data: Partial<Application>
): Promise<Application> {
  return apiFetch<Application>(`/api/tracker/applications/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteApplication(id: number) {
  return apiFetch(`/api/tracker/applications/${id}`, { method: "DELETE" });
}

// ============================
//  Todos API
// ============================

export interface Todo {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  priority: string;
  due_date: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export async function getTodos(completed?: boolean): Promise<Todo[]> {
  const params = completed !== undefined ? `?completed=${completed}` : "";
  return apiFetch<Todo[]>(`/api/tracker/todos${params}`);
}

export async function createTodo(data: {
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  category?: string;
}): Promise<Todo> {
  return apiFetch<Todo>("/api/tracker/todos", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTodo(
  id: number,
  data: Partial<Todo>
): Promise<Todo> {
  return apiFetch<Todo>(`/api/tracker/todos/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTodo(id: number) {
  return apiFetch(`/api/tracker/todos/${id}`, { method: "DELETE" });
}

// ============================
//  Dashboard Stats API
// ============================

export interface DashboardStats {
  total_applications: number;
  applied_count: number;
  interviewing_count: number;
  offers_count: number;
  rejected_count: number;
  avg_fit_score: number;
  todos_completed: number;
  todos_total: number;
  recent_activities: {
    id: number;
    activity_type: string;
    description: string;
    created_at: string;
  }[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>("/api/tracker/stats");
}

// ============================
//  Health Check
// ============================

export async function checkHealth() {
  return apiFetch<{ status: string; cv_uploaded: boolean }>("/health");
}

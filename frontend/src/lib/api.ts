/**
 * CareerPilot — API Client
 * =========================
 * Centralized HTTP client for communicating with the FastAPI backend.
 * All API calls go through this module for consistency and error handling.
 * Automatically attaches JWT token from localStorage to all requests.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TOKEN_KEY = "careerpilot-token";

/**
 * Get the stored JWT token.
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Store the JWT token.
 */
export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Remove the JWT token.
 */
export function removeToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Generic fetch wrapper with error handling and auto-auth.
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  // Attach JWT token if available
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || `API Error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Fetch wrapper for file uploads (FormData). Auto-attaches auth token.
 */
async function apiUpload<T>(
  endpoint: string,
  formData: FormData
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const token = getToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Upload failed");
  }

  return response.json();
}

// ============================
//  Auth API
// ============================

export interface UserInfo {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserInfo;
}

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser(): Promise<UserInfo> {
  return apiFetch<UserInfo>("/api/auth/me");
}

// ============================
//  CV / Profile API
// ============================

export async function uploadCV(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<{
    success: boolean;
    message: string;
    filename: string;
    chunk_count: number;
    sections_detected: string[];
  }>("/api/cv/upload", formData);
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

export interface ChatMessageFromDB {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  timestamp: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessageFromDB[];
  conversation_id: string;
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

export async function getChatHistory(
  conversationId: string = "default"
): Promise<ChatHistoryResponse> {
  return apiFetch<ChatHistoryResponse>(`/api/chat/history/${conversationId}`);
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
//  CV Builder API
// ============================

export interface CVBuilderData {
  personal_info: {
    full_name: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    website: string;
  };
  summary: string;
  education: {
    institution: string;
    degree: string;
    field_of_study: string;
    start_date: string;
    end_date: string;
    gpa: string;
    description: string;
  }[];
  experience: {
    company: string;
    position: string;
    location: string;
    start_date: string;
    end_date: string;
    current: boolean;
    description: string;
    highlights: string[];
  }[];
  skills: string[];
  projects: {
    name: string;
    description: string;
    technologies: string;
    url: string;
  }[];
  certifications: string[];
  awards: string[];
  languages: string[];
}

export async function generateCVPdf(data: CVBuilderData): Promise<Blob> {
  const url = `${API_URL}/api/cv-builder/generate-pdf`;
  const token = getToken();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "PDF generation failed");
  }

  return response.blob();
}

export async function generateCVDocx(data: CVBuilderData): Promise<Blob> {
  const url = `${API_URL}/api/cv-builder/generate-docx`;
  const token = getToken();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "DOCX generation failed");
  }

  return response.blob();
}

// ============================
//  Health Check
// ============================

export async function checkHealth() {
  return apiFetch<{ status: string; cv_uploaded: boolean }>("/health");
}

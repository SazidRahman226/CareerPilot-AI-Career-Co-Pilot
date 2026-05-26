/**
 * CareerPilot — Profile & CV Upload Page
 * =========================================
 * CV upload dropzone with drag-and-drop, parsed section preview,
 * and skills tag cloud. This is where the RAG pipeline starts.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { uploadCV, getCVStatus, clearCV } from "@/lib/api";

export default function ProfilePage() {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cvStatus, setCvStatus] = useState({
    uploaded: false,
    filename: "",
    chunk_count: 0,
    sections_detected: [] as string[],
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load CV status on mount
  useEffect(() => {
    getCVStatus()
      .then(setCvStatus)
      .catch(console.error);
  }, []);

  const handleFile = async (file: File) => {
    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|docx)$/i)) {
      setError("Please upload a PDF or DOCX file.");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be under 10MB.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");
    setUploadProgress(0);

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      const result = await uploadCV(file);
      clearInterval(progressInterval);
      setUploadProgress(100);

      setCvStatus({
        uploaded: true,
        filename: result.filename,
        chunk_count: result.chunk_count,
        sections_detected: result.sections_detected,
      });

      setSuccess(result.message);

      // Reset progress after animation
      setTimeout(() => setUploadProgress(0), 1000);
    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleClear = async () => {
    if (!confirm("Are you sure you want to remove your CV? This will clear all CV data.")) return;

    try {
      await clearCV();
      setCvStatus({
        uploaded: false,
        filename: "",
        chunk_count: 0,
        sections_detected: [],
      });
      setSuccess("CV data cleared successfully.");
    } catch (err) {
      setError("Failed to clear CV data.");
    }
  };

  const sectionEmojis: Record<string, string> = {
    summary: "📝",
    experience: "💼",
    education: "🎓",
    skills: "🛠️",
    projects: "🚀",
    certifications: "📜",
    awards: "🏆",
    publications: "📚",
    languages: "🌐",
    contact: "📞",
    references: "👥",
    general: "📄",
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-header__title">Profile & CV</h1>
        <p className="page-header__subtitle">
          Upload your CV to power all AI features. Your CV is the single source of truth.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Upload Zone */}
        <div>
          <div
            className={`upload-zone ${dragActive ? "upload-zone--active" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-zone__icon">
              {uploading ? "⏳" : cvStatus.uploaded ? "✅" : "📄"}
            </div>
            <h3 className="upload-zone__title">
              {uploading
                ? "Processing your CV..."
                : cvStatus.uploaded
                  ? "CV Uploaded Successfully"
                  : "Drop your CV here"}
            </h3>
            <p className="upload-zone__subtitle">
              {uploading
                ? "Parsing, chunking, and embedding..."
                : cvStatus.uploaded
                  ? `${cvStatus.filename} • Click to re-upload`
                  : "Supports PDF and DOCX formats (max 10MB)"}
            </p>

            {/* Upload Progress */}
            {uploadProgress > 0 && (
              <div className="upload-zone__progress">
                <div className="progress-bar">
                  <div
                    className="progress-bar__fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                  {uploadProgress < 30 && "Extracting text..."}
                  {uploadProgress >= 30 && uploadProgress < 60 && "Detecting sections..."}
                  {uploadProgress >= 60 && uploadProgress < 90 && "Creating embeddings..."}
                  {uploadProgress >= 90 && "Finalizing..."}
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={handleInputChange}
              style={{ display: "none" }}
            />
          </div>

          {/* Error / Success Messages */}
          {error && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-danger)",
              fontSize: 13,
            }}>
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-success)",
              fontSize: 13,
            }}>
              ✅ {success}
            </div>
          )}

          {/* Clear CV Button */}
          {cvStatus.uploaded && (
            <button
              className="btn btn--danger"
              onClick={handleClear}
              style={{ marginTop: 16, width: "100%" }}
            >
              🗑️ Remove CV and Clear Data
            </button>
          )}
        </div>

        {/* CV Status & Preview */}
        <div>
          {cvStatus.uploaded ? (
            <div className="card">
              <div className="card__header">
                <h3 className="card__title">CV Analysis</h3>
                <span className="badge badge--success">Active</span>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div style={{
                  padding: 16,
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-md)",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-accent)" }}>
                    {cvStatus.chunk_count}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Content Chunks</div>
                </div>
                <div style={{
                  padding: 16,
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-md)",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-accent)" }}>
                    {cvStatus.sections_detected.length}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sections Found</div>
                </div>
              </div>

              {/* Detected Sections */}
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12, color: "var(--text-secondary)" }}>
                  Detected Sections
                </h4>
                <div className="sections-preview">
                  {cvStatus.sections_detected.map((section) => (
                    <span key={section} className="section-tag">
                      {sectionEmojis[section] || "📄"} {section}
                    </span>
                  ))}
                </div>
              </div>

              {/* What's next */}
              <div style={{
                marginTop: 20,
                padding: 16,
                background: "var(--gradient-card)",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(99, 102, 241, 0.15)",
              }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  🎯 What&apos;s Next?
                </h4>
                <ul style={{ fontSize: 13, color: "var(--text-secondary)", paddingLeft: 20 }}>
                  <li>Ask the <strong>AI Assistant</strong> about your skills and career readiness</li>
                  <li>Use <strong>Job Hunter</strong> to find roles matched to your profile</li>
                  <li>Get a <strong>fit score</strong> for any job description</li>
                  <li>Request a <strong>personalized cover letter</strong></li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
              <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>📄</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>
                No CV Uploaded Yet
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", maxWidth: 300 }}>
                Upload your CV to unlock all AI-powered features.
                Your CV becomes the foundation for job matching,
                skill analysis, and personalized advice.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

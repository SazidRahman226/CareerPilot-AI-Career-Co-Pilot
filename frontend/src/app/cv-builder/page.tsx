/**
 * CareerPilot — CV Builder Page
 * ================================
 * Multi-section form to build a professional CV.
 * Generates downloadable PDF and DOCX files via the backend.
 */

"use client";

import { useState } from "react";
import { generateCVPdf, generateCVDocx, type CVBuilderData } from "@/lib/api";
import {
  User,
  Edit3,
  Briefcase,
  GraduationCap,
  Wrench,
  Rocket,
  Award,
  Trophy,
  Globe,
  FileDown,
  FileText,
  Loader2,
  ClipboardList,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

// ============================
//  Default empty state
// ============================
const EMPTY_DATA: CVBuilderData = {
  personal_info: {
    full_name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    website: "",
  },
  summary: "",
  education: [{ institution: "", degree: "", field_of_study: "", start_date: "", end_date: "", gpa: "", description: "" }],
  experience: [{ company: "", position: "", location: "", start_date: "", end_date: "", current: false, description: "", highlights: [""] }],
  skills: [],
  projects: [{ name: "", description: "", technologies: "", url: "" }],
  certifications: [],
  awards: [],
  languages: [],
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CVBuilderPage() {
  const [data, setData] = useState<CVBuilderData>(EMPTY_DATA);
  const [skillInput, setSkillInput] = useState("");
  const [certInput, setCertInput] = useState("");
  const [awardInput, setAwardInput] = useState("");
  const [langInput, setLangInput] = useState("");
  const [generating, setGenerating] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // --- Helpers ---
  const updatePersonalInfo = (field: string, value: string) => {
    setData((prev) => ({
      ...prev,
      personal_info: { ...prev.personal_info, [field]: value },
    }));
  };

  // --- Education ---
  const addEducation = () => {
    setData((prev) => ({
      ...prev,
      education: [...prev.education, { institution: "", degree: "", field_of_study: "", start_date: "", end_date: "", gpa: "", description: "" }],
    }));
  };

  const updateEducation = (index: number, field: string, value: string) => {
    setData((prev) => ({
      ...prev,
      education: prev.education.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    }));
  };

  const removeEducation = (index: number) => {
    if (data.education.length <= 1) return;
    setData((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  };

  // --- Experience ---
  const addExperience = () => {
    setData((prev) => ({
      ...prev,
      experience: [...prev.experience, { company: "", position: "", location: "", start_date: "", end_date: "", current: false, description: "", highlights: [""] }],
    }));
  };

  const updateExperience = (index: number, field: string, value: string | boolean) => {
    setData((prev) => ({
      ...prev,
      experience: prev.experience.map((e, i) => (i === index ? { ...e, [field]: value } : e)),
    }));
  };

  const removeExperience = (index: number) => {
    if (data.experience.length <= 1) return;
    setData((prev) => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index),
    }));
  };

  const addHighlight = (expIndex: number) => {
    setData((prev) => ({
      ...prev,
      experience: prev.experience.map((e, i) =>
        i === expIndex ? { ...e, highlights: [...e.highlights, ""] } : e
      ),
    }));
  };

  const updateHighlight = (expIndex: number, hlIndex: number, value: string) => {
    setData((prev) => ({
      ...prev,
      experience: prev.experience.map((e, i) =>
        i === expIndex
          ? { ...e, highlights: e.highlights.map((h, j) => (j === hlIndex ? value : h)) }
          : e
      ),
    }));
  };

  const removeHighlight = (expIndex: number, hlIndex: number) => {
    setData((prev) => ({
      ...prev,
      experience: prev.experience.map((e, i) =>
        i === expIndex
          ? { ...e, highlights: e.highlights.filter((_, j) => j !== hlIndex) }
          : e
      ),
    }));
  };

  // --- Projects ---
  const addProject = () => {
    setData((prev) => ({
      ...prev,
      projects: [...prev.projects, { name: "", description: "", technologies: "", url: "" }],
    }));
  };

  const updateProject = (index: number, field: string, value: string) => {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));
  };

  const removeProject = (index: number) => {
    if (data.projects.length <= 1) return;
    setData((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index),
    }));
  };

  // --- Tag-style lists (skills, certs, awards, languages) ---
  const addTag = (key: "skills" | "certifications" | "awards" | "languages", value: string) => {
    if (!value.trim()) return;
    setData((prev) => ({
      ...prev,
      [key]: [...prev[key], value.trim()],
    }));
  };

  const removeTag = (key: "skills" | "certifications" | "awards" | "languages", index: number) => {
    setData((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index),
    }));
  };

  // --- Generate ---
  const handleGenerate = async (format: "pdf" | "docx") => {
    setError("");
    setSuccess("");
    setGenerating(format);

    try {
      const blob = format === "pdf"
        ? await generateCVPdf(data)
        : await generateCVDocx(data);

      const name = data.personal_info.full_name || "CV";
      downloadBlob(blob, `${name.replace(/\s+/g, "_")}_Resume.${format}`);
      setSuccess(`${format.toUpperCase()} downloaded successfully!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to generate ${format.toUpperCase()}`);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-header__title">CV Builder</h1>
          <p className="page-header__subtitle">
            Build a professional CV and export as PDF or DOCX.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn--primary"
            onClick={() => handleGenerate("pdf")}
            disabled={generating !== null}
          >
            {generating === "pdf" ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Generating...</> : <><FileDown size={14} /> Download PDF</>}
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => handleGenerate("docx")}
            disabled={generating !== null}
          >
            {generating === "docx" ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Generating...</> : <><FileText size={14} /> Download DOCX</>}
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="cv-builder-alert cv-builder-alert--error"><AlertTriangle size={14} /> {error}</div>
      )}
      {success && (
        <div className="cv-builder-alert cv-builder-alert--success"><CheckCircle size={14} /> {success}</div>
      )}

      <div className="cv-builder-grid">
        {/* ===== LEFT: Form ===== */}
        <div className="cv-builder-form">

          {/* Personal Info */}
          <div className="cv-section-card">
            <h3 className="cv-section-card__title"><User size={16} /> Personal Information</h3>
            <div className="cv-field-grid">
              <div className="cv-field cv-field--full">
                <label>Full Name</label>
                <input value={data.personal_info.full_name} onChange={(e) => updatePersonalInfo("full_name", e.target.value)} placeholder="John Doe" />
              </div>
              <div className="cv-field">
                <label>Email</label>
                <input type="email" value={data.personal_info.email} onChange={(e) => updatePersonalInfo("email", e.target.value)} placeholder="john@example.com" />
              </div>
              <div className="cv-field">
                <label>Phone</label>
                <input value={data.personal_info.phone} onChange={(e) => updatePersonalInfo("phone", e.target.value)} placeholder="+1 234 567 8900" />
              </div>
              <div className="cv-field">
                <label>Location</label>
                <input value={data.personal_info.location} onChange={(e) => updatePersonalInfo("location", e.target.value)} placeholder="Dhaka, Bangladesh" />
              </div>
              <div className="cv-field">
                <label>LinkedIn</label>
                <input value={data.personal_info.linkedin} onChange={(e) => updatePersonalInfo("linkedin", e.target.value)} placeholder="linkedin.com/in/johndoe" />
              </div>
              <div className="cv-field">
                <label>GitHub</label>
                <input value={data.personal_info.github} onChange={(e) => updatePersonalInfo("github", e.target.value)} placeholder="github.com/johndoe" />
              </div>
              <div className="cv-field">
                <label>Website</label>
                <input value={data.personal_info.website} onChange={(e) => updatePersonalInfo("website", e.target.value)} placeholder="johndoe.com" />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="cv-section-card">
            <h3 className="cv-section-card__title"><Edit3 size={16} /> Professional Summary</h3>
            <textarea
              className="cv-textarea"
              value={data.summary}
              onChange={(e) => setData((prev) => ({ ...prev, summary: e.target.value }))}
              placeholder="Brief professional summary highlighting your key strengths, experience, and career goals..."
              rows={4}
            />
          </div>

          {/* Experience */}
          <div className="cv-section-card">
            <div className="cv-section-card__header">
              <h3 className="cv-section-card__title"><Briefcase size={16} /> Work Experience</h3>
              <button className="cv-add-btn" onClick={addExperience}>+ Add</button>
            </div>
            {data.experience.map((exp, i) => (
              <div key={i} className="cv-entry">
                <div className="cv-entry__header">
                  <span className="cv-entry__number">#{i + 1}</span>
                  {data.experience.length > 1 && (
                    <button className="cv-remove-btn" onClick={() => removeExperience(i)}>✕</button>
                  )}
                </div>
                <div className="cv-field-grid">
                  <div className="cv-field">
                    <label>Position</label>
                    <input value={exp.position} onChange={(e) => updateExperience(i, "position", e.target.value)} placeholder="Software Engineer" />
                  </div>
                  <div className="cv-field">
                    <label>Company</label>
                    <input value={exp.company} onChange={(e) => updateExperience(i, "company", e.target.value)} placeholder="Google" />
                  </div>
                  <div className="cv-field">
                    <label>Location</label>
                    <input value={exp.location} onChange={(e) => updateExperience(i, "location", e.target.value)} placeholder="Mountain View, CA" />
                  </div>
                  <div className="cv-field">
                    <label>Start Date</label>
                    <input value={exp.start_date} onChange={(e) => updateExperience(i, "start_date", e.target.value)} placeholder="Jan 2023" />
                  </div>
                  <div className="cv-field">
                    <label>End Date</label>
                    <input value={exp.end_date} onChange={(e) => updateExperience(i, "end_date", e.target.value)} placeholder="Present" disabled={exp.current} />
                  </div>
                  <div className="cv-field cv-field--checkbox">
                    <label>
                      <input type="checkbox" checked={exp.current} onChange={(e) => updateExperience(i, "current", e.target.checked)} />
                      Currently working here
                    </label>
                  </div>
                  <div className="cv-field cv-field--full">
                    <label>Description</label>
                    <textarea value={exp.description} onChange={(e) => updateExperience(i, "description", e.target.value)} placeholder="Describe your role and responsibilities..." rows={2} />
                  </div>
                </div>
                {/* Highlights / Bullet Points */}
                <div className="cv-highlights">
                  <label>Key Achievements</label>
                  {exp.highlights.map((hl, j) => (
                    <div key={j} className="cv-highlight-row">
                      <span className="cv-highlight-bullet">•</span>
                      <input
                        value={hl}
                        onChange={(e) => updateHighlight(i, j, e.target.value)}
                        placeholder="Achieved something impactful..."
                      />
                      <button className="cv-remove-btn cv-remove-btn--sm" onClick={() => removeHighlight(i, j)}>✕</button>
                    </div>
                  ))}
                  <button className="cv-add-btn cv-add-btn--sm" onClick={() => addHighlight(i)}>+ Add achievement</button>
                </div>
              </div>
            ))}
          </div>

          {/* Education */}
          <div className="cv-section-card">
            <div className="cv-section-card__header">
              <h3 className="cv-section-card__title"><GraduationCap size={16} /> Education</h3>
              <button className="cv-add-btn" onClick={addEducation}>+ Add</button>
            </div>
            {data.education.map((edu, i) => (
              <div key={i} className="cv-entry">
                <div className="cv-entry__header">
                  <span className="cv-entry__number">#{i + 1}</span>
                  {data.education.length > 1 && (
                    <button className="cv-remove-btn" onClick={() => removeEducation(i)}>✕</button>
                  )}
                </div>
                <div className="cv-field-grid">
                  <div className="cv-field">
                    <label>Institution</label>
                    <input value={edu.institution} onChange={(e) => updateEducation(i, "institution", e.target.value)} placeholder="MIT" />
                  </div>
                  <div className="cv-field">
                    <label>Degree</label>
                    <input value={edu.degree} onChange={(e) => updateEducation(i, "degree", e.target.value)} placeholder="B.Sc." />
                  </div>
                  <div className="cv-field">
                    <label>Field of Study</label>
                    <input value={edu.field_of_study} onChange={(e) => updateEducation(i, "field_of_study", e.target.value)} placeholder="Computer Science" />
                  </div>
                  <div className="cv-field">
                    <label>Start Date</label>
                    <input value={edu.start_date} onChange={(e) => updateEducation(i, "start_date", e.target.value)} placeholder="Sep 2019" />
                  </div>
                  <div className="cv-field">
                    <label>End Date</label>
                    <input value={edu.end_date} onChange={(e) => updateEducation(i, "end_date", e.target.value)} placeholder="Jun 2023" />
                  </div>
                  <div className="cv-field">
                    <label>GPA</label>
                    <input value={edu.gpa} onChange={(e) => updateEducation(i, "gpa", e.target.value)} placeholder="3.8/4.0" />
                  </div>
                  <div className="cv-field cv-field--full">
                    <label>Description (optional)</label>
                    <textarea value={edu.description} onChange={(e) => updateEducation(i, "description", e.target.value)} placeholder="Relevant coursework, thesis, etc." rows={2} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className="cv-section-card">
            <h3 className="cv-section-card__title"><Wrench size={16} /> Skills</h3>
            <div className="cv-tags">
              {data.skills.map((skill, i) => (
                <span key={i} className="cv-tag">
                  {skill}
                  <button onClick={() => removeTag("skills", i)}>✕</button>
                </span>
              ))}
            </div>
            <div className="cv-tag-input">
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag("skills", skillInput);
                    setSkillInput("");
                  }
                }}
                placeholder="Type a skill and press Enter..."
              />
              <button className="cv-add-btn cv-add-btn--sm" onClick={() => { addTag("skills", skillInput); setSkillInput(""); }}>Add</button>
            </div>
          </div>

          {/* Projects */}
          <div className="cv-section-card">
            <div className="cv-section-card__header">
              <h3 className="cv-section-card__title"><Rocket size={16} /> Projects</h3>
              <button className="cv-add-btn" onClick={addProject}>+ Add</button>
            </div>
            {data.projects.map((proj, i) => (
              <div key={i} className="cv-entry">
                <div className="cv-entry__header">
                  <span className="cv-entry__number">#{i + 1}</span>
                  {data.projects.length > 1 && (
                    <button className="cv-remove-btn" onClick={() => removeProject(i)}>✕</button>
                  )}
                </div>
                <div className="cv-field-grid">
                  <div className="cv-field">
                    <label>Project Name</label>
                    <input value={proj.name} onChange={(e) => updateProject(i, "name", e.target.value)} placeholder="CareerPilot" />
                  </div>
                  <div className="cv-field">
                    <label>Technologies</label>
                    <input value={proj.technologies} onChange={(e) => updateProject(i, "technologies", e.target.value)} placeholder="React, Python, FastAPI" />
                  </div>
                  <div className="cv-field cv-field--full">
                    <label>Description</label>
                    <textarea value={proj.description} onChange={(e) => updateProject(i, "description", e.target.value)} placeholder="What does this project do?" rows={2} />
                  </div>
                  <div className="cv-field cv-field--full">
                    <label>URL</label>
                    <input value={proj.url} onChange={(e) => updateProject(i, "url", e.target.value)} placeholder="https://github.com/..." />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Certifications, Awards, Languages */}
          <div className="cv-trio-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {/* Certifications */}
            <div className="cv-section-card">
              <h3 className="cv-section-card__title"><Award size={16} /> Certifications</h3>
              <div className="cv-tags cv-tags--col">
                {data.certifications.map((cert, i) => (
                  <span key={i} className="cv-tag">
                    {cert}
                    <button onClick={() => removeTag("certifications", i)}>✕</button>
                  </span>
                ))}
              </div>
              <div className="cv-tag-input">
                <input
                  value={certInput}
                  onChange={(e) => setCertInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("certifications", certInput);
                      setCertInput("");
                    }
                  }}
                  placeholder="e.g. AWS Certified..."
                />
              </div>
            </div>

            {/* Awards */}
            <div className="cv-section-card">
              <h3 className="cv-section-card__title"><Trophy size={16} /> Awards</h3>
              <div className="cv-tags cv-tags--col">
                {data.awards.map((award, i) => (
                  <span key={i} className="cv-tag">
                    {award}
                    <button onClick={() => removeTag("awards", i)}>✕</button>
                  </span>
                ))}
              </div>
              <div className="cv-tag-input">
                <input
                  value={awardInput}
                  onChange={(e) => setAwardInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("awards", awardInput);
                      setAwardInput("");
                    }
                  }}
                  placeholder="e.g. Dean's List..."
                />
              </div>
            </div>

            {/* Languages */}
            <div className="cv-section-card">
              <h3 className="cv-section-card__title"><Globe size={16} /> Languages</h3>
              <div className="cv-tags cv-tags--col">
                {data.languages.map((lang, i) => (
                  <span key={i} className="cv-tag">
                    {lang}
                    <button onClick={() => removeTag("languages", i)}>✕</button>
                  </span>
                ))}
              </div>
              <div className="cv-tag-input">
                <input
                  value={langInput}
                  onChange={(e) => setLangInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag("languages", langInput);
                      setLangInput("");
                    }
                  }}
                  placeholder="e.g. English (Fluent)"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT: Preview ===== */}
        <div className="cv-preview-panel">
          <div className="cv-preview-panel__header">
            <h3><ClipboardList size={14} /> Live Preview</h3>
          </div>
          <div className="cv-preview">
            {/* Name */}
            {data.personal_info.full_name && (
              <h1 className="cv-preview__name">{data.personal_info.full_name}</h1>
            )}
            {/* Contact */}
            {(() => {
              const pi = data.personal_info;
              const parts = [pi.email, pi.phone, pi.location, pi.linkedin, pi.github, pi.website].filter(Boolean);
              return parts.length > 0 ? <p className="cv-preview__contact">{parts.join(" • ")}</p> : null;
            })()}

            {/* Summary */}
            {data.summary && (
              <>
                <h2 className="cv-preview__section">Professional Summary</h2>
                <p className="cv-preview__text">{data.summary}</p>
              </>
            )}

            {/* Experience */}
            {data.experience.some((e) => e.position || e.company) && (
              <>
                <h2 className="cv-preview__section">Work Experience</h2>
                {data.experience.filter((e) => e.position || e.company).map((exp, i) => (
                  <div key={i} className="cv-preview__entry">
                    <div className="cv-preview__entry-title">
                      <strong>{exp.position}</strong>{exp.company ? ` — ${exp.company}` : ""}
                    </div>
                    <div className="cv-preview__entry-meta">
                      {[exp.start_date, exp.current ? "Present" : exp.end_date, exp.location].filter(Boolean).join(" | ")}
                    </div>
                    {exp.description && <p className="cv-preview__text">{exp.description}</p>}
                    {exp.highlights.filter(Boolean).length > 0 && (
                      <ul className="cv-preview__bullets">
                        {exp.highlights.filter(Boolean).map((h, j) => <li key={j}>{h}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Education */}
            {data.education.some((e) => e.institution || e.degree) && (
              <>
                <h2 className="cv-preview__section">Education</h2>
                {data.education.filter((e) => e.institution || e.degree).map((edu, i) => (
                  <div key={i} className="cv-preview__entry">
                    <div className="cv-preview__entry-title">
                      <strong>{edu.degree}{edu.field_of_study ? ` in ${edu.field_of_study}` : ""}</strong>
                    </div>
                    <div className="cv-preview__entry-meta">
                      {[edu.institution, edu.start_date && `${edu.start_date} – ${edu.end_date || "Present"}`, edu.gpa && `GPA: ${edu.gpa}`].filter(Boolean).join(" | ")}
                    </div>
                    {edu.description && <p className="cv-preview__text">{edu.description}</p>}
                  </div>
                ))}
              </>
            )}

            {/* Skills */}
            {data.skills.length > 0 && (
              <>
                <h2 className="cv-preview__section">Skills</h2>
                <p className="cv-preview__text">{data.skills.join(" • ")}</p>
              </>
            )}

            {/* Projects */}
            {data.projects.some((p) => p.name) && (
              <>
                <h2 className="cv-preview__section">Projects</h2>
                {data.projects.filter((p) => p.name).map((proj, i) => (
                  <div key={i} className="cv-preview__entry">
                    <div className="cv-preview__entry-title">
                      <strong>{proj.name}</strong>{proj.technologies ? ` — ${proj.technologies}` : ""}
                    </div>
                    {proj.description && <p className="cv-preview__text">{proj.description}</p>}
                    {proj.url && <p className="cv-preview__link">{proj.url}</p>}
                  </div>
                ))}
              </>
            )}

            {/* Certifications */}
            {data.certifications.length > 0 && (
              <>
                <h2 className="cv-preview__section">Certifications</h2>
                <ul className="cv-preview__bullets">
                  {data.certifications.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </>
            )}

            {/* Awards */}
            {data.awards.length > 0 && (
              <>
                <h2 className="cv-preview__section">Awards & Achievements</h2>
                <ul className="cv-preview__bullets">
                  {data.awards.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </>
            )}

            {/* Languages */}
            {data.languages.length > 0 && (
              <>
                <h2 className="cv-preview__section">Languages</h2>
                <p className="cv-preview__text">{data.languages.join(" • ")}</p>
              </>
            )}

            {/* Empty state */}
            {!data.personal_info.full_name && !data.summary && data.skills.length === 0 && (
              <div className="cv-preview__empty">
                <span>📝</span>
                <p>Start filling in the form to see your CV preview here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"""
CareerPilot — Fit Score Computation Service
=============================================
Programmatic fit score calculation between a user's CV and a job description.
NOT LLM-guessed — uses keyword extraction, Jaccard similarity, and weighted scoring.

Formula: fit_score = 0.5 * skill_match + 0.3 * experience_match + 0.2 * education_match
Returns a score from 0–100 with a detailed breakdown.
"""

import re
from collections import Counter

# ============================
#  Skills Taxonomy
# ============================
# A comprehensive list of tech/professional skills for matching.
# Grouped by category for better matching accuracy.

SKILLS_TAXONOMY = {
    # Programming Languages
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "julia",
    "html", "css", "sql", "bash", "shell", "perl", "lua", "dart",

    # Frameworks & Libraries
    "react", "angular", "vue", "next.js", "nextjs", "nuxt", "svelte",
    "django", "flask", "fastapi", "express", "nest.js", "spring", "spring boot",
    "rails", "laravel", "asp.net", ".net", "flutter", "react native",
    "tensorflow", "pytorch", "keras", "scikit-learn", "sklearn", "pandas",
    "numpy", "scipy", "matplotlib", "opencv", "huggingface", "langchain",
    "tailwind", "bootstrap", "material ui", "chakra ui",

    # Cloud & DevOps
    "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "k8s",
    "terraform", "ansible", "jenkins", "ci/cd", "github actions", "gitlab ci",
    "nginx", "apache", "linux", "unix",

    # Databases
    "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch",
    "dynamodb", "cassandra", "sqlite", "oracle", "firebase", "supabase",
    "neo4j", "graphql", "prisma",

    # AI/ML
    "machine learning", "deep learning", "nlp", "natural language processing",
    "computer vision", "reinforcement learning", "generative ai", "llm",
    "large language model", "rag", "retrieval augmented generation",
    "transformers", "bert", "gpt", "fine-tuning", "prompt engineering",
    "data science", "data analysis", "data engineering", "etl",
    "statistics", "a/b testing",

    # Other Technical
    "git", "agile", "scrum", "rest api", "restful", "microservices",
    "system design", "distributed systems", "api design", "websocket",
    "testing", "unit testing", "integration testing", "tdd",
    "security", "oauth", "jwt", "encryption",

    # Soft Skills & Business
    "leadership", "project management", "communication", "teamwork",
    "problem solving", "critical thinking", "presentation", "mentoring",
    "product management", "stakeholder management",
}

# Education level hierarchy (higher number = higher level)
EDUCATION_LEVELS = {
    "phd": 5, "doctorate": 5, "ph.d": 5,
    "master": 4, "masters": 4, "msc": 4, "m.s.": 4, "mba": 4, "m.a.": 4,
    "bachelor": 3, "bachelors": 3, "bsc": 3, "b.s.": 3, "b.a.": 3, "b.tech": 3, "b.e.": 3,
    "associate": 2, "diploma": 2,
    "high school": 1, "secondary": 1, "hsc": 1, "ssc": 1,
}


def extract_skills(text: str) -> set[str]:
    """
    Extract recognized skills from a text block.
    Uses case-insensitive matching against the skills taxonomy.
    """
    text_lower = text.lower()
    found_skills = set()

    for skill in SKILLS_TAXONOMY:
        # Use word boundary matching for short skills to avoid false positives
        if len(skill) <= 3:
            pattern = rf"\b{re.escape(skill)}\b"
            if re.search(pattern, text_lower):
                found_skills.add(skill)
        else:
            if skill in text_lower:
                found_skills.add(skill)

    return found_skills


def extract_years_of_experience(text: str) -> float:
    """
    Extract years of experience from text.
    Looks for patterns like "5+ years", "3-5 years experience", etc.
    """
    patterns = [
        r"(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)",
        r"(\d+)\s*-\s*(\d+)\s*(?:years?|yrs?)",
        r"experience\s*:?\s*(\d+)\+?\s*(?:years?|yrs?)",
    ]

    years = []
    for pattern in patterns:
        matches = re.findall(pattern, text.lower())
        for match in matches:
            if isinstance(match, tuple):
                # Range: take the average
                nums = [float(m) for m in match if m]
                years.append(sum(nums) / len(nums))
            else:
                years.append(float(match))

    return max(years) if years else 0


def extract_education_level(text: str) -> int:
    """
    Extract the highest education level mentioned in text.
    Returns a numeric level (1-5) for comparison.
    """
    text_lower = text.lower()
    max_level = 0

    for keyword, level in EDUCATION_LEVELS.items():
        if keyword in text_lower:
            max_level = max(max_level, level)

    return max_level


def compute_fit_score(cv_text: str, job_description: str) -> dict:
    """
    Compute a programmatic fit score between a CV and a job description.

    Scoring Formula:
    - Skill Match (50%): Jaccard similarity of skills found in both texts
    - Experience Match (30%): How well CV experience meets job requirements
    - Education Match (20%): Education level alignment

    Returns:
        {
            "score": float (0-100),
            "breakdown": {
                "skill_match": float,
                "experience_match": float,
                "education_match": float,
            },
            "matched_skills": list[str],
            "missing_skills": list[str],
            "match_reasons": list[str],
        }
    """
    # --- Extract features ---
    cv_skills = extract_skills(cv_text)
    jd_skills = extract_skills(job_description)
    cv_years = extract_years_of_experience(cv_text)
    jd_years = extract_years_of_experience(job_description)
    cv_edu = extract_education_level(cv_text)
    jd_edu = extract_education_level(job_description)

    # --- Skill Match (Jaccard-inspired, weighted toward JD requirements) ---
    if jd_skills:
        matched_skills = cv_skills & jd_skills
        # How many of the JD's required skills does the CV have?
        skill_recall = len(matched_skills) / len(jd_skills) if jd_skills else 0
        # Bonus for having extra relevant skills
        skill_precision = len(matched_skills) / len(cv_skills) if cv_skills else 0
        skill_score = (0.7 * skill_recall + 0.3 * skill_precision) * 100
    else:
        # No skills detected in JD — use general overlap
        matched_skills = cv_skills & jd_skills
        skill_score = 70  # Default moderate score
    missing_skills = jd_skills - cv_skills

    # --- Experience Match ---
    if jd_years > 0:
        if cv_years >= jd_years:
            experience_score = 100
        elif cv_years >= jd_years * 0.7:
            experience_score = 80
        elif cv_years >= jd_years * 0.5:
            experience_score = 60
        else:
            experience_score = max(30, (cv_years / jd_years) * 100)
    else:
        experience_score = 75  # No years specified in JD

    # --- Education Match ---
    if jd_edu > 0:
        if cv_edu >= jd_edu:
            education_score = 100
        elif cv_edu == jd_edu - 1:
            education_score = 70
        else:
            education_score = 40
    else:
        education_score = 80  # No education requirement specified

    # --- Weighted Final Score ---
    final_score = round(
        0.5 * skill_score +
        0.3 * experience_score +
        0.2 * education_score,
        1
    )

    # --- Generate match reasons ---
    match_reasons = []
    if matched_skills:
        top_matches = sorted(matched_skills)[:5]
        match_reasons.append(f"You have {len(matched_skills)} matching skills: {', '.join(top_matches)}")
    if cv_years >= jd_years and jd_years > 0:
        match_reasons.append(f"Your {cv_years:.0f}+ years of experience meets the {jd_years:.0f} year requirement")
    if cv_edu >= jd_edu and jd_edu > 0:
        match_reasons.append("Your education level meets or exceeds requirements")
    if missing_skills:
        top_missing = sorted(missing_skills)[:3]
        match_reasons.append(f"Consider developing: {', '.join(top_missing)}")

    return {
        "score": min(100, max(0, final_score)),
        "breakdown": {
            "skill_match": round(skill_score, 1),
            "experience_match": round(experience_score, 1),
            "education_match": round(education_score, 1),
        },
        "matched_skills": sorted(matched_skills),
        "missing_skills": sorted(missing_skills),
        "match_reasons": match_reasons,
    }

/**
 * CareerPilot — Login / Register Page
 * ======================================
 * Premium authentication page with glassmorphism card,
 * animated gradient background, and tabbed login/register forms.
 */

"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Compass, User } from "lucide-react";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (isRegister) {
      if (!name.trim()) {
        setError("Please enter your name.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);
    try {
      if (isRegister) {
        await register(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Authentication failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Demo user one-click login
  const handleDemoLogin = async () => {
    setError("");
    setIsRegister(false);
    setEmail("user@example.com");
    setPassword("user");
    setLoading(true);
    try {
      await login("user@example.com", "user");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Demo login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Animated background orbs */}
      <div className="auth-page__bg">
        <div className="auth-page__orb auth-page__orb--1" />
        <div className="auth-page__orb auth-page__orb--2" />
        <div className="auth-page__orb auth-page__orb--3" />
      </div>

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-card__logo">
          <span className="auth-card__logo-icon"><Compass size={24} /></span>
          <h1 className="auth-card__logo-text">CareerPilot</h1>
          <p className="auth-card__logo-sub">AI Career Co-Pilot</p>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${!isRegister ? "auth-tab--active" : ""}`}
            onClick={() => { setIsRegister(false); setError(""); }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${isRegister ? "auth-tab--active" : ""}`}
            onClick={() => { setIsRegister(true); setError(""); }}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {isRegister && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-name">
                Full Name
              </label>
              <input
                id="auth-name"
                className="auth-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">
              Email Address
            </label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
          </div>

          {isRegister && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-confirm-password">
                Confirm Password
              </label>
              <input
                id="auth-confirm-password"
                className="auth-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="auth-error">
              ⚠️ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-submit__loading">
                <span className="auth-submit__spinner" />
                {isRegister ? "Creating Account..." : "Signing In..."}
              </span>
            ) : (
              isRegister ? "Create Account" : "Sign In"
            )}
          </button>

          {/* Demo User Quick Login */}
          {!isRegister && (
            <button
              type="button"
              className="auth-demo-btn"
              onClick={handleDemoLogin}
              disabled={loading}
            >
              <User size={15} />
              Demo User Login
            </button>
          )}
        </form>

        {/* Footer */}
        <p className="auth-card__footer">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <button
                className="auth-link"
                onClick={() => { setIsRegister(false); setError(""); }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <button
                className="auth-link"
                onClick={() => { setIsRegister(true); setError(""); }}
              >
                Create one
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

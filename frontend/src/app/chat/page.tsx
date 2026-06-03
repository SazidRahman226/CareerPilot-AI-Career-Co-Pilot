/**
 * CareerPilot — AI Assistant Chat Page
 * =======================================
 * Full-page chat interface with message history, suggested prompts,
 * and streaming AI responses grounded in the user's CV.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { useChat, type Message } from "@/hooks/use-chat";
import {
  User,
  Bot,
  Trash2,
  RefreshCw,
  Send,
  Loader2,
  FileText,
} from "lucide-react";

const SUGGESTED_PROMPTS = [
  "Am I ready for a Machine Learning role?",
  "What skills am I missing for a Senior SWE position?",
  "Build me a 3-month learning roadmap",
  "Draft a cover letter for a data science role",
  "What are my strongest technical skills?",
  "Find ML internships in Dhaka",
];

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={`message message--${message.role}`}>
      <div className="message__avatar">
        {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div>
        <div className="message__bubble">
          {message.isLoading ? (
            <div className="loading-dots">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <div
              dangerouslySetInnerHTML={{
                __html: formatMessage(message.content),
              }}
            />
          )}
        </div>
        {/* Source tags */}
        {message.sources && message.sources.length > 0 && (
          <div className="message__sources">
            {message.sources.map((source, i) => (
              <span key={i} className="message__source-tag">
                <FileText size={10} /> {source}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Simple markdown-like formatting for AI responses.
 * Handles bold, headers, lists, code blocks, and links.
 */
function formatMessage(content: string): string {
  if (!content) return "";

  let html = content
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  return html;
}

export default function ChatPage() {
  const { messages, isLoading, historyLoading, sendMessage, clearMessages, refreshChat } = useChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestion = (prompt: string) => {
    sendMessage(prompt);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-header__title">AI Assistant</h1>
          <p className="page-header__subtitle">
            Your career co-pilot — grounded in your CV. Ask anything about your career.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {historyLoading ? (
            <button className="btn btn--ghost" disabled>
              <Loader2 size={14} className="spin" /> Refreshing...
            </button>
          ) : (
            <button className="btn btn--ghost" onClick={refreshChat} title="Refresh chat from server">
              <RefreshCw size={14} /> Refresh
            </button>
          )}
          {messages.length > 0 && (
            <button className="btn btn--ghost" onClick={clearMessages}>
              <Trash2 size={14} /> Clear Chat
            </button>
          )}
        </div>
      </div>

      {/* Chat Container */}
      <div className="chat-container">
        {/* Messages Area */}
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-state" style={{ margin: "auto" }}>
              <div className="empty-state__icon"><Bot size={40} /></div>
              <h3 className="empty-state__title">How can I help you today?</h3>
              <p className="empty-state__text">
                I&apos;m your AI career co-pilot. Ask me about job readiness, skill gaps,
                cover letters, interview prep, or anything career-related.
              </p>

              {/* Suggested Prompts */}
              <div className="chat-suggestions" style={{ justifyContent: "center", marginTop: 24 }}>
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    className="chat-suggestion"
                    onClick={() => handleSuggestion(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-area">
          {/* Suggestions when there are messages */}
          {messages.length > 0 && messages.length < 4 && (
            <div className="chat-suggestions">
              {SUGGESTED_PROMPTS.slice(0, 3).map((prompt, i) => (
                <button
                  key={i}
                  className="chat-suggestion"
                  onClick={() => handleSuggestion(prompt)}
                  disabled={isLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="chat-input-wrapper">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your career..."
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="btn btn--primary btn--icon"
              disabled={!input.trim() || isLoading}
              title="Send message"
            >
              {isLoading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

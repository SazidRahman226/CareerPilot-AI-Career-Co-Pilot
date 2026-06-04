/**
 * CareerPilot — useChat Custom Hook
 * ====================================
 * Manages chat state, message history, and API communication
 * for the AI Assistant interface.
 * Messages are persisted in the backend database (PostgreSQL).
 * On mount, loads history from GET /api/chat/history/{conversation_id}.
 * On send, backend saves user + AI messages to the DB.
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  sendChatMessage,
  getChatHistory,
  clearChatHistory,
  type ChatResponse,
} from "@/lib/api";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;  // ISO string for JSON serialization
  sources?: string[];
  isLoading?: boolean;
}

export function useChat(conversationId: string = "default") {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const messageIdCounter = useRef(0);

  /**
   * Merge DB-loaded messages into existing local state.
   *
   * Deduplication uses the **database id** (the `db-{id}` prefix) so that
   * legitimately repeated questions each keep their own row.  Optimistic
   * `msg-*` entries are matched by role+content and replaced by their DB
   * counterpart once the history reload delivers the persisted copy.
   */
  const mergeHistory = useCallback((loaded: Message[]) => {
    setMessages((prev: Message[]) => {
      // Deduplicate the incoming DB list by unique database id.
      const seenDbIds = new Set<string>();
      const uniqueLoaded: Message[] = [];
      for (const m of loaded) {
        if (seenDbIds.has(m.id)) continue;
        seenDbIds.add(m.id);
        uniqueLoaded.push(m);
      }

      // Remove optimistic (`msg-*`) entries whose content already appears
      // in the DB payload — but only consume each DB match once so that
      // two identical questions don't both swallow the same optimistic entry.
      const dbMatchUsed = new Set<string>();
      const cleanedPrev: Message[] = prev.filter((p: Message) => {
        if (!p.id.startsWith("msg-")) return true;           // keep db-* entries
        const match = uniqueLoaded.find(
          (l: Message) =>
            !dbMatchUsed.has(l.id) &&
            l.role === p.role &&
            l.content.trim() === p.content.trim()
        );
        if (match) {
          dbMatchUsed.add(match.id);                          // consume the match
          return false;                                       // drop the optimistic entry
        }
        return true;                                          // no DB match yet — keep it
      });

      // Append DB entries that aren't already present (by id).
      const existingIds = new Set(cleanedPrev.map((m) => m.id));
      const merged: Message[] = [...cleanedPrev];
      for (const l of uniqueLoaded) {
        if (!existingIds.has(l.id)) {
          merged.push(l);
        }
      }

      merged.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      return merged;
    });
  }, []);

  // Clear messages and reload chat history from backend on each mount
  useEffect(() => {
    setMessages([]);
    setHistoryLoading(true);

    getChatHistory(conversationId)
      .then((history) => {
        if (history.messages.length > 0) {
          const loaded: Message[] = history.messages.map((msg) => ({
            id: `db-${msg.id}`,
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.timestamp || new Date().toISOString(),
            sources: msg.sources || [],
          }));
          mergeHistory(loaded);
          messageIdCounter.current = loaded.length + 1;
        }
      })
      .catch((err) => {
        console.error("Failed to load chat history:", err);
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }, [conversationId, mergeHistory]);

  const generateId = () => {
    messageIdCounter.current += 1;
    return `msg-${Date.now()}-${messageIdCounter.current}`;
  };

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      const aiPlaceholder: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isLoading: true,
      };

      setMessages((prev: Message[]) => [...prev, userMessage, aiPlaceholder]);
      setIsLoading(true);

      try {
        const response: ChatResponse = await sendChatMessage(
          content.trim(),
          conversationId
        );

        setMessages((prev: Message[]) =>
          prev.map((msg: Message) =>
            msg.id === aiPlaceholder.id
              ? {
                  ...msg,
                  content: response.response,
                  sources: response.sources,
                  isLoading: false,
                }
              : msg
          )
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send message";

        setMessages((prev: Message[]) =>
          prev.map((msg: Message) =>
            msg.id === aiPlaceholder.id
              ? {
                  ...msg,
                  content: `⚠️ ${errorMessage}`,
                  isLoading: false,
                }
              : msg
          )
        );
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, isLoading]
  );

  const clearMessages = useCallback(async () => {
    setMessages([]);
    setError(null);
    try {
      await clearChatHistory(conversationId);
    } catch {
      // Non-critical — UI is already cleared
    }
  }, [conversationId]);

  const refreshChat = useCallback(async () => {
    setHistoryLoading(true);
    setError(null);

    getChatHistory(conversationId)
      .then((history) => {
        if (history.messages.length > 0) {
          const loaded: Message[] = history.messages.map((msg) => ({
            id: `db-${msg.id}`,
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.timestamp || new Date().toISOString(),
            sources: msg.sources || [],
          }));
          mergeHistory(loaded);
          messageIdCounter.current = loaded.length + 1;
        } else {
          setMessages([]);
        }
      })
      .catch((err) => {
        console.error("Failed to refresh chat history:", err);
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }, [conversationId, mergeHistory]);

  return {
    messages,
    isLoading,
    error,
    historyLoading,
    sendMessage,
    clearMessages,
    refreshChat,
  };
}

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
   * Merge DB-loaded messages into existing local state, dropping duplicates
   * by role+content. Handles two cases:
   *   - Optimistic `msg-*` entries that were just persisted come back from
   *     the DB as `db-*` entries, so we drop the optimistic copy.
   *   - Pre-existing duplicate rows in the DB (from before the backend
   *     dedupe guard) collapse to a single message in the UI.
   */
  const mergeHistory = useCallback((loaded: Message[]) => {
    setMessages((prev: Message[]) => {
      // Collapse the incoming DB list, keeping the oldest copy.
      const seenDb = new Set<string>();
      const uniqueLoaded: Message[] = [];
      for (const m of loaded) {
        const key = `${m.role}::${m.content.trim()}`;
        if (seenDb.has(key)) continue;
        seenDb.add(key);
        uniqueLoaded.push(m);
      }

      const isDuplicate = (a: Message, b: Message) => {
        if (a.role !== b.role) return false;
        return a.content.trim() === b.content.trim();
      };

      const cleanedPrev: Message[] = prev.filter(
        (p: Message) => !p.id.startsWith("msg-") || !uniqueLoaded.some((l: Message) => isDuplicate(p, l))
      );

      const merged: Message[] = [...cleanedPrev];
      for (const l of uniqueLoaded) {
        if (!cleanedPrev.some((p: Message) => isDuplicate(p, l))) {
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

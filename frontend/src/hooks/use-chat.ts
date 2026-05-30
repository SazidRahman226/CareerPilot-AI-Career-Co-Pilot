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

  // Clear messages and reload chat history from backend on each mount
  useEffect(() => {
    setMessages([]);
    setHistoryLoading(true);

    getChatHistory(conversationId)
      .then((history) => {
        if (history.messages.length > 0) {
          const loaded: Message[] = history.messages.map((msg, i) => ({
            id: `db-${msg.id}`,
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.timestamp || new Date().toISOString(),
            sources: msg.sources || [],
          }));
          setMessages(loaded);
          messageIdCounter.current = loaded.length + 1;
        }
      })
      .catch((err) => {
        console.error("Failed to load chat history:", err);
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }, [conversationId]);

  const generateId = () => {
    messageIdCounter.current += 1;
    return `msg-${Date.now()}-${messageIdCounter.current}`;
  };

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      // Add user message to local state immediately (optimistic)
      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };

      // Add placeholder for AI response
      const aiPlaceholder: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, aiPlaceholder]);
      setIsLoading(true);

      try {
        // Backend saves user message + AI response to DB, then returns response
        const response: ChatResponse = await sendChatMessage(
          content.trim(),
          conversationId
        );

        // Replace placeholder with actual response
        setMessages((prev) =>
          prev.map((msg) =>
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

        // Replace placeholder with error message
        setMessages((prev) =>
          prev.map((msg) =>
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
    // Clear from backend database
    try {
      await clearChatHistory(conversationId);
    } catch {
      // Non-critical — UI is already cleared
    }
  }, [conversationId]);

  const refreshChat = useCallback(async () => {
    setMessages([]);
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
          setMessages(loaded);
          messageIdCounter.current = loaded.length + 1;
        }
      })
      .catch((err) => {
        console.error("Failed to refresh chat history:", err);
      })
      .finally(() => {
        setHistoryLoading(false);
      });
  }, [conversationId]);

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

/**
 * CareerPilot — useChat Custom Hook
 * ====================================
 * Manages chat state, message history, and API communication
 * for the AI Assistant interface.
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { sendChatMessage, type ChatResponse } from "@/lib/api";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: string[];
  isLoading?: boolean;
}

export function useChat(conversationId: string = "default") {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageIdCounter = useRef(0);

  const generateId = () => {
    messageIdCounter.current += 1;
    return `msg-${Date.now()}-${messageIdCounter.current}`;
  };

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      // Add user message
      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      // Add placeholder for AI response
      const aiPlaceholder: Message = {
        id: generateId(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isLoading: true,
      };

      setMessages((prev) => [...prev, userMessage, aiPlaceholder]);
      setIsLoading(true);

      try {
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

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
  };
}

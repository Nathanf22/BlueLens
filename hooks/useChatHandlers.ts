import { useState, useCallback, useRef } from 'react';
import { ChatMessage, ChatSession, LLMSettings, Diagram } from '../types';
import { llmService } from '../services/llmService';
import { aiChatService } from '../services/aiChatService';

export const useChatHandlers = (
  activeDiagram: Diagram | undefined,
  updateActiveDiagram: (updates: Partial<Diagram>) => void,
  llmSettings: LLMSettings
) => {
  const [chatSessions, setChatSessions] = useState<Map<string, ChatSession>>(new Map());
  const [isAIChatLoading, setIsAIChatLoading] = useState(false);
  const sessionIdRef = useRef(0);

  const getSession = useCallback((diagramId: string): ChatSession => {
    const existing = chatSessions.get(diagramId);
    if (existing) return existing;
    return { diagramId, messages: [] };
  }, [chatSessions]);

  const chatSession = activeDiagram ? getSession(activeDiagram.id) : null;

  const sendChatMessage = useCallback(async (text: string) => {
    if (!activeDiagram || !text.trim()) return;

    const diagramId = activeDiagram.id;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-${++sessionIdRef.current}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    // Add user message immediately
    setChatSessions(prev => {
      const next = new Map(prev);
      const session = next.get(diagramId) || { diagramId, messages: [] };
      next.set(diagramId, { ...session, messages: [...session.messages, userMsg] });
      return next;
    });

    setIsAIChatLoading(true);

    try {
      const currentCode = activeDiagram.code;
      const systemPrompt = aiChatService.buildDiagramChatSystemPrompt(currentCode);

      // Build full message history including the new user message
      const session = chatSessions.get(diagramId) || { diagramId, messages: [] };
      const allMessages = [...session.messages, userMsg];
      const llmMessages = aiChatService.chatMessagesToLLMMessages(allMessages);

      const response = await llmService.sendMessage(llmMessages, systemPrompt, llmSettings);

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-${++sessionIdRef.current}`,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        diagramCodeSnapshot: aiChatService.extractMermaidFromResponse(response.content) || undefined,
      };

      setChatSessions(prev => {
        const next = new Map(prev);
        const s = next.get(diagramId) || { diagramId, messages: [] };
        next.set(diagramId, { ...s, messages: [...s.messages, assistantMsg] });
        return next;
      });
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-${++sessionIdRef.current}`,
        role: 'assistant',
        content: `Error: ${err.message || 'Failed to get response'}`,
        timestamp: Date.now(),
      };

      setChatSessions(prev => {
        const next = new Map(prev);
        const s = next.get(diagramId) || { diagramId, messages: [] };
        next.set(diagramId, { ...s, messages: [...s.messages, errorMsg] });
        return next;
      });
    } finally {
      setIsAIChatLoading(false);
    }
  }, [activeDiagram, chatSessions, llmSettings]);

  const applyCodeFromMessage = useCallback((msg: ChatMessage) => {
    if (!msg.diagramCodeSnapshot) return;
    updateActiveDiagram({ code: msg.diagramCodeSnapshot });

    // Mark message as applied
    if (!activeDiagram) return;
    setChatSessions(prev => {
      const next = new Map(prev);
      const session = next.get(activeDiagram.id);
      if (!session) return prev;
      next.set(activeDiagram.id, {
        ...session,
        messages: session.messages.map(m =>
          m.id === msg.id ? { ...m, appliedToCode: true } : m
        ),
      });
      return next;
    });
  }, [activeDiagram, updateActiveDiagram]);

  const clearChat = useCallback(() => {
    if (!activeDiagram) return;
    setChatSessions(prev => {
      const next = new Map(prev);
      next.delete(activeDiagram.id);
      return next;
    });
  }, [activeDiagram]);

  return {
    chatSession,
    isAIChatLoading,
    sendChatMessage,
    applyCodeFromMessage,
    clearChat,
  };
};

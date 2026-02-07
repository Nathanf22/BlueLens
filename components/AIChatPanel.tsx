import React, { useState, useRef, useEffect } from 'react';
import { X, Send, MessageSquare, Trash2, Check, Loader2 } from 'lucide-react';
import { ChatMessage, ChatSession, LLMSettings } from '../types';
import { aiChatService } from '../services/aiChatService';

interface AIChatPanelProps {
  chatSession: ChatSession | null;
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onApplyCode: (msg: ChatMessage) => void;
  onClearChat: () => void;
  onClose: () => void;
  activeProvider: LLMSettings['activeProvider'];
}

const SUGGESTION_CHIPS = [
  'Add a caching layer',
  'Convert to sequence diagram',
  'Add error handling flow',
  'Add a database node',
];

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  chatSession,
  isLoading,
  onSendMessage,
  onApplyCode,
  onClearChat,
  onClose,
  activeProvider,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = chatSession?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === 'user';
    const hasMermaidCode = !!msg.diagramCodeSnapshot;

    return (
      <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
            isUser
              ? 'bg-brand-600/30 text-gray-200'
              : 'bg-dark-800 text-gray-300 border border-gray-700'
          }`}
        >
          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          {hasMermaidCode && (
            <button
              onClick={() => onApplyCode(msg)}
              disabled={msg.appliedToCode}
              className={`mt-2 flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                msg.appliedToCode
                  ? 'bg-green-900/30 text-green-400 cursor-default'
                  : 'bg-brand-600/20 text-brand-400 hover:bg-brand-600/40'
              }`}
            >
              {msg.appliedToCode ? (
                <>
                  <Check className="w-3 h-3" />
                  Applied
                </>
              ) : (
                'Apply to diagram'
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full border-l border-gray-700 bg-dark-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-dark-800 min-h-[40px]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-brand-400" />
          <span className="text-sm text-gray-200 font-medium">AI Chat</span>
          <span className="text-xs px-1.5 py-0.5 bg-dark-700 text-gray-400 rounded">
            {activeProvider}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={onClearChat}
              className="p-1 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200 transition-colors"
            title="Close AI chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <MessageSquare className="w-8 h-8 text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 mb-4">
              Ask the AI to modify your diagram using natural language.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTION_CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => onSendMessage(chip)}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-700 text-gray-400 hover:border-brand-500 hover:text-brand-400 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-dark-800 border border-gray-700 rounded-lg px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
              <span className="text-xs text-gray-400">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe changes..."
            rows={1}
            className="flex-1 bg-dark-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 resize-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none placeholder-gray-600"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

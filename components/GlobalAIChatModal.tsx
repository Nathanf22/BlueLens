import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Loader2, Check, Trash2, ChevronDown, ChevronRight, Wrench, RotateCw, Square } from 'lucide-react';
import { ChatMessage, LLMSettings, AgentToolStep } from '../types';
import { MarkdownContent } from './MarkdownContent';

interface GlobalAIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onClearMessages: () => void;
  onApplyToDiagram: (code: string) => void;
  onCreateDiagram: (code: string) => void;
  onContinue: (msg: ChatMessage) => void;
  onCancel: () => void;
  hasActiveDiagram: boolean;
  activeProvider: LLMSettings['activeProvider'];
}

export const GlobalAIChatModal: React.FC<GlobalAIChatModalProps> = ({
  isOpen,
  onClose,
  messages,
  isLoading,
  onSend,
  onClearMessages,
  onApplyToDiagram,
  onCreateDiagram,
  onContinue,
  onCancel,
  hasActiveDiagram,
  activeProvider,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading, lastMsg?.toolSteps?.length, lastMsg?.content]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleApply = (msg: ChatMessage) => {
    if (!msg.diagramCodeSnapshot) return;
    onApplyToDiagram(msg.diagramCodeSnapshot);
    setAppliedIds(prev => new Set(prev).add(msg.id));
  };

  const ToolSteps = ({ steps, forceOpen }: { steps: AgentToolStep[]; forceOpen?: boolean }) => {
    const [open, setOpen] = useState(false);
    const isOpen = forceOpen || open;
    return (
      <div className="mb-2 rounded-lg border border-gray-800 overflow-hidden text-xs">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-900/60 text-gray-500 hover:text-gray-400 transition-colors text-left"
        >
          {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
          <Wrench className="w-3 h-3 shrink-0" />
          <span>{steps.length} tool call{steps.length !== 1 ? 's' : ''}</span>
        </button>
        {isOpen && (
          <div className="divide-y divide-gray-800">
            {steps.map((s, i) => (
              <div key={i} className="px-2.5 py-1.5 bg-gray-950/40">
                <div className="font-mono text-gray-400">{s.label}</div>
                <div className="mt-0.5 text-gray-600 truncate">{s.result.slice(0, 120)}{s.result.length > 120 ? '…' : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === 'user';
    const hasCode = !!msg.diagramCodeSnapshot;
    const isApplied = appliedIds.has(msg.id) || !!msg.appliedToCode;
    const isPending = !isUser && msg.content === '' && !msg.interrupted && !msg.stopped;
    const isInterrupted = !isUser && !!msg.interrupted;
    const isStopped = !isUser && !!msg.stopped;

    return (
      <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        {isUser ? (
          <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm bg-gray-800 text-gray-200">
            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          </div>
        ) : (
          <div className="max-w-[90%] text-sm text-gray-300">
            {msg.toolSteps && msg.toolSteps.length > 0 && (
              <ToolSteps steps={msg.toolSteps} forceOpen={isPending} />
            )}
            {isPending ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                Thinking...
              </div>
            ) : isInterrupted ? (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-500">Reached 20 iterations.</span>
                <button
                  onClick={() => onContinue(msg)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-600/20 text-brand-400 hover:bg-brand-600/40 border border-brand-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCw className="w-3 h-3" />
                  Continue
                </button>
              </div>
            ) : isStopped ? (
              <span className="text-xs text-gray-600 mt-1 block">Stopped.</span>
            ) : (
              <MarkdownContent content={msg.content} />
            )}
            {hasCode && (
              <div className="mt-2 flex flex-wrap gap-2">
                {hasActiveDiagram && (
                  <button
                    onClick={() => handleApply(msg)}
                    disabled={isApplied}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      isApplied
                        ? 'bg-green-900/30 text-green-400 cursor-default'
                        : 'bg-brand-600/20 text-brand-400 hover:bg-brand-600/40 border border-brand-600/30'
                    }`}
                  >
                    {isApplied ? (
                      <><Check className="w-3 h-3" /> Applied</>
                    ) : (
                      'Apply to diagram'
                    )}
                  </button>
                )}
                <button
                  onClick={() => onCreateDiagram(msg.diagramCodeSnapshot!)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors"
                >
                  + Create new diagram
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl flex flex-col bg-[#0d0d0d] border border-gray-800 rounded-xl shadow-2xl"
        style={{ height: 'min(70vh, 640px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-semibold text-white">Ask AI</span>
            <span className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded font-mono">
              {activeProvider}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={onClearMessages}
                className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <Sparkles className="w-8 h-8 text-gray-700" />
              <div>
                <p className="text-sm text-gray-400 font-medium">Ask me anything</p>
                <p className="text-xs text-gray-600 mt-1">
                  Generate diagrams, explain architecture, or ask about your codebase.
                </p>
              </div>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 px-4 py-3 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question or describe a diagram..."
              rows={1}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 resize-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none placeholder-gray-600 min-h-[38px] max-h-32"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
            {isLoading ? (
              <button
                onClick={onCancel}
                className="p-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 transition-colors shrink-0"
                title="Stop"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                title="Send (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-700 mt-1.5">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
};

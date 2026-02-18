import React, { useState } from 'react';
import { X, Check, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { Button } from './Button';
import { LLMProvider, LLMProviderConfig, LLMSettings } from '../types';
import { llmService } from '../services/llmService';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  llmSettings: LLMSettings;
  onUpdateProvider: (provider: LLMProvider, config: LLMProviderConfig | null) => void;
  onSetActiveProvider: (provider: LLMProvider) => void;
}

const PROVIDER_INFO: Record<LLMProvider, { label: string; description: string }> = {
  gemini: { label: 'Google Gemini', description: 'Uses the Gemini API.' },
  openai: { label: 'OpenAI', description: 'GPT-5.2, GPT-4.1, o3, o4-mini and other models.' },
  anthropic: { label: 'Anthropic', description: 'Claude models. Requires a CORS proxy for browser use.' },
};

/** Known models per provider. The first entry is the service default. */
const PROVIDER_MODELS: Record<LLMProvider, { id: string; label: string }[]> = {
  gemini: [
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { id: 'gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash Preview' },
    { id: 'gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro Preview' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5.1', label: 'GPT-5.1' },
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'o3', label: 'o3' },
    { id: 'o3-pro', label: 'o3 Pro' },
    { id: 'o4-mini', label: 'o4-mini' },
    { id: 'o1', label: 'o1' },
    { id: 'o1-mini', label: 'o1-mini' },
  ],
};

const PROVIDER_ORDER: LLMProvider[] = ['gemini', 'anthropic', 'openai'];

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  llmSettings,
  onUpdateProvider,
  onSetActiveProvider,
}) => {
  const [testingProvider, setTestingProvider] = useState<LLMProvider | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});
  const [testError, setTestError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApiKeyChange = (provider: LLMProvider, apiKey: string) => {
    const existing = llmSettings.providers[provider];
    if (apiKey.trim()) {
      onUpdateProvider(provider, {
        provider,
        apiKey: apiKey.trim(),
        // Preserve existing model selection, or initialize to the first known model (default)
        model: existing?.model || PROVIDER_MODELS[provider][0].id,
        proxyUrl: existing?.proxyUrl,
      });
    } else {
      onUpdateProvider(provider, null);
    }
  };

  const handleModelChange = (provider: LLMProvider, model: string) => {
    const existing = llmSettings.providers[provider];
    if (!existing) return;
    onUpdateProvider(provider, { ...existing, model });
  };

  const handleProxyUrlChange = (provider: LLMProvider, proxyUrl: string) => {
    const existing = llmSettings.providers[provider];
    if (!existing) return;
    onUpdateProvider(provider, { ...existing, proxyUrl: proxyUrl.trim() || undefined });
  };

  const handleTestConnection = async (provider: LLMProvider) => {
    const config = llmSettings.providers[provider];
    if (!config || !config.apiKey) return;

    setTestingProvider(provider);
    setTestResults(prev => ({ ...prev, [provider]: null }));
    setTestError(null);

    try {
      await llmService.testConnection(provider, config);
      setTestResults(prev => ({ ...prev, [provider]: 'success' }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [provider]: 'error' }));
      setTestError(err.message || 'Connection test failed');
    } finally {
      setTestingProvider(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-dark-800/50 shrink-0">
          <h2 className="font-semibold text-white">AI Provider Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {PROVIDER_ORDER.map(provider => {
            const info = PROVIDER_INFO[provider];
            const config = llmSettings.providers[provider];
            const isActive = llmSettings.activeProvider === provider;
            const testResult = testResults[provider];

            return (
              <div
                key={provider}
                className={`border rounded-lg transition-colors ${
                  isActive ? 'border-brand-500 bg-brand-500/5' : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                {/* Clickable header — entire row selects this provider */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                  onClick={() => onSetActiveProvider(provider)}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="activeProvider"
                      checked={isActive}
                      onChange={() => onSetActiveProvider(provider)}
                      onClick={e => e.stopPropagation()}
                      className="accent-brand-500 cursor-pointer"
                    />
                    <span className="font-medium text-white">{info.label}</span>
                    {isActive ? (
                      <span className="text-xs px-2 py-0.5 bg-brand-600/30 text-brand-400 rounded-full">Active</span>
                    ) : config?.apiKey ? (
                      <span className="text-xs px-2 py-0.5 bg-green-900/30 text-green-500 rounded-full">Ready</span>
                    ) : (
                      <span className="text-xs text-gray-600">No API key</span>
                    )}
                  </div>
                  {config?.apiKey && (
                    <button
                      onClick={e => { e.stopPropagation(); handleTestConnection(provider); }}
                      disabled={testingProvider !== null}
                      className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {testingProvider === provider ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : testResult === 'success' ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : testResult === 'error' ? (
                        <AlertCircle className="w-3 h-3 text-red-400" />
                      ) : null}
                      Test
                    </button>
                  )}
                </div>

                {/* Config fields */}
                <div className="px-4 pb-4 space-y-3 border-t border-gray-800/60 pt-3">
                  <p className="text-xs text-gray-500">{info.description}</p>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">API Key</label>
                    <input
                      type="password"
                      value={config?.apiKey || ''}
                      onChange={e => handleApiKeyChange(provider, e.target.value)}
                      placeholder={`Enter ${info.label} API key`}
                      className="w-full bg-dark-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>

                  {(() => {
                    const models = PROVIDER_MODELS[provider];
                    const defaultModel = models[0];
                    const selectedId = config?.model || defaultModel.id;
                    return (
                      <div>
                        <label className="text-xs text-gray-400 block mb-1">Model</label>
                        <div className="relative">
                          <select
                            value={selectedId}
                            onChange={e => handleModelChange(provider, e.target.value)}
                            className="w-full appearance-none bg-dark-800 border border-gray-700 rounded px-3 py-2 pr-8 text-sm text-gray-200 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none cursor-pointer"
                          >
                            {models.map((m, i) => (
                              <option key={m.id} value={m.id}>
                                {i === 0 ? `${m.label} (default)` : m.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                        </div>
                        {selectedId === defaultModel.id && (
                          <p className="text-xs text-gray-600 mt-1">Modèle recommandé pour ce fournisseur.</p>
                        )}
                      </div>
                    );
                  })()}

                  {provider === 'anthropic' && (
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">CORS Proxy URL</label>
                      <input
                        type="text"
                        value={config?.proxyUrl || ''}
                        onChange={e => handleProxyUrlChange(provider, e.target.value)}
                        placeholder="e.g., https://your-proxy.example.com"
                        className="w-full bg-dark-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        The Anthropic API does not support browser requests (CORS). You need a proxy server that forwards requests to api.anthropic.com. Without a proxy, direct API calls will fail.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {testError && (
            <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded border border-red-900/50">
              {testError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-800 shrink-0">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
};

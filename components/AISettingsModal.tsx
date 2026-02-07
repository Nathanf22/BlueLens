import React, { useState } from 'react';
import { X, Check, AlertCircle, Loader2 } from 'lucide-react';
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
  gemini: { label: 'Google Gemini', description: 'Uses the Gemini API. Free tier available.' },
  openai: { label: 'OpenAI', description: 'GPT-4o, GPT-4o-mini, and other models.' },
  anthropic: { label: 'Anthropic', description: 'Claude models. Requires a CORS proxy for browser use.' },
};

const PROVIDER_ORDER: LLMProvider[] = ['gemini', 'openai', 'anthropic'];

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
        model: existing?.model,
        proxyUrl: existing?.proxyUrl,
      });
    } else {
      onUpdateProvider(provider, null);
    }
  };

  const handleModelChange = (provider: LLMProvider, model: string) => {
    const existing = llmSettings.providers[provider];
    if (!existing) return;
    onUpdateProvider(provider, { ...existing, model: model.trim() || undefined });
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
                className={`border rounded-lg p-4 space-y-3 transition-colors ${
                  isActive ? 'border-brand-500 bg-brand-500/5' : 'border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="activeProvider"
                        checked={isActive}
                        onChange={() => onSetActiveProvider(provider)}
                        className="accent-brand-500"
                      />
                      <span className="font-medium text-white">{info.label}</span>
                    </label>
                    {isActive && (
                      <span className="text-xs px-2 py-0.5 bg-brand-600/30 text-brand-400 rounded-full">Active</span>
                    )}
                  </div>
                  {config?.apiKey && (
                    <button
                      onClick={() => handleTestConnection(provider)}
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

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Model (optional override)</label>
                  <input
                    type="text"
                    value={config?.model || ''}
                    onChange={e => handleModelChange(provider, e.target.value)}
                    placeholder="Leave blank for default"
                    className="w-full bg-dark-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                </div>

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

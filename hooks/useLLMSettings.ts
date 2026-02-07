import { useState, useCallback } from 'react';
import { LLMSettings, LLMProvider, LLMProviderConfig } from '../types';
import { getDefaultSettings } from '../services/llmService';

const STORAGE_KEY = 'mermaidviz_llm_settings';

function loadSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LLMSettings;
      // Merge with defaults to pick up env API key for Gemini if not already set
      const defaults = getDefaultSettings();
      if (!parsed.providers.gemini && defaults.providers.gemini) {
        parsed.providers.gemini = defaults.providers.gemini;
      }
      return parsed;
    }
  } catch {
    // Fall through to defaults
  }
  return getDefaultSettings();
}

function saveSettings(settings: LLMSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or unavailable
  }
}

export const useLLMSettings = () => {
  const [llmSettings, setLLMSettings] = useState<LLMSettings>(loadSettings);

  const updateProvider = useCallback((provider: LLMProvider, config: LLMProviderConfig | null) => {
    setLLMSettings(prev => {
      const next = {
        ...prev,
        providers: { ...prev.providers, [provider]: config },
      };
      saveSettings(next);
      return next;
    });
  }, []);

  const setActiveProvider = useCallback((provider: LLMProvider) => {
    setLLMSettings(prev => {
      const next = { ...prev, activeProvider: provider };
      saveSettings(next);
      return next;
    });
  }, []);

  const hasConfiguredProvider = Object.values(llmSettings.providers).some(
    c => c !== null && c.apiKey.length > 0
  );

  return {
    llmSettings,
    updateProvider,
    setActiveProvider,
    hasConfiguredProvider,
  };
};

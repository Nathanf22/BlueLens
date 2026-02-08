import { useState, useCallback, useEffect } from 'react';
import { LLMSettings, LLMProvider, LLMProviderConfig } from '../types';
import { getDefaultSettings } from '../services/llmService';
import { cryptoStorageService } from '../services/cryptoStorageService';

const STORAGE_KEY = 'mermaidviz_llm_settings';
const SECURE_KEY = 'llm_settings';

function loadSettingsSync(): LLMSettings {
  // Synchronous load from localStorage for initial render
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LLMSettings;
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

async function saveSettingsSecure(settings: LLMSettings) {
  await cryptoStorageService.saveSecure(SECURE_KEY, settings);
}

export const useLLMSettings = () => {
  const [llmSettings, setLLMSettings] = useState<LLMSettings>(loadSettingsSync);

  // Async migration: load from encrypted storage, migrate from localStorage if needed
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const secureData = await cryptoStorageService.loadSecure(SECURE_KEY);
        if (secureData && !cancelled) {
          const defaults = getDefaultSettings();
          if (!secureData.providers.gemini && defaults.providers.gemini) {
            secureData.providers.gemini = defaults.providers.gemini;
          }
          setLLMSettings(secureData);
          return;
        }

        // No secure data — migrate from localStorage
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as LLMSettings;
          await cryptoStorageService.saveSecure(SECURE_KEY, parsed);
          localStorage.removeItem(STORAGE_KEY);
          if (!cancelled) {
            const defaults = getDefaultSettings();
            if (!parsed.providers.gemini && defaults.providers.gemini) {
              parsed.providers.gemini = defaults.providers.gemini;
            }
            setLLMSettings(parsed);
          }
        }
      } catch {
        // Migration failed — keep using sync-loaded state
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const updateProvider = useCallback((provider: LLMProvider, config: LLMProviderConfig | null) => {
    setLLMSettings(prev => {
      const next = {
        ...prev,
        providers: { ...prev.providers, [provider]: config },
      };
      saveSettingsSecure(next);
      return next;
    });
  }, []);

  const setActiveProvider = useCallback((provider: LLMProvider) => {
    setLLMSettings(prev => {
      const next = { ...prev, activeProvider: provider };
      saveSettingsSecure(next);
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

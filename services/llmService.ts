/**
 * Multi-provider LLM abstraction layer.
 * Supports Gemini, OpenAI, and Anthropic (via CORS proxy).
 */

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { LLMMessage, LLMResponse, LLMSettings, LLMProvider, LLMProviderConfig } from '../types';

/**
 * Thrown when no valid AI API key is configured.
 * Callers can catch this specifically to prompt the user to configure AI settings.
 */
export class LLMConfigError extends Error {
  readonly name = 'LLMConfigError';
  constructor(message = 'No AI API key configured. Open AI Settings to add one.') {
    super(message);
    Object.setPrototypeOf(this, LLMConfigError.prototype);
  }
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  gemini: 'gemini-3-flash-preview',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-6',
};

async function sendGemini(
  messages: LLMMessage[],
  systemPrompt: string,
  config: LLMProviderConfig,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const model = config.model || DEFAULT_MODELS.gemini;

  // Build contents from message history
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.3,
    },
  }, signal ? { signal } : undefined);

  const text = response.text;
  if (!text) throw new Error('No response from Gemini');

  return { content: text, provider: 'gemini', model };
}

async function sendOpenAI(
  messages: LLMMessage[],
  systemPrompt: string,
  config: LLMProviderConfig,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const model = config.model || DEFAULT_MODELS.openai;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ],
    temperature: 0.3,
  }, { signal });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('No response from OpenAI');

  return { content: text, provider: 'openai', model };
}

async function sendAnthropic(
  messages: LLMMessage[],
  systemPrompt: string,
  config: LLMProviderConfig,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const model = config.model || DEFAULT_MODELS.anthropic;
  const baseUrl = config.proxyUrl || 'https://api.anthropic.com';

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    if (response.status === 0 || errorText.includes('CORS') || errorText.includes('Failed to fetch')) {
      throw new Error(
        'CORS error: The Anthropic API does not allow direct browser requests. ' +
        'Please configure a CORS proxy URL in AI Settings.'
      );
    }
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('No response from Anthropic');

  return { content: text, provider: 'anthropic', model };
}

export function cleanMermaidResponse(text: string): string {
  let clean = text.trim();
  // Strip markdown code fences
  const mermaidBlock = clean.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
  if (mermaidBlock) {
    clean = mermaidBlock[1].trim();
  }
  return clean;
}

export function getDefaultSettings(): LLMSettings {
  // Check if there's a Gemini key in env
  const envGeminiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  return {
    activeProvider: 'gemini',
    providers: {
      gemini: envGeminiKey ? { provider: 'gemini', apiKey: envGeminiKey } : null,
      openai: null,
      anthropic: null,
    },
  };
}

export const llmService = {
  async sendMessage(
    messages: LLMMessage[],
    systemPrompt: string,
    settings: LLMSettings,
    signal?: AbortSignal
  ): Promise<LLMResponse> {
    const config = settings.providers[settings.activeProvider];
    if (!config?.apiKey) {
      throw new LLMConfigError(
        `No API key configured for ${settings.activeProvider}. Open AI Settings to configure.`
      );
    }

    switch (settings.activeProvider) {
      case 'gemini':
        return sendGemini(messages, systemPrompt, config, signal);
      case 'openai':
        return sendOpenAI(messages, systemPrompt, config, signal);
      case 'anthropic':
        return sendAnthropic(messages, systemPrompt, config, signal);
      default:
        throw new Error(`Unknown provider: ${settings.activeProvider}`);
    }
  },

  async testConnection(provider: LLMProvider, config: LLMProviderConfig): Promise<boolean> {
    const testMessage: LLMMessage[] = [{ role: 'user', content: 'Say "OK"' }];
    const testSettings: LLMSettings = {
      activeProvider: provider,
      providers: { gemini: null, openai: null, anthropic: null, [provider]: config },
    };

    const response = await this.sendMessage(testMessage, 'Respond with just "OK".', testSettings);
    return !!response.content;
  },
};

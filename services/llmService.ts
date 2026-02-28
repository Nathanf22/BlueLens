/**
 * Multi-provider LLM abstraction layer.
 * Supports Gemini, OpenAI, and Anthropic (via CORS proxy).
 */

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { LLMMessage, LLMResponse, LLMSettings, LLMProvider, LLMProviderConfig, AgentToolStep } from '../types';
import type { AgentToolDefinition } from './agentToolService';

const MAX_AGENT_ITERATIONS = 20;

export interface AgentLoopResult {
  content: string;
  toolSteps: AgentToolStep[];
  interrupted?: boolean;       // true when MAX_AGENT_ITERATIONS was reached without a final answer
  continuationContext?: unknown[]; // provider-specific conv state; pass back to resume
}

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

/**
 * Thrown when the API rate limit or quota is exceeded.
 * Callers should surface this clearly to the user rather than retrying silently.
 */
export class LLMRateLimitError extends Error {
  readonly name = 'LLMRateLimitError';
  constructor(provider: string) {
    super(`${provider} quota or rate limit exceeded. Wait a moment then try again.`);
    Object.setPrototypeOf(this, LLMRateLimitError.prototype);
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

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: m.content }],
  }));

  try {
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
  } catch (err: any) {
    if (err instanceof LLMConfigError || err instanceof LLMRateLimitError) throw err;
    const msg: string = err?.message ?? '';
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      throw new LLMRateLimitError('Gemini');
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID') || msg.includes('permission')) {
      throw new LLMConfigError(`Gemini API key is invalid or missing permissions. Open AI Settings.`);
    }
    throw err;
  }
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

  try {
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
  } catch (err: any) {
    if (err instanceof LLMConfigError || err instanceof LLMRateLimitError) throw err;
    const status: number | undefined = err?.status;
    if (status === 429) throw new LLMRateLimitError('OpenAI');
    if (status === 401 || status === 403) throw new LLMConfigError(`OpenAI API key is invalid. Open AI Settings.`);
    throw err;
  }
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
    if (response.status === 429) throw new LLMRateLimitError('Anthropic');
    if (response.status === 401 || response.status === 403) {
      throw new LLMConfigError(`Anthropic API key is invalid. Open AI Settings.`);
    }
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

// ─── Agentic loop — Gemini ───────────────────────────────────────────────────

async function runAgentLoopGemini(
  messages: LLMMessage[],
  systemPrompt: string,
  tools: AgentToolDefinition[],
  executor: (name: string, args: Record<string, unknown>) => Promise<AgentToolStep>,
  config: LLMProviderConfig,
  continuationContext?: unknown[],
  signal?: AbortSignal,
): Promise<AgentLoopResult> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const model = config.model || DEFAULT_MODELS.gemini;
  const toolSteps: AgentToolStep[] = [];

  const contents: any[] = continuationContext
    ? [...continuationContext]
    : messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

  const functionDeclarations = tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    signal?.throwIfAborted();
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
        tools: [{ functionDeclarations }],
      },
    }, signal ? { signal } : undefined);

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) throw new Error('No response from Gemini');

    const parts = candidate.content.parts;
    const fnParts = parts.filter((p: any) => p.functionCall);
    const textParts = parts.filter((p: any) => p.text);

    if (fnParts.length === 0) {
      return { content: textParts.map((p: any) => p.text).join(''), toolSteps };
    }

    // Add model turn with all parts
    contents.push({ role: 'model', parts });

    // Execute each tool call and collect function responses
    const fnResponses: any[] = [];
    for (const part of fnParts) {
      const { name, args } = part.functionCall;
      const step = await executor(name, args ?? {});
      toolSteps.push(step);
      fnResponses.push({ functionResponse: { name, response: { output: step.result } } });
    }
    contents.push({ role: 'user', parts: fnResponses });
  }

  return { content: '', toolSteps, interrupted: true, continuationContext: [...contents] };
}

// ─── Agentic loop — OpenAI ───────────────────────────────────────────────────

async function runAgentLoopOpenAI(
  messages: LLMMessage[],
  systemPrompt: string,
  tools: AgentToolDefinition[],
  executor: (name: string, args: Record<string, unknown>) => Promise<AgentToolStep>,
  config: LLMProviderConfig,
  continuationContext?: unknown[],
  signal?: AbortSignal,
): Promise<AgentLoopResult> {
  const client = new OpenAI({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });
  const model = config.model || DEFAULT_MODELS.openai;
  const toolSteps: AgentToolStep[] = [];

  const openAITools = tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  // continuationContext already includes the system message when resuming
  const conv: any[] = continuationContext
    ? [...continuationContext]
    : [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ];

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    signal?.throwIfAborted();
    const response = await client.chat.completions.create({
      model,
      messages: conv,
      tools: openAITools,
      tool_choice: 'auto',
      temperature: 0.3,
    }, { signal });

    const msg = response.choices[0]?.message;
    if (!msg) throw new Error('No response from OpenAI');

    conv.push(msg);

    if (!msg.tool_calls?.length) {
      return { content: msg.content ?? '', toolSteps };
    }

    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments || '{}');
      const step = await executor(tc.function.name, args);
      toolSteps.push(step);
      conv.push({ role: 'tool', tool_call_id: tc.id, content: step.result });
    }
  }

  return { content: '', toolSteps, interrupted: true, continuationContext: [...conv] };
}

// ─── Agentic loop — Anthropic ────────────────────────────────────────────────

async function runAgentLoopAnthropic(
  messages: LLMMessage[],
  systemPrompt: string,
  tools: AgentToolDefinition[],
  executor: (name: string, args: Record<string, unknown>) => Promise<AgentToolStep>,
  config: LLMProviderConfig,
  continuationContext?: unknown[],
  signal?: AbortSignal,
): Promise<AgentLoopResult> {
  const model = config.model || DEFAULT_MODELS.anthropic;
  const baseUrl = config.proxyUrl || 'https://api.anthropic.com';
  const toolSteps: AgentToolStep[] = [];

  const anthropicTools = tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const conv: any[] = continuationContext
    ? [...continuationContext]
    : messages.map(m => ({ role: m.role, content: m.content }));

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    signal?.throwIfAborted();
    const res = await fetch(`${baseUrl}/v1/messages`, {
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
        tools: anthropicTools,
        messages: conv,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 429) throw new LLMRateLimitError('Anthropic');
      if (res.status === 401 || res.status === 403) throw new LLMConfigError('Anthropic API key is invalid. Open AI Settings.');
      throw new Error(`Anthropic error (${res.status}): ${text}`);
    }

    const data = await res.json();
    const content: any[] = data.content ?? [];
    const stopReason: string = data.stop_reason;

    // Add assistant turn
    conv.push({ role: 'assistant', content });

    if (stopReason !== 'tool_use') {
      const text = content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      return { content: text, toolSteps };
    }

    // Execute tool use blocks
    const toolResults: any[] = [];
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      const step = await executor(block.name, block.input ?? {});
      toolSteps.push(step);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: step.result });
    }
    conv.push({ role: 'user', content: toolResults });
  }

  return { content: '', toolSteps, interrupted: true, continuationContext: [...conv] };
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

  async runAgentLoop(
    messages: LLMMessage[],
    systemPrompt: string,
    tools: AgentToolDefinition[],
    executor: (name: string, args: Record<string, unknown>) => Promise<AgentToolStep>,
    settings: LLMSettings,
    options?: { continuationContext?: unknown[]; signal?: AbortSignal },
  ): Promise<AgentLoopResult> {
    const config = settings.providers[settings.activeProvider];
    if (!config?.apiKey) {
      throw new LLMConfigError(`No API key configured for ${settings.activeProvider}. Open AI Settings to configure.`);
    }
    const ctx = options?.continuationContext;
    const sig = options?.signal;
    switch (settings.activeProvider) {
      case 'gemini':    return runAgentLoopGemini(messages, systemPrompt, tools, executor, config, ctx, sig);
      case 'openai':    return runAgentLoopOpenAI(messages, systemPrompt, tools, executor, config, ctx, sig);
      case 'anthropic': return runAgentLoopAnthropic(messages, systemPrompt, tools, executor, config, ctx, sig);
      default: throw new Error(`Unknown provider: ${settings.activeProvider}`);
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

/**
 * Multi-provider LLM abstraction layer.
 * Supports Gemini, OpenAI, and Anthropic (via CORS proxy).
 */

import { GoogleGenAI, Type as GeminiType } from '@google/genai';
import type { Content, Part } from '@google/genai';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { LLMMessage, LLMResponse, LLMSettings, LLMProvider, LLMProviderConfig, AgentToolStep, TokenUsage } from '../types';
import type { AgentToolDefinition } from './agentToolService';

const MAX_AGENT_ITERATIONS = 20;

export interface AgentLoopResult {
  content: string;
  toolSteps: AgentToolStep[];
  interrupted?: boolean;       // true when MAX_AGENT_ITERATIONS was reached without a final answer
  continuationContext?: unknown[]; // provider-specific conv state; pass back to resume
  usage?: TokenUsage;          // cumulative token consumption across all iterations
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
  gemini: 'gemini-3.1-flash-lite-preview',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-6',
};

// ─── Anthropic response shapes (raw fetch — no official browser SDK) ──────────

interface AnthropicContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

// ─── Simple send (no tool use) ────────────────────────────────────────────────

async function sendGemini(
  messages: LLMMessage[],
  systemPrompt: string,
  config: LLMProviderConfig,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const model = config.model || DEFAULT_MODELS.gemini;

  const contents: Content[] = messages.map(m => ({
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
        abortSignal: signal,
      },
    });

    const text = response.text;
    if (!text) throw new Error('No response from Gemini');

    const meta = response.usageMetadata;
    const usage: TokenUsage | undefined = meta ? {
      inputTokens: meta.promptTokenCount ?? 0,
      outputTokens: meta.candidatesTokenCount ?? 0,
      totalTokens: meta.totalTokenCount ?? 0,
    } : undefined;

    return { content: text, provider: 'gemini', model, usage };
  } catch (err: unknown) {
    if (err instanceof LLMConfigError || err instanceof LLMRateLimitError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
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

    const usage: TokenUsage | undefined = response.usage ? {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    } : undefined;

    return { content: text, provider: 'openai', model, usage };
  } catch (err: unknown) {
    if (err instanceof LLMConfigError || err instanceof LLMRateLimitError) throw err;
    const status = err instanceof OpenAI.APIError ? err.status : undefined;
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

  const data = await response.json() as {
    content: AnthropicContentBlock[];
    usage?: { input_tokens: number; output_tokens: number };
  };
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('No response from Anthropic');

  const usage: TokenUsage | undefined = data.usage ? {
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    totalTokens: data.usage.input_tokens + data.usage.output_tokens,
  } : undefined;

  return { content: text, provider: 'anthropic', model, usage };
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

  const contents: Content[] = continuationContext
    ? [...continuationContext] as Content[]
    : messages.map(m => ({
        role: m.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      }));

  let totalInput = 0, totalOutput = 0;

  const geminiTypeMap: Record<string, GeminiType> = {
    string: GeminiType.STRING,
    number: GeminiType.NUMBER,
    boolean: GeminiType.BOOLEAN,
  };
  const functionDeclarations = tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: GeminiType.OBJECT,
      properties: Object.fromEntries(
        Object.entries(t.parameters.properties).map(([key, param]) => [
          key,
          { ...param, type: geminiTypeMap[param.type] ?? GeminiType.STRING },
        ])
      ),
      required: t.parameters.required,
    },
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
        abortSignal: signal,
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) throw new Error('No response from Gemini');

    const meta = response.usageMetadata;
    if (meta) { totalInput += meta.promptTokenCount ?? 0; totalOutput += meta.candidatesTokenCount ?? 0; }

    const parts: Part[] = candidate.content.parts;
    const fnParts = parts.filter(p => p.functionCall != null);
    const textParts = parts.filter(p => p.text != null);

    if (fnParts.length === 0) {
      const usage: TokenUsage = { inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalInput + totalOutput };
      return { content: textParts.map(p => p.text ?? '').join(''), toolSteps, usage };
    }

    // Add model turn with all parts
    contents.push({ role: 'model', parts });

    // Execute tool calls in parallel when the LLM batches multiple in one turn
    const fnResponses = await Promise.all(fnParts.map(async part => {
      const { name, args } = part.functionCall!;
      if (!name) throw new Error('Gemini returned a function call with no name');
      const step = await executor(name, (args ?? {}) as Record<string, unknown>);
      toolSteps.push(step);
      return { functionResponse: { name, response: { output: step.result } } };
    }));
    contents.push({ role: 'user', parts: fnResponses });
  }

  const usage: TokenUsage = { inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalInput + totalOutput };
  return { content: '', toolSteps, interrupted: true, continuationContext: [...contents], usage };
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

  const conv: ChatCompletionMessageParam[] = continuationContext
    ? [...continuationContext] as ChatCompletionMessageParam[]
    : [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

  let totalInput = 0, totalOutput = 0;

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

    if (response.usage) { totalInput += response.usage.prompt_tokens; totalOutput += response.usage.completion_tokens; }

    conv.push(msg);

    if (!msg.tool_calls?.length) {
      const usage: TokenUsage = { inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalInput + totalOutput };
      return { content: msg.content ?? '', toolSteps, usage };
    }

    // Execute tool calls in parallel when the LLM batches multiple in one turn
    const toolMessages = await Promise.all(msg.tool_calls.filter(tc => tc.type === 'function').map(async tc => {
      const args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
      const step = await executor(tc.function.name, args);
      toolSteps.push(step);
      return { role: 'tool' as const, tool_call_id: tc.id, content: step.result };
    }));
    toolMessages.forEach(m => conv.push(m));
  }

  const usage: TokenUsage = { inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalInput + totalOutput };
  return { content: '', toolSteps, interrupted: true, continuationContext: [...conv], usage };
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

  const conv: AnthropicMessage[] = continuationContext
    ? [...continuationContext] as AnthropicMessage[]
    : messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  let totalInput = 0, totalOutput = 0;

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

    const data = await res.json() as {
      content: AnthropicContentBlock[];
      stop_reason: string;
      usage?: { input_tokens: number; output_tokens: number };
    };
    const content = data.content ?? [];
    const stopReason = data.stop_reason;

    if (data.usage) { totalInput += data.usage.input_tokens; totalOutput += data.usage.output_tokens; }

    // Add assistant turn
    conv.push({ role: 'assistant', content });

    if (stopReason !== 'tool_use') {
      const text = content
        .filter(b => b.type === 'text')
        .map(b => b.text ?? '')
        .join('');
      const usage: TokenUsage = { inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalInput + totalOutput };
      return { content: text, toolSteps, usage };
    }

    // Execute tool use blocks in parallel when the LLM batches multiple in one turn
    const toolUseBlocks = content.filter(b => b.type === 'tool_use');
    const toolResults = await Promise.all(toolUseBlocks.map(async block => {
      const step = await executor(block.name!, block.input ?? {});
      toolSteps.push(step);
      return { type: 'tool_result', tool_use_id: block.id!, content: step.result };
    }));
    conv.push({ role: 'user', content: toolResults as unknown as AnthropicContentBlock[] });
  }

  const usage: TokenUsage = { inputTokens: totalInput, outputTokens: totalOutput, totalTokens: totalInput + totalOutput };
  return { content: '', toolSteps, interrupted: true, continuationContext: [...conv], usage };
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

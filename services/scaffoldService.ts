/**
 * Diagram-to-code scaffolding service.
 * Uses LLM to generate code templates from diagram structure.
 */

import { LLMSettings } from '../types';
import { llmService } from './llmService';
import { aiChatService } from './aiChatService';

export const scaffoldService = {
  async generateScaffold(
    diagramCode: string,
    language: string,
    llmSettings: LLMSettings
  ): Promise<string> {
    const systemPrompt = aiChatService.buildScaffoldPrompt(diagramCode, language);

    const response = await llmService.sendMessage(
      [{ role: 'user', content: `Generate ${language} code scaffolding from this diagram. Return only the code.` }],
      systemPrompt,
      llmSettings
    );

    // Extract code block from response
    const codeBlockMatch = response.content.match(/```(?:\w+)?\s*\n([\s\S]*?)```/);
    return codeBlockMatch ? codeBlockMatch[1].trim() : response.content.trim();
  },
};

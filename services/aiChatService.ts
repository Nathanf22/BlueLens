/**
 * AI Chat prompt engineering service.
 * Builds system prompts and extracts mermaid code from AI responses.
 */

import { ChatMessage, LLMMessage } from '../types';

export const aiChatService = {
  buildDiagramChatSystemPrompt(currentCode: string): string {
    return `You are an expert diagram assistant working with Mermaid.js diagrams.
The user has a diagram they want to modify through natural language instructions.

CURRENT DIAGRAM CODE:
\`\`\`mermaid
${currentCode}
\`\`\`

RULES:
1. When the user asks you to modify the diagram, return the COMPLETE updated Mermaid code inside a \`\`\`mermaid code block.
2. Always return the full diagram code, not just the changed parts.
3. Ensure the syntax is valid Mermaid.js.
4. If the user asks a question about the diagram (not a modification), answer it without a code block.
5. Preserve existing node IDs and structure unless the user specifically asks to change them.
6. When adding new nodes, use short meaningful IDs (e.g., DB, Cache, Auth).
7. Keep any existing subgraphs, styling, and links unless told to remove them.`;
  },

  chatMessagesToLLMMessages(messages: ChatMessage[]): LLMMessage[] {
    return messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  },

  extractMermaidFromResponse(text: string): string | null {
    // Try to extract from ```mermaid ... ``` block
    const mermaidMatch = text.match(/```mermaid\s*\n([\s\S]*?)```/);
    if (mermaidMatch) return mermaidMatch[1].trim();

    // Try generic code block
    const codeMatch = text.match(/```\s*\n([\s\S]*?)```/);
    if (codeMatch) {
      const code = codeMatch[1].trim();
      // Heuristic: check if it looks like Mermaid code
      if (/^(graph|flowchart|sequenceDiagram|classDiagram|erDiagram|stateDiagram|gantt|pie|gitGraph|journey|mindmap|timeline)/m.test(code)) {
        return code;
      }
    }

    return null;
  },
};

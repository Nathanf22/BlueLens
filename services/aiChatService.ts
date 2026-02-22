/**
 * AI Chat prompt engineering service.
 * Builds system prompts and extracts mermaid code from AI responses.
 */

import { ChatMessage, LLMMessage } from '../types';

export interface GlobalAIContext {
  workspaceName?: string;
  activeDiagram?: { name: string; code: string };
  activeCodeGraph?: { name: string; nodeCount: number; lenses: string[] };
}

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

  buildNodeContextPrompt(code: string, nodeId: string, nodeLabel: string): string {
    return `You are an expert diagram assistant working with Mermaid.js diagrams.
The user has selected a specific node and wants context-aware suggestions.

CURRENT DIAGRAM CODE:
\`\`\`mermaid
${code}
\`\`\`

SELECTED NODE: "${nodeLabel}" (ID: ${nodeId})

RULES:
1. Focus your suggestions on the selected node and its relationships.
2. When modifying the diagram, return the COMPLETE updated Mermaid code inside a \`\`\`mermaid code block.
3. Always return the full diagram code, not just the changed parts.
4. Ensure the syntax is valid Mermaid.js.
5. Preserve existing node IDs and structure unless specifically asked to change them.`;
  },

  buildDiagramConversionPrompt(code: string, targetType: string): string {
    return `You are an expert diagram assistant. Convert the following Mermaid diagram to a ${targetType}.

CURRENT DIAGRAM CODE:
\`\`\`mermaid
${code}
\`\`\`

RULES:
1. Convert the diagram to ${targetType} format while preserving the semantic meaning.
2. Return the COMPLETE converted diagram inside a \`\`\`mermaid code block.
3. Map entities and relationships as closely as possible to the target diagram type.
4. Use proper ${targetType} syntax.
5. If some concepts can't be directly represented in ${targetType}, find the closest approximation.`;
  },

  buildScaffoldPrompt(code: string, language: string): string {
    return `You are a code scaffolding expert. Generate ${language} code from the following Mermaid architecture diagram.

DIAGRAM:
\`\`\`mermaid
${code}
\`\`\`

RULES:
1. Create class/function/interface stubs matching the diagram nodes.
2. Implement relationships between nodes as imports, method calls, or type references.
3. Add TODO comments where business logic should be implemented.
4. Use idiomatic ${language} patterns and conventions.
5. Return the code inside a \`\`\`${language} code block.
6. Include proper type annotations and structure.`;
  },

  buildGlobalSystemPrompt(context: GlobalAIContext): string {
    const parts: string[] = [
      `You are an expert AI assistant for BlueLens, an architecture diagram platform.
You help users create and understand software architecture diagrams using Mermaid.js, answer architecture questions, and reason about codebases.`,
    ];

    if (context.workspaceName) {
      parts.push(`\nActive workspace: "${context.workspaceName}"`);
    }

    if (context.activeDiagram) {
      parts.push(`\nThe user currently has this diagram open ("${context.activeDiagram.name}"):
\`\`\`mermaid
${context.activeDiagram.code}
\`\`\``);
    }

    if (context.activeCodeGraph) {
      const { name, nodeCount, lenses } = context.activeCodeGraph;
      parts.push(`\nThe user is viewing a CodeGraph named "${name}" with ${nodeCount} nodes.${lenses.length > 0 ? ` Available lenses: ${lenses.join(', ')}.` : ''}`);
    }

    parts.push(`
CAPABILITIES:
- Answer architecture and design questions
- Generate new Mermaid diagrams (wrap code in \`\`\`mermaid blocks)
- Modify the active diagram when asked (return the COMPLETE updated code in a \`\`\`mermaid block)
- Explain code structure, dependencies, and design patterns
- Suggest improvements to diagrams or architecture

When generating or modifying a diagram, always return the full Mermaid code inside a \`\`\`mermaid code block.`);

    return parts.join('');
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

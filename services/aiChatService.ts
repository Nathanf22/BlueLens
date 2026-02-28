/**
 * AI Chat prompt engineering service.
 * Builds system prompts and extracts mermaid code from AI responses.
 */

import { ChatMessage, LLMMessage } from '../types';

export interface GlobalAIDiagram {
  name: string;
  folderPath: string; // '' means root
  code: string;
}

export interface GlobalAIContext {
  workspaceName?: string;
  activeDiagramName?: string; // just the name, so the AI knows which one is open
  allDiagrams?: GlobalAIDiagram[];
  activeCodeGraph?: {
    name: string;
    nodeCount: number;
    lenses: string[];
    modulesSummary: string; // compact module → files listing
    flowNames: string[];
  };
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
You help users create, modify, and understand software architecture diagrams using Mermaid.js, answer architecture questions, and reason about codebases.`,
    ];

    if (context.workspaceName) {
      parts.push(`\nActive workspace: "${context.workspaceName}"`);
    }

    if (context.activeDiagramName) {
      parts.push(`Currently open diagram: "${context.activeDiagramName}"`);
    }

    // All workspace diagrams with their full Mermaid code
    if (context.allDiagrams && context.allDiagrams.length > 0) {
      const diagramLines = context.allDiagrams.map((d, i) => {
        const location = d.folderPath ? `folder: ${d.folderPath}` : 'root';
        return `${i + 1}. "${d.name}" [${location}]\n\`\`\`mermaid\n${d.code}\n\`\`\``;
      });
      parts.push(`\n=== WORKSPACE DIAGRAMS (${context.allDiagrams.length} total) ===\n${diagramLines.join('\n\n')}`);
    }

    // CodeGraph context
    if (context.activeCodeGraph) {
      const { name, nodeCount, lenses, modulesSummary, flowNames } = context.activeCodeGraph;
      const codeGraphLines = [
        `\n=== CODE GRAPH: "${name}" ===`,
        `${nodeCount} nodes | Lenses: ${lenses.join(', ')}`,
      ];
      if (modulesSummary) {
        codeGraphLines.push(`Modules:\n${modulesSummary}`);
      }
      if (flowNames.length > 0) {
        codeGraphLines.push(`Flows: ${flowNames.join(', ')}`);
      }
      parts.push(codeGraphLines.join('\n'));
    }

    parts.push(`
=== CAPABILITIES ===
- Answer architecture and design questions, using the workspace diagrams above as context
- Reference any diagram by name when answering — you have their full code above
- Generate NEW Mermaid diagrams (wrap code in \`\`\`mermaid blocks) — the user can save them directly
- Modify the currently open diagram when asked (return the COMPLETE updated code in a \`\`\`mermaid block)
- Explain code structure, dependencies, and design patterns from the CodeGraph
- Suggest improvements to diagrams or architecture

When generating or modifying a diagram, always return the full Mermaid code inside a \`\`\`mermaid code block.`);

    return parts.join('\n');
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

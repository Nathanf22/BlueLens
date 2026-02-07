import React, { useState } from 'react';
import { X, Sparkles, Wand2 } from 'lucide-react';
import { Button } from './Button';
import { LLMSettings } from '../types';
import { llmService, cleanMermaidResponse } from '../services/llmService';

interface AIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (code: string) => void;
  llmSettings: LLMSettings;
}

const GENERATOR_SYSTEM_PROMPT = `You are an expert diagram generator using Mermaid.js syntax.
Your task is to convert the user's natural language description into valid Mermaid.js code.
RULES:
1. Return ONLY the Mermaid code inside a \`\`\`mermaid code block.
2. Do NOT include explanations or preamble.
3. Ensure syntax is valid and standard.
4. If the user asks for a specific type (Sequence, Class, ER, etc.), respect it. Default to Flowchart (graph TD) if unsure.`;

export const AIGeneratorModal: React.FC<AIGeneratorModalProps> = ({ isOpen, onClose, onGenerate, llmSettings }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);
    try {
      const response = await llmService.sendMessage(
        [{ role: 'user', content: prompt }],
        GENERATOR_SYSTEM_PROMPT,
        llmSettings
      );
      const code = cleanMermaidResponse(response.content);
      onGenerate(code);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to generate diagram. Please try again or check your API configuration.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-dark-800/50">
          <div className="flex items-center gap-2 text-brand-500">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-semibold text-white">Generate with AI</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-gray-400 text-sm">
            Describe the diagram you want to create. Be specific about the flow, actors, or relationships.
          </p>
          
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Create a sequence diagram showing a user logging into a system with 2FA..."
            className="w-full h-32 bg-dark-800 border border-gray-700 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-none placeholder-gray-600"
          />

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded border border-red-900/50">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={isGenerating}>
              Cancel
            </Button>
            <Button 
              onClick={handleGenerate} 
              isLoading={isGenerating}
              icon={<Wand2 className="w-4 h-4" />}
            >
              Generate
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

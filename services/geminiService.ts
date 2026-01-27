import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing in process.env");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateMermaidCode = async (prompt: string): Promise<string> => {
  try {
    const ai = getClient();
    
    const systemInstruction = `You are an expert diagram generator using Mermaid.js syntax. 
    Your task is to convert the user's natural language description into valid Mermaid.js code.
    RULES:
    1. Return ONLY the Mermaid code. 
    2. Do NOT include markdown code blocks (like \`\`\`mermaid).
    3. Do NOT include explanations or preamble.
    4. Ensure syntax is valid and standard.
    5. If the user asks for a specific type (Sequence, Class, ER, etc.), respect it. Default to Flowchart (graph TD) if unsure.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2, // Low temperature for deterministic code
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    // Clean up potential markdown formatting if the model disobeys
    let cleanText = text.trim();
    if (cleanText.startsWith('```mermaid')) {
      cleanText = cleanText.replace('```mermaid', '').replace('```', '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace('```', '').replace('```', '');
    }

    return cleanText.trim();

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

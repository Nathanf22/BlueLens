import { useState, useCallback } from 'react';
import { LLMProvider, TokenUsage, TokenUsageRecord } from '../types';
import { appendRecord, getRecords, clearRecords } from '../services/tokenUsageService';

export const useTokenUsage = () => {
  const [records, setRecords] = useState<TokenUsageRecord[]>(() => getRecords());

  const recordUsage = useCallback((usage: TokenUsage, provider: LLMProvider, model: string) => {
    if (usage.totalTokens <= 0) return;
    const record = appendRecord({
      timestamp: Date.now(),
      provider,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });
    setRecords(prev => [...prev, record]);
  }, []);

  const clearUsage = useCallback(() => {
    clearRecords();
    setRecords([]);
  }, []);

  return { records, recordUsage, clearUsage };
};

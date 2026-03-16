import { useState, useRef, useCallback } from 'react';
import { AgentToolEvent, AgentEventFn, AgentPendingFn, AgentId, ProgressLogEntry, AgentBlackboard, AgentBlackboardFn } from '../types';

const genId = () => Math.random().toString(36).slice(2, 9);

export interface AgentMissionState {
  events: AgentToolEvent[];
  isOpen: boolean;
  activeAgents: Set<AgentId>;
}

const EMPTY_BLACKBOARD: AgentBlackboard = { clusters: [], flows: [], clusterIssues: [], flowIssues: [], archIssues: [] };

export function useAgentMission() {
  const [events, setEvents] = useState<AgentToolEvent[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeAgents, setActiveAgents] = useState<Set<AgentId>>(new Set());
  const [blackboard, setBlackboard] = useState<AgentBlackboard>(EMPTY_BLACKBOARD);
  const [pendingTools, setPendingTools] = useState<Partial<Record<AgentId, { toolName: string; argsSummary: string }>>>({});
  const startTimeRef = useRef<number>(0);

  const start = useCallback(() => {
    setEvents([]);
    setActiveAgents(new Set());
    setBlackboard(EMPTY_BLACKBOARD);
    setPendingTools({});
    setIsOpen(true);
    startTimeRef.current = Date.now();
  }, []);

  const updateBlackboard: AgentBlackboardFn = useCallback((update) => {
    setBlackboard(prev => ({ ...prev, ...update }));
  }, []);

  const stop = useCallback(() => {
    setActiveAgents(new Set());
  }, []);

  const setAgentActive = useCallback((agent: AgentId, active: boolean) => {
    setActiveAgents(prev => {
      const next = new Set(prev);
      if (active) next.add(agent); else next.delete(agent);
      return next;
    });
  }, []);

  const notifyToolStart: AgentPendingFn = useCallback((agent, toolName, argsSummary) => {
    setPendingTools(prev => ({ ...prev, [agent]: { toolName, argsSummary } }));
  }, []);

  const addEvent: AgentEventFn = useCallback((event) => {
    const entry: AgentToolEvent = {
      ...event,
      id: genId(),
      elapsedMs: Date.now() - startTimeRef.current,
    };
    setPendingTools(prev => ({ ...prev, [event.agent]: undefined }));
    setEvents(prev => [...prev, entry]);
  }, []);

  const downloadLog = useCallback((progressEntries: ProgressLogEntry[]) => {
    const log = {
      exportedAt: new Date().toISOString(),
      durationMs: Date.now() - startTimeRef.current,
      progressLog: progressEntries,
      agentEvents: events,
      blackboard,
    };
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bluelens-mission-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [events, blackboard]);

  return { events, isOpen, activeAgents, blackboard, pendingTools, start, stop, setIsOpen, setAgentActive, addEvent, notifyToolStart, updateBlackboard, downloadLog };
}

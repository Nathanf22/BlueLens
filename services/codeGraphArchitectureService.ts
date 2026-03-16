/**
 * Architecture diagram generation — thin wrapper around the agentic orchestrator.
 * The Architect agent reads actual source code and uses semantic cluster context
 * to produce comprehensible Mermaid diagrams with meaningful descriptions and labels.
 */

export { orchestrateArchitectureGeneration } from './codeGraphOrchestrator';
export type { ArchitectureDiagramSet } from './codeGraphOrchestrator';

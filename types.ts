export interface Comment {
  id: string;
  x: number;
  y: number;
  content: string;
  createdAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  workspaceId: string;
}

export interface Diagram {
  id: string;
  name: string;
  code: string;
  comments?: Comment[];
  lastModified: number;
  folderId: string | null;
  workspaceId: string;
  
  // Node-level navigation
  nodeLinks: NodeLink[];

  // Code integration
  codeLinks?: CodeLink[];
}

export interface NodeLink {
  nodeId: string;           // Mermaid node ID (e.g., "A", "UserService")
  targetDiagramId: string;  // Diagram to navigate to
  label?: string;           // Optional label for the link
}

export interface DiagramState {
  code: string;
  lastValidCode: string;
  error: string | null;
}

export interface ViewSettings {
  zoom: number;
  pan: { x: number; y: number };
}

export enum AppMode {
  EDITOR = 'EDITOR',
  PREVIEW = 'PREVIEW',
  SPLIT = 'SPLIT'
}

export interface AIRequestParams {
  prompt: string;
}

export interface NavigationState {
  stack: NavigationStep[];
}

export interface NavigationStep {
  diagramId: string;
  nodeId?: string;     // Which node was clicked to get here
  nodeName?: string;   // Display name for breadcrumb
}

export interface CodeLink {
  nodeId: string;           // Mermaid node ID
  repoId: string;           // Which repo this links to
  filePath: string;         // Path relative to repo root
  lineStart?: number;       // Optional line range start
  lineEnd?: number;         // Optional line range end
  label?: string;           // Display label
}

export interface ScanConfig {
  includePaths: string[];   // glob patterns, e.g. ["src/**"]
  excludePaths: string[];   // e.g. ["**/*.test.ts", "**/node_modules/**"]
  ignorePatterns: string[]; // symbol name patterns to skip, e.g. ["use*", "handle*"]
}

export interface RepoConfig {
  id: string;
  name: string;             // Directory name
  workspaceId: string;      // Scoped to workspace
  addedAt: number;
  scanConfig?: ScanConfig;
}

export interface CodeFile {
  repoId: string;
  filePath: string;
  content: string;
  language: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface CodeSymbol {
  name: string;
  kind: 'class' | 'function' | 'interface' | 'variable';
  lineStart: number;
  lineEnd: number;
}

export interface BlueprintExport {
  version: number;
  exportType: 'diagram' | 'workspace' | 'all';
  exportDate: string;
  workspaces: Workspace[];
  folders: Folder[];
  diagrams: Diagram[];
}

// --- Phase 3: Intelligence Layer ---

export type LLMProvider = 'gemini' | 'openai' | 'anthropic';

export interface LLMProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  proxyUrl?: string;       // Anthropic CORS workaround
}

export interface LLMSettings {
  activeProvider: LLMProvider;
  providers: Record<LLMProvider, LLMProviderConfig | null>;
}

export interface LLMMessage { role: 'user' | 'assistant'; content: string; }
export interface LLMResponse { content: string; provider: LLMProvider; model: string; }

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  diagramCodeSnapshot?: string;
  appliedToCode?: boolean;
}

export interface ChatSession {
  diagramId: string;
  messages: ChatMessage[];
}

// Sync modes (FR3.3)
export type SyncMode = 'manual' | 'semi-auto' | 'auto';

// Sync status (FR3.2)
export type SyncStatus = 'unknown' | 'synced' | 'suggestions' | 'conflicts';

// Typed suggestions (FR3.7)
export type SuggestionType = 'add_component' | 'remove_component' | 'add_relationship'
  | 'update_relationship' | 'mark_obsolete';

export interface SyncSuggestion {
  type: SuggestionType;
  label: string;
  description: string;
  entity?: ScannedEntity;
  nodeInfo?: DiagramNodeInfo;
  confidence: 'exact' | 'fuzzy' | 'heuristic';
}

export interface ScanResult {
  repoId: string;
  repoName: string;
  scannedAt: number;
  diagramId: string;
  entities: ScannedEntity[];
  matches: ScanMatch[];
  missingInDiagram: ScannedEntity[];
  missingInCode: DiagramNodeInfo[];
  suggestions: SyncSuggestion[];
}

export interface ScannedEntity {
  name: string;
  kind: CodeSymbol['kind'];
  filePath: string;
  lineStart: number;
  lineEnd: number;
  repoId: string;
}

export interface DiagramNodeInfo {
  nodeId: string;
  label: string;
}

export interface ScanMatch {
  nodeId: string;
  nodeLabel: string;
  entity: ScannedEntity;
  confidence: 'exact' | 'fuzzy';
}

// --- Diagram Analysis / Anti-pattern Detection ---

export type AnalysisRuleSeverity = 'info' | 'warning' | 'error';

export interface AnalysisRule {
  id: string;
  name: string;
  description: string;
}

export interface AnalysisFinding {
  ruleId: string;
  severity: AnalysisRuleSeverity;
  message: string;
  nodeIds?: string[];
}

export interface DiagramAnalysis {
  findings: AnalysisFinding[];
  stats: { nodeCount: number; edgeCount: number; subgraphCount: number };
}

// Parsed diagram structure (for heuristic rules)
export interface MermaidNode { id: string; label: string; }
export interface MermaidEdge { from: string; to: string; label?: string; }
export interface MermaidGraph { type: string; nodes: MermaidNode[]; edges: MermaidEdge[]; subgraphs: string[]; }

// --- Codebase-to-Diagrams ---

export interface FileImport {
  name: string;
  source: string;
  isDefault: boolean;
  isExternal: boolean;
}

export interface AnalyzedFile {
  filePath: string;
  language: string;
  symbols: ScannedEntity[];
  imports: FileImport[];
  exportedSymbols: string[];
  size: number;
}

export interface CodebaseModule {
  name: string;
  path: string;
  files: AnalyzedFile[];
  dependencies: string[];
}

export interface CodebaseAnalysis {
  modules: CodebaseModule[];
  externalDeps: string[];
  entryPoints: string[];
  totalFiles: number;
  totalSymbols: number;
}

export interface DiagramGenerationResult {
  diagrams: Array<{
    id: string;
    name: string;
    code: string;
    level: 1 | 2 | 3;
    moduleRef?: string;
    fileRef?: string;
  }>;
  nodeLinks: Array<{
    sourceDiagramId: string;
    nodeId: string;
    targetDiagramId: string;
    label: string;
  }>;
  folderId?: string;
}

export type CodebaseImportStep = 'scanning' | 'analyzing' | 'generating' | 'creating' | 'linking' | 'done' | 'error';

export interface CodebaseImportProgress {
  step: CodebaseImportStep;
  message: string;
  percent: number;
  filesScanned?: number;
  totalFiles?: number;
  diagramsCreated?: number;
}

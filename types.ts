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

// --- CodeGraph (RFC-0001) ---

export type GraphDepth = 0 | 1 | 2 | 3 | 4;

export type GraphNodeKind =
  | 'system'      // D0: entire codebase
  | 'package'     // D1: top-level module/directory
  | 'module'      // D2: file
  | 'class'       // D3: class/interface
  | 'function'    // D3: function/method
  | 'interface'   // D3: interface/type
  | 'variable'    // D3: exported constant/singleton
  | 'method'      // D4: method inside class
  | 'field';      // D4: class field

export type RelationType =
  | 'contains'
  | 'depends_on'
  | 'implements'
  | 'inherits'
  | 'calls'
  | 'emits'
  | 'subscribes'
  | 'reads'
  | 'writes';

export type ViewLensType = 'component' | 'flow' | 'domain' | 'custom';

export interface SourceReference {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  contentHash: string;
}

export interface GraphNode {
  id: string;
  name: string;
  kind: GraphNodeKind;
  depth: GraphDepth;
  parentId: string | null;
  children: string[];           // child node IDs
  sourceRef: SourceReference | null;
  tags: string[];
  lensConfig: Record<string, {  // per-lens overrides
    visible?: boolean;
    shape?: string;
    style?: string;
  }>;
  domainProjections: string[];  // DomainNode IDs this maps to
}

export interface GraphRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  label?: string;
  lensVisibility: Record<string, boolean>; // lensId → visible
}

export interface ViewLensStyleRule {
  match: {
    kind?: GraphNodeKind[];
    depth?: GraphDepth[];
    tags?: string[];
  };
  shape?: string;    // Mermaid shape: 'rounded', 'stadium', 'cylinder', 'hexagon', etc.
  style?: string;    // Mermaid style string: 'fill:#f9f,stroke:#333'
  className?: string;
}

export interface ViewLens {
  id: string;
  name: string;
  type: ViewLensType;
  nodeFilter: {
    kinds?: GraphNodeKind[];
    minDepth?: GraphDepth;
    maxDepth?: GraphDepth;
    tags?: string[];
  };
  relationFilter: {
    types?: RelationType[];
  };
  styleRules: ViewLensStyleRule[];
  layoutHint: 'TD' | 'LR' | 'BT' | 'RL';
}

export type ProjectionRole = 'primary' | 'supporting' | 'referenced';

export type DomainRelationType = 'owns' | 'triggers' | 'requires' | 'produces' | 'consumes';

export interface DomainNode {
  id: string;
  name: string;
  description?: string;
  projections: Array<{
    graphNodeId: string;
    role: ProjectionRole;
  }>;
  children: string[];   // child DomainNode IDs
  parentId: string | null;
}

export interface DomainRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: DomainRelationType;
  label?: string;
}

export type SyncLockStatus = 'locked' | 'modified' | 'missing';

export interface SyncLockEntry {
  nodeId: string;
  sourceRef: SourceReference;
  status: SyncLockStatus;
  lastChecked: number;
}

export type CodeGraphAnomalyType =
  | 'circular_dependency'
  | 'orphan_node'
  | 'broken_reference'
  | 'high_coupling'
  | 'god_node'
  | 'missing_abstraction'
  | 'hidden_dependency'
  | 'naming_convention';

export type CodeGraphAnomalySeverity = 'info' | 'warning' | 'error';

export interface CodeGraphAnomaly {
  type: CodeGraphAnomalyType;
  severity: CodeGraphAnomalySeverity;
  message: string;
  nodeIds: string[];
  relationIds?: string[];
}

export interface CodeGraphConfig {
  id: string;
  repoId: string;
  depthRules: {
    collapseAbove?: GraphDepth;
    expandBelow?: GraphDepth;
  };
  defaultLensId?: string;
  anomalyThresholds: {
    maxFanOut?: number;
    maxFanIn?: number;
    maxDepth?: GraphDepth;
  };
  scanPatterns: ScanConfig;
}

export interface CodeGraph {
  id: string;
  name: string;
  workspaceId: string;
  repoId: string;
  createdAt: number;
  updatedAt: number;
  nodes: Record<string, GraphNode>;
  relations: Record<string, GraphRelation>;
  domainNodes: Record<string, DomainNode>;
  domainRelations: Record<string, DomainRelation>;
  lenses: ViewLens[];
  activeLensId: string;
  syncLock: Record<string, SyncLockEntry>;
  rootNodeId: string;
}

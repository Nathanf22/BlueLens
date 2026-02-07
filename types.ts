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

export interface RepoConfig {
  id: string;
  name: string;             // Directory name
  workspaceId: string;      // Scoped to workspace
  addedAt: number;
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

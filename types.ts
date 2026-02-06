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

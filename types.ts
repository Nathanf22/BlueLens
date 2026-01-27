export interface Comment {
  id: string;
  x: number;
  y: number;
  content: string;
  createdAt: number;
}

export interface Diagram {
  id: string;
  name: string;
  code: string;
  comments?: Comment[];
  lastModified: number;
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

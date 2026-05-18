import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Workspace, Folder, Diagram, CodeGraph } from '../../types.js';

export interface CodeGraphIndexEntry {
  id: string;
  name: string;
  repoId: string;
  workspaceId: string;
  createdAt: number;
  nodeCount: number;
  relationCount: number;
}

interface BluelensDB {
  version: number;
  workspaces: Workspace[];
  folders: Folder[];
  diagrams: Diagram[];
}

function getDataDir(): string {
  return process.env.BLUELENS_DATA_DIR ?? join(homedir(), '.bluelens');
}

function dbPath(): string { return join(getDataDir(), 'db.json'); }
function codegraphsDir(): string { return join(getDataDir(), 'codegraphs'); }
function codegraphIndexPath(): string { return join(codegraphsDir(), 'index.json'); }
function codegraphFilePath(id: string): string { return join(codegraphsDir(), `${id}.json`); }

async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) await mkdir(path, { recursive: true });
}

async function readDB(): Promise<BluelensDB> {
  await ensureDir(getDataDir());
  if (!existsSync(dbPath())) return { version: 1, workspaces: [], folders: [], diagrams: [] };
  return JSON.parse(await readFile(dbPath(), 'utf-8')) as BluelensDB;
}

async function writeDB(db: BluelensDB): Promise<void> {
  await ensureDir(getDataDir());
  await writeFile(dbPath(), JSON.stringify(db, null, 2), 'utf-8');
}

async function readCodeGraphIndex(): Promise<CodeGraphIndexEntry[]> {
  await ensureDir(codegraphsDir());
  if (!existsSync(codegraphIndexPath())) return [];
  return JSON.parse(await readFile(codegraphIndexPath(), 'utf-8')) as CodeGraphIndexEntry[];
}

async function writeCodeGraphIndex(index: CodeGraphIndexEntry[]): Promise<void> {
  await ensureDir(codegraphsDir());
  await writeFile(codegraphIndexPath(), JSON.stringify(index, null, 2), 'utf-8');
}

function uid(): string { return Math.random().toString(36).slice(2, 11); }

export const storage = {
  async listWorkspaces(): Promise<Workspace[]> {
    return (await readDB()).workspaces;
  },

  async createWorkspace(name: string): Promise<Workspace> {
    const db = await readDB();
    const workspace: Workspace = { id: uid(), name, createdAt: Date.now() };
    db.workspaces.push(workspace);
    await writeDB(db);
    return workspace;
  },

  async deleteWorkspace(id: string): Promise<void> {
    const db = await readDB();
    db.workspaces = db.workspaces.filter(w => w.id !== id);
    db.folders = db.folders.filter(f => f.workspaceId !== id);
    db.diagrams = db.diagrams.filter(d => d.workspaceId !== id);
    await writeDB(db);
  },

  async listFolders(workspaceId: string): Promise<Folder[]> {
    return (await readDB()).folders.filter(f => f.workspaceId === workspaceId);
  },

  async createFolder(workspaceId: string, name: string, parentId: string | null = null): Promise<Folder> {
    const db = await readDB();
    const folder: Folder = { id: uid(), name, workspaceId, parentId };
    db.folders.push(folder);
    await writeDB(db);
    return folder;
  },

  async deleteFolder(id: string): Promise<void> {
    const db = await readDB();
    db.folders = db.folders.filter(f => f.id !== id);
    db.diagrams = db.diagrams.map(d => d.folderId === id ? { ...d, folderId: null } : d);
    await writeDB(db);
  },

  async listDiagrams(workspaceId: string, folderId?: string | null): Promise<Diagram[]> {
    const db = await readDB();
    return db.diagrams.filter(d => {
      if (d.workspaceId !== workspaceId) return false;
      if (folderId !== undefined) return d.folderId === folderId;
      return true;
    });
  },

  async getDiagram(id: string): Promise<Diagram | null> {
    return (await readDB()).diagrams.find(d => d.id === id) ?? null;
  },

  async createDiagram(
    workspaceId: string,
    name: string,
    code: string,
    folderId: string | null = null,
    description?: string,
  ): Promise<Diagram> {
    const db = await readDB();
    const diagram: Diagram = {
      id: uid(), name, code, description,
      lastModified: Date.now(), workspaceId, folderId, nodeLinks: [],
    };
    db.diagrams.push(diagram);
    await writeDB(db);
    return diagram;
  },

  async updateDiagram(
    id: string,
    updates: Partial<Pick<Diagram, 'name' | 'code' | 'description' | 'folderId' | 'nodeLinks'>>,
  ): Promise<Diagram | null> {
    const db = await readDB();
    const idx = db.diagrams.findIndex(d => d.id === id);
    if (idx === -1) return null;
    db.diagrams[idx] = { ...db.diagrams[idx], ...updates, lastModified: Date.now() };
    await writeDB(db);
    return db.diagrams[idx];
  },

  async deleteDiagram(id: string): Promise<void> {
    const db = await readDB();
    db.diagrams = db.diagrams.filter(d => d.id !== id);
    await writeDB(db);
  },

  async listCodeGraphs(workspaceId?: string): Promise<CodeGraphIndexEntry[]> {
    const index = await readCodeGraphIndex();
    return workspaceId ? index.filter(e => e.workspaceId === workspaceId) : index;
  },

  async getCodeGraph(id: string): Promise<CodeGraph | null> {
    const path = codegraphFilePath(id);
    if (!existsSync(path)) return null;
    return JSON.parse(await readFile(path, 'utf-8')) as CodeGraph;
  },

  async saveCodeGraph(graph: CodeGraph): Promise<void> {
    await ensureDir(codegraphsDir());
    await writeFile(codegraphFilePath(graph.id), JSON.stringify(graph, null, 2), 'utf-8');
    const index = await readCodeGraphIndex();
    const entry: CodeGraphIndexEntry = {
      id: graph.id, name: graph.name, repoId: graph.repoId,
      workspaceId: graph.workspaceId, createdAt: graph.createdAt,
      nodeCount: Object.keys(graph.nodes).length,
      relationCount: graph.relations.length,
    };
    const existing = index.findIndex(e => e.id === graph.id);
    if (existing >= 0) index[existing] = entry; else index.push(entry);
    await writeCodeGraphIndex(index);
  },

  async deleteCodeGraph(id: string): Promise<void> {
    const { unlink } = await import('node:fs/promises');
    const path = codegraphFilePath(id);
    if (existsSync(path)) await unlink(path);
    await writeCodeGraphIndex((await readCodeGraphIndex()).filter(e => e.id !== id));
  },
};

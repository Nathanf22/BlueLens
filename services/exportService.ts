import { BlueprintExport, Diagram, Folder, Workspace } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

export function exportDiagram(diagram: Diagram, workspace: Workspace): string {
  const data: BlueprintExport = {
    version: 1,
    exportType: 'diagram',
    exportDate: new Date().toISOString(),
    workspaces: [workspace],
    folders: [],
    diagrams: [diagram],
  };
  return JSON.stringify(data, null, 2);
}

export function exportWorkspace(
  workspace: Workspace,
  diagrams: Diagram[],
  folders: Folder[]
): string {
  const data: BlueprintExport = {
    version: 1,
    exportType: 'workspace',
    exportDate: new Date().toISOString(),
    workspaces: [workspace],
    folders,
    diagrams,
  };
  return JSON.stringify(data, null, 2);
}

export function exportAll(
  workspaces: Workspace[],
  diagrams: Diagram[],
  folders: Folder[]
): string {
  const data: BlueprintExport = {
    version: 1,
    exportType: 'all',
    exportDate: new Date().toISOString(),
    workspaces,
    folders,
    diagrams,
  };
  return JSON.stringify(data, null, 2);
}

export interface BlueprintImportResult {
  workspaces: Workspace[];
  folders: Folder[];
  diagrams: Diagram[];
}

export function importBlueprint(jsonString: string): BlueprintImportResult {
  const data: BlueprintExport = JSON.parse(jsonString);

  if (!data.version || data.version !== 1) {
    throw new Error('Unsupported blueprint version');
  }

  // Build oldId → newId maps
  const idMap = new Map<string, string>();

  for (const ws of data.workspaces) {
    idMap.set(ws.id, generateId());
  }
  for (const folder of data.folders) {
    idMap.set(folder.id, generateId());
  }
  for (const diagram of data.diagrams) {
    idMap.set(diagram.id, generateId());
  }

  const remap = (oldId: string | null): string | null => {
    if (oldId === null) return null;
    return idMap.get(oldId) ?? oldId;
  };

  const workspaces: Workspace[] = data.workspaces.map(ws => ({
    ...ws,
    id: idMap.get(ws.id)!,
  }));

  const folders: Folder[] = data.folders.map(f => ({
    ...f,
    id: idMap.get(f.id)!,
    parentId: remap(f.parentId),
    workspaceId: remap(f.workspaceId)!,
  }));

  const diagrams: Diagram[] = data.diagrams.map(d => ({
    ...d,
    id: idMap.get(d.id)!,
    folderId: remap(d.folderId),
    workspaceId: remap(d.workspaceId)!,
    nodeLinks: (d.nodeLinks || []).map(link => ({
      ...link,
      targetDiagramId: remap(link.targetDiagramId) ?? link.targetDiagramId,
    })),
    comments: d.comments || [],
  }));

  return { workspaces, folders, diagrams };
}

export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

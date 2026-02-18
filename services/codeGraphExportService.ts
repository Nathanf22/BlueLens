/**
 * Converts CodeGraph flows into regular Diagram entries, organized into
 * folders. Root-level flows go in a "End-to-End Flows" sub-folder and
 * module-level flows are grouped by their scope module name.
 */

import { CodeGraph, Diagram, Folder, GraphFlow } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

export interface FlowExportPlan {
  /** Top-level folder name for this export (e.g. "Flows: My Project") */
  parentFolderName: string;
  /** Folder to create: { name, parentId } — parentId null = root */
  foldersToCreate: { tempId: string; name: string; parentTempId: string | null }[];
  /** Diagrams to create (folderId = tempId of folder above) */
  diagramsToCreate: { diagram: Omit<Diagram, 'folderId'> & { folderTempId: string } }[];
}

export interface FlowExportDetection {
  /** Existing parent folder for this graph's export, or null */
  existingFolder: Folder | null;
  /** All diagrams previously exported from this graph */
  existingDiagrams: Diagram[];
}

/** Detect whether this graph was already exported to the diagram list. */
export function detectExistingExport(
  graph: CodeGraph,
  folders: Folder[],
  diagrams: Diagram[],
): FlowExportDetection {
  const parentFolderName = `Flows: ${graph.name}`;
  const existingFolder = folders.find(
    f => f.name === parentFolderName && f.workspaceId === graph.workspaceId && f.parentId === null,
  ) ?? null;

  const existingDiagrams = diagrams.filter(d => d.sourceGraphId === graph.id);

  return { existingFolder, existingDiagrams };
}

/**
 * Build the export plan: folder structure + diagrams from graph flows.
 * If `scopeFilter` is provided, only flows with that scopeNodeId are included.
 */
export function buildExportPlan(graph: CodeGraph, scopeFilter?: string): FlowExportPlan {
  const allFlows = Object.values(graph.flows);
  const flows = scopeFilter !== undefined
    ? allFlows.filter(f => f.scopeNodeId === scopeFilter)
    : allFlows;
  const parentFolderName = `Flows: ${graph.name}`;

  const foldersToCreate: FlowExportPlan['foldersToCreate'] = [];
  const diagramsToCreate: FlowExportPlan['diagramsToCreate'] = [];

  // Top-level folder (parentId = null → workspace root)
  const parentTempId = generateId();
  foldersToCreate.push({ tempId: parentTempId, name: parentFolderName, parentTempId: null });

  // Separate root-level vs module-level flows
  const rootFlows: GraphFlow[] = [];
  const moduleFlows = new Map<string, GraphFlow[]>(); // scopeNodeId → flows

  for (const flow of flows) {
    if (!flow.sequenceDiagram) continue;
    const isRoot = !flow.scopeNodeId || flow.scopeNodeId === graph.rootNodeId;
    if (isRoot) {
      rootFlows.push(flow);
    } else {
      const existing = moduleFlows.get(flow.scopeNodeId) ?? [];
      existing.push(flow);
      moduleFlows.set(flow.scopeNodeId, existing);
    }
  }

  // Root flows → "End-to-End Flows" sub-folder (or directly in parent if only roots)
  if (rootFlows.length > 0) {
    const rootSubTempId = generateId();
    foldersToCreate.push({
      tempId: rootSubTempId,
      name: 'End-to-End Flows',
      parentTempId,
    });
    for (const flow of rootFlows) {
      diagramsToCreate.push({
        diagram: buildDiagram(flow, graph, rootSubTempId),
      });
    }
  }

  // Module flows → one sub-folder per module (named after the node)
  for (const [scopeNodeId, mFlows] of moduleFlows) {
    const moduleNode = graph.nodes[scopeNodeId];
    const moduleName = moduleNode?.name ?? scopeNodeId;
    const moduleTempId = generateId();
    foldersToCreate.push({
      tempId: moduleTempId,
      name: moduleName,
      parentTempId,
    });
    for (const flow of mFlows) {
      diagramsToCreate.push({
        diagram: buildDiagram(flow, graph, moduleTempId),
      });
    }
  }

  return { parentFolderName, foldersToCreate, diagramsToCreate };
}

function buildDiagram(
  flow: GraphFlow,
  graph: CodeGraph,
  folderTempId: string,
): Omit<Diagram, 'folderId'> & { folderTempId: string } {
  return {
    folderTempId,
    id: generateId(),
    name: flow.name,
    description: flow.description,
    code: flow.sequenceDiagram,
    comments: [],
    lastModified: Date.now(),
    workspaceId: graph.workspaceId,
    nodeLinks: [],
    sourceGraphId: graph.id,
    sourceScopeNodeId: flow.scopeNodeId,
  };
}

/**
 * Materialise an export plan into actual Folder[] and Diagram[] arrays,
 * resolving temp IDs to real IDs and wiring up parentId/folderId.
 * Existing folders can be re-used (pass in as `resolvedFolderIds`).
 */
export function materializePlan(
  plan: FlowExportPlan,
  workspaceId: string,
  resolvedFolderIds?: Map<string, string>, // tempId → real folderId (for overwrite mode)
): { folders: Folder[]; diagrams: Diagram[] } {
  const idMap = new Map<string, string>(resolvedFolderIds ?? []);

  const folders: Folder[] = [];
  for (const f of plan.foldersToCreate) {
    // In overwrite mode, re-use the existing folder ID if available
    if (!idMap.has(f.tempId)) {
      idMap.set(f.tempId, generateId());
    }
    folders.push({
      id: idMap.get(f.tempId)!,
      name: f.name,
      parentId: f.parentTempId ? (idMap.get(f.parentTempId) ?? null) : null,
      workspaceId,
    });
  }

  const diagrams: Diagram[] = plan.diagramsToCreate.map(({ diagram }) => ({
    ...diagram,
    folderId: idMap.get(diagram.folderTempId) ?? null,
    workspaceId,
  }));

  return { folders, diagrams };
}

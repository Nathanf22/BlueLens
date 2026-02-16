/**
 * Generates a demo CodeGraph based on the CDMF project.
 * Chrome extension: transparent encryption for web storage APIs,
 * B-Tree indexing, GDPR compliance dashboard.
 */

import { CodeGraph, GraphNode, GraphFlow } from '../types';
import { codeGraphModelService } from './codeGraphModelService';

const id = () => Math.random().toString(36).substr(2, 9);

// ── Module definitions (functional grouping) ─────────────────────────

interface ModuleDef {
  name: string;
  files: string[];
}

const MODULES: ModuleDef[] = [
  {
    name: 'Cryptography & Serialization',
    files: [
      'crypto-handler.js',
      'cdmf-serializer.js',
    ],
  },
  {
    name: 'B-Tree Indexing',
    files: [
      'btree-node.js',
      'btree-manager.js',
      'btree-storage.js',
      'btree-integration.js',
    ],
  },
  {
    name: 'Storage Interception',
    files: [
      'interceptor.js',
      'interceptor-localstorage.js',
      'interceptor-sessionstorage.js',
      'interceptor-cookies.js',
      'interceptor-indexeddb.js',
      'interceptor-init.js',
      'cdmf-config.js',
    ],
  },
  {
    name: 'IndexedDB Handlers',
    files: [
      'src/idb/connection-manager.js',
      'src/idb/crypto-utils.js',
      'src/idb/write-handler.js',
      'src/idb/read-handler.js',
      'src/idb/delete-handler.js',
      'src/idb/clear-handler.js',
      'src/idb/index-handler.js',
    ],
  },
  {
    name: 'GDPR Dashboard',
    files: [
      'gdpr-dashboard/dashboard.js',
      'gdpr-dashboard/state.js',
      'gdpr-dashboard/generator.js',
      'gdpr-dashboard/page-overview.js',
      'gdpr-dashboard/page-explorer.js',
      'gdpr-dashboard/page-vault.js',
      'gdpr-dashboard/page-audit.js',
      'gdpr-dashboard/utils.js',
      'gdpr-dashboard/modal-preview.js',
      'gdpr-dashboard/mock-data.js',
    ],
  },
  {
    name: 'Extension Shell',
    files: [
      'background.js',
      'content.js',
      'popup.js',
      'gdpr-manager.js',
    ],
  },
];

// ── Runtime dependency edges (window namespace injection) ────────────

const IMPORT_EDGES: Array<{ from: string; to: string }> = [
  // Extension Shell → Interception (content.js injects all interceptors)
  { from: 'content.js', to: 'interceptor.js' },
  { from: 'content.js', to: 'interceptor-localstorage.js' },
  { from: 'content.js', to: 'interceptor-sessionstorage.js' },
  { from: 'content.js', to: 'interceptor-cookies.js' },
  { from: 'content.js', to: 'interceptor-indexeddb.js' },
  { from: 'content.js', to: 'interceptor-init.js' },
  { from: 'content.js', to: 'crypto-handler.js' },
  { from: 'content.js', to: 'cdmf-serializer.js' },

  // Interceptors → Crypto
  { from: 'interceptor.js', to: 'crypto-handler.js' },
  { from: 'interceptor.js', to: 'cdmf-config.js' },
  { from: 'interceptor-localstorage.js', to: 'crypto-handler.js' },
  { from: 'interceptor-sessionstorage.js', to: 'crypto-handler.js' },
  { from: 'interceptor-cookies.js', to: 'crypto-handler.js' },
  { from: 'interceptor-init.js', to: 'crypto-handler.js' },

  // Interceptor-indexeddb → IDB handlers
  { from: 'interceptor-indexeddb.js', to: 'src/idb/connection-manager.js' },
  { from: 'interceptor-indexeddb.js', to: 'src/idb/write-handler.js' },
  { from: 'interceptor-indexeddb.js', to: 'src/idb/read-handler.js' },
  { from: 'interceptor-indexeddb.js', to: 'src/idb/delete-handler.js' },
  { from: 'interceptor-indexeddb.js', to: 'src/idb/clear-handler.js' },
  { from: 'interceptor-indexeddb.js', to: 'src/idb/index-handler.js' },

  // IDB handlers → Crypto & Serializer
  { from: 'src/idb/write-handler.js', to: 'crypto-handler.js' },
  { from: 'src/idb/write-handler.js', to: 'cdmf-serializer.js' },
  { from: 'src/idb/crypto-utils.js', to: 'crypto-handler.js' },
  { from: 'src/idb/crypto-utils.js', to: 'cdmf-serializer.js' },
  { from: 'src/idb/read-handler.js', to: 'src/idb/crypto-utils.js' },
  { from: 'src/idb/delete-handler.js', to: 'src/idb/connection-manager.js' },
  { from: 'src/idb/delete-handler.js', to: 'src/idb/crypto-utils.js' },
  { from: 'src/idb/clear-handler.js', to: 'src/idb/connection-manager.js' },

  // IDB index handler → B-Tree
  { from: 'src/idb/index-handler.js', to: 'btree-integration.js' },
  { from: 'src/idb/write-handler.js', to: 'btree-integration.js' },

  // B-Tree internal deps
  { from: 'btree-manager.js', to: 'btree-node.js' },
  { from: 'btree-storage.js', to: 'btree-node.js' },
  { from: 'btree-storage.js', to: 'crypto-handler.js' },
  { from: 'btree-integration.js', to: 'btree-manager.js' },
  { from: 'btree-integration.js', to: 'btree-storage.js' },

  // GDPR Dashboard internal deps
  { from: 'gdpr-dashboard/dashboard.js', to: 'gdpr-dashboard/state.js' },
  { from: 'gdpr-dashboard/dashboard.js', to: 'gdpr-dashboard/page-overview.js' },
  { from: 'gdpr-dashboard/dashboard.js', to: 'gdpr-dashboard/page-explorer.js' },
  { from: 'gdpr-dashboard/dashboard.js', to: 'gdpr-dashboard/page-vault.js' },
  { from: 'gdpr-dashboard/dashboard.js', to: 'gdpr-dashboard/page-audit.js' },
  { from: 'gdpr-dashboard/dashboard.js', to: 'gdpr-dashboard/generator.js' },
  { from: 'gdpr-dashboard/page-overview.js', to: 'gdpr-dashboard/state.js' },
  { from: 'gdpr-dashboard/page-overview.js', to: 'gdpr-dashboard/utils.js' },
  { from: 'gdpr-dashboard/page-explorer.js', to: 'gdpr-dashboard/state.js' },
  { from: 'gdpr-dashboard/page-explorer.js', to: 'gdpr-dashboard/utils.js' },
  { from: 'gdpr-dashboard/page-explorer.js', to: 'gdpr-dashboard/modal-preview.js' },
  { from: 'gdpr-dashboard/page-vault.js', to: 'gdpr-dashboard/state.js' },
  { from: 'gdpr-dashboard/page-audit.js', to: 'gdpr-dashboard/state.js' },
  { from: 'gdpr-dashboard/page-audit.js', to: 'gdpr-dashboard/utils.js' },
  { from: 'gdpr-dashboard/generator.js', to: 'gdpr-dashboard/mock-data.js' },
  { from: 'gdpr-dashboard/generator.js', to: 'gdpr-dashboard/state.js' },

  // GDPR manager → Crypto
  { from: 'gdpr-manager.js', to: 'crypto-handler.js' },

  // Popup → GDPR
  { from: 'popup.js', to: 'gdpr-manager.js' },
];

// ── Graph builder ────────────────────────────────────────────────────

export function generateDemoGraph(workspaceId: string): CodeGraph {
  let graph = codeGraphModelService.createEmptyGraph(workspaceId, '__demo__', 'CDMF');
  const rootId = graph.rootNodeId;

  const moduleIdMap = new Map<string, string>();
  const fileIdMap = new Map<string, string>();

  // D1: Modules
  for (const mod of MODULES) {
    const nodeId = id();
    moduleIdMap.set(mod.name, nodeId);

    const node: GraphNode = {
      id: nodeId,
      name: mod.name,
      kind: 'package',
      depth: 1,
      parentId: rootId,
      children: [],
      sourceRef: null,
      tags: [`${mod.files.length} files`],
      lensConfig: {},
      domainProjections: [],
    };

    const r1 = codeGraphModelService.addNode(graph, node);
    graph = r1.graph;
    const r2 = codeGraphModelService.addRelation(graph, rootId, nodeId, 'contains');
    graph = r2.graph;
  }

  // D2: Files
  for (const mod of MODULES) {
    const moduleNodeId = moduleIdMap.get(mod.name)!;

    for (const filePath of mod.files) {
      const fileNodeId = id();
      fileIdMap.set(filePath, fileNodeId);

      const fileName = filePath.split('/').pop() || filePath;

      const node: GraphNode = {
        id: fileNodeId,
        name: fileName,
        kind: 'module',
        depth: 2,
        parentId: moduleNodeId,
        children: [],
        sourceRef: {
          filePath,
          lineStart: 1,
          lineEnd: 100,
          contentHash: '',
        },
        tags: ['javascript'],
        lensConfig: {},
        domainProjections: [],
      };

      const r1 = codeGraphModelService.addNode(graph, node);
      graph = r1.graph;
      const r2 = codeGraphModelService.addRelation(graph, moduleNodeId, fileNodeId, 'contains');
      graph = r2.graph;
    }
  }

  // Relations: file-level depends_on
  for (const edge of IMPORT_EDGES) {
    const sourceId = fileIdMap.get(edge.from);
    const targetId = fileIdMap.get(edge.to);
    if (sourceId && targetId && sourceId !== targetId) {
      const r = codeGraphModelService.addRelation(graph, sourceId, targetId, 'depends_on');
      graph = r.graph;
    }
  }

  // Relations: module-level depends_on (derived from file edges)
  const moduleDepsSeen = new Set<string>();
  for (const edge of IMPORT_EDGES) {
    const sourceModule = MODULES.find(m => m.files.includes(edge.from));
    const targetModule = MODULES.find(m => m.files.includes(edge.to));
    if (sourceModule && targetModule && sourceModule !== targetModule) {
      const key = `${sourceModule.name}→${targetModule.name}`;
      if (!moduleDepsSeen.has(key)) {
        moduleDepsSeen.add(key);
        const sourceId = moduleIdMap.get(sourceModule.name)!;
        const targetId = moduleIdMap.get(targetModule.name)!;
        const r = codeGraphModelService.addRelation(graph, sourceId, targetId, 'depends_on');
        graph = r.graph;
      }
    }
  }

  // ── Flows ───────────────────────────────────────────────────────────
  // Helper to build step arrays from file paths
  const step = (filePath: string, label: string, order: number): { nodeId: string; label: string; order: number } => ({
    nodeId: fileIdMap.get(filePath) || '',
    label,
    order,
  });

  const modId = (name: string) => moduleIdMap.get(name) || '';

  const flows: Record<string, GraphFlow> = {};

  // ── Root-level flows (end-to-end, scopeNodeId = rootId) ────────────

  // 1. Extension Initialization
  flows['flow-init'] = {
    id: 'flow-init',
    name: 'Extension Initialization',
    description: 'Chrome loads content.js → injects all interceptor scripts → patches native APIs → initializes crypto',
    scopeNodeId: rootId,
    steps: [
      step('content.js', 'Chrome injects content script', 1),
      step('crypto-handler.js', 'Initialize Web Crypto keys', 2),
      step('cdmf-serializer.js', 'Register CDMF serializer', 3),
      step('interceptor.js', 'Create base interceptor', 4),
      step('interceptor-localstorage.js', 'Patch localStorage API', 5),
      step('interceptor-sessionstorage.js', 'Patch sessionStorage API', 6),
      step('interceptor-cookies.js', 'Patch document.cookie', 7),
      step('interceptor-indexeddb.js', 'Patch IndexedDB API', 8),
      step('interceptor-init.js', 'Finalize interception', 9),
    ],
    sequenceDiagram: `sequenceDiagram
    participant Chrome
    participant content.js
    participant crypto-handler
    participant interceptor
    participant interceptor-ls as interceptor-localstorage
    participant interceptor-ss as interceptor-sessionstorage
    participant interceptor-ck as interceptor-cookies
    participant interceptor-idb as interceptor-indexeddb

    Chrome->>content.js: Load content script
    content.js->>crypto-handler: Initialize AES keys
    crypto-handler-->>content.js: Keys ready
    content.js->>interceptor: Create base interceptor
    interceptor->>interceptor-ls: Patch localStorage.setItem/getItem
    interceptor->>interceptor-ss: Patch sessionStorage.setItem/getItem
    interceptor->>interceptor-ck: Patch document.cookie getter/setter
    interceptor->>interceptor-idb: Patch indexedDB.open
    interceptor-->>content.js: All APIs patched
    Note over content.js: Page scripts now use encrypted storage transparently`,
  };

  // 2. localStorage Write (encrypted)
  flows['flow-ls-write'] = {
    id: 'flow-ls-write',
    name: 'localStorage Write',
    description: 'App calls localStorage.setItem → interceptor encrypts value with AES-CBC → stores ciphertext',
    scopeNodeId: rootId,
    steps: [
      step('interceptor-localstorage.js', 'Intercept setItem call', 1),
      step('cdmf-config.js', 'Check if key is in scope', 2),
      step('crypto-handler.js', 'Encrypt value (AES-CBC sync)', 3),
      step('cdmf-serializer.js', 'Wrap in CDMF envelope', 4),
      step('interceptor-localstorage.js', 'Call original setItem', 5),
    ],
    sequenceDiagram: `sequenceDiagram
    participant App as Web App
    participant LS as interceptor-localstorage
    participant Config as cdmf-config
    participant Crypto as crypto-handler
    participant Serializer as cdmf-serializer
    participant Native as Native localStorage

    App->>LS: localStorage.setItem(key, value)
    LS->>Config: isKeyInScope(key)?
    Config-->>LS: true
    LS->>Crypto: encryptSync(value, key)
    Crypto-->>LS: ciphertext
    LS->>Serializer: wrapCDMF(ciphertext, metadata)
    Serializer-->>LS: cdmfEnvelope
    LS->>Native: original.setItem(key, cdmfEnvelope)
    Note over App: App receives no indication of encryption`,
  };

  // 3. localStorage Read (decrypted)
  flows['flow-ls-read'] = {
    id: 'flow-ls-read',
    name: 'localStorage Read',
    description: 'App calls localStorage.getItem → interceptor detects CDMF envelope → decrypts → returns plaintext',
    scopeNodeId: rootId,
    steps: [
      step('interceptor-localstorage.js', 'Intercept getItem call', 1),
      step('cdmf-serializer.js', 'Detect CDMF envelope', 2),
      step('crypto-handler.js', 'Decrypt value (AES-CBC sync)', 3),
      step('interceptor-localstorage.js', 'Return plaintext to app', 4),
    ],
    sequenceDiagram: `sequenceDiagram
    participant App as Web App
    participant LS as interceptor-localstorage
    participant Serializer as cdmf-serializer
    participant Crypto as crypto-handler
    participant Native as Native localStorage

    App->>LS: localStorage.getItem(key)
    LS->>Native: original.getItem(key)
    Native-->>LS: storedValue
    LS->>Serializer: isCDMF(storedValue)?
    Serializer-->>LS: true, extract ciphertext
    LS->>Crypto: decryptSync(ciphertext, key)
    Crypto-->>LS: plaintext
    LS-->>App: plaintext
    Note over App: App receives original value transparently`,
  };

  // 4. IndexedDB Write (encrypted + B-Tree indexed)
  flows['flow-idb-write'] = {
    id: 'flow-idb-write',
    name: 'IndexedDB Write',
    description: 'App puts object → IDB handler encrypts fields → serializes → stores + updates B-Tree index',
    scopeNodeId: rootId,
    steps: [
      step('interceptor-indexeddb.js', 'Intercept IDBObjectStore.put', 1),
      step('src/idb/write-handler.js', 'Process write request', 2),
      step('crypto-handler.js', 'Encrypt object fields (AES-GCM async)', 3),
      step('cdmf-serializer.js', 'Serialize encrypted object', 4),
      step('src/idb/write-handler.js', 'Store via native IDB', 5),
      step('btree-integration.js', 'Update B-Tree index', 6),
      step('btree-manager.js', 'Insert key into tree', 7),
      step('btree-storage.js', 'Persist tree nodes', 8),
    ],
    sequenceDiagram: `sequenceDiagram
    participant App as Web App
    participant IIDB as interceptor-indexeddb
    participant WH as write-handler
    participant Crypto as crypto-handler
    participant Ser as cdmf-serializer
    participant BTree as btree-integration
    participant BM as btree-manager
    participant BS as btree-storage
    participant IDB as Native IndexedDB

    App->>IIDB: objectStore.put(value)
    IIDB->>WH: handlePut(store, value)
    WH->>Crypto: encryptFields(value)
    Crypto-->>WH: encryptedValue
    WH->>Ser: serialize(encryptedValue)
    Ser-->>WH: cdmfRecord
    WH->>IDB: nativeStore.put(cdmfRecord)
    IDB-->>WH: success
    WH->>BTree: indexRecord(key, objectId)
    BTree->>BM: insert(key, objectId)
    BM->>BS: persistNodes(modified)
    BS-->>BTree: stored
    WH-->>App: success`,
  };

  // 5. IndexedDB Read (with decryption)
  flows['flow-idb-read'] = {
    id: 'flow-idb-read',
    name: 'IndexedDB Read',
    description: 'App gets object → IDB handler retrieves → detects CDMF → decrypts fields → returns plaintext object',
    scopeNodeId: rootId,
    steps: [
      step('interceptor-indexeddb.js', 'Intercept IDBObjectStore.get', 1),
      step('src/idb/read-handler.js', 'Process read request', 2),
      step('src/idb/crypto-utils.js', 'Detect & decrypt CDMF fields', 3),
      step('crypto-handler.js', 'Decrypt (AES-GCM async)', 4),
      step('src/idb/read-handler.js', 'Return decrypted object', 5),
    ],
    sequenceDiagram: `sequenceDiagram
    participant App as Web App
    participant IIDB as interceptor-indexeddb
    participant RH as read-handler
    participant CU as crypto-utils
    participant Crypto as crypto-handler
    participant IDB as Native IndexedDB

    App->>IIDB: objectStore.get(key)
    IIDB->>RH: handleGet(store, key)
    RH->>IDB: nativeStore.get(key)
    IDB-->>RH: cdmfRecord
    RH->>CU: decryptRecord(cdmfRecord)
    CU->>Crypto: decrypt(ciphertext)
    Crypto-->>CU: plaintext fields
    CU-->>RH: decryptedObject
    RH-->>App: decryptedObject`,
  };

  // 6. IndexedDB Index Query (B-Tree search)
  flows['flow-idb-query'] = {
    id: 'flow-idb-query',
    name: 'IndexedDB Index Query',
    description: 'App queries by index → B-Tree range search on encrypted index → batch decrypt results',
    scopeNodeId: rootId,
    steps: [
      step('interceptor-indexeddb.js', 'Intercept index.openCursor', 1),
      step('src/idb/index-handler.js', 'Route to B-Tree query', 2),
      step('btree-integration.js', 'Execute range search', 3),
      step('btree-manager.js', 'Walk tree nodes', 4),
      step('src/idb/read-handler.js', 'Batch fetch results', 5),
      step('src/idb/crypto-utils.js', 'Decrypt each result', 6),
    ],
    sequenceDiagram: `sequenceDiagram
    participant App as Web App
    participant IIDB as interceptor-indexeddb
    participant IH as index-handler
    participant BTree as btree-integration
    participant BM as btree-manager
    participant RH as read-handler
    participant CU as crypto-utils
    participant IDB as Native IndexedDB

    App->>IIDB: index.openCursor(range)
    IIDB->>IH: handleIndexQuery(index, range)
    IH->>BTree: rangeSearch(indexName, lower, upper)
    BTree->>BM: search(lower, upper)
    BM-->>BTree: matching objectIds[]
    BTree-->>IH: objectIds[]
    loop For each objectId
        IH->>RH: fetchRecord(objectId)
        RH->>IDB: nativeStore.get(objectId)
        IDB-->>RH: cdmfRecord
        RH->>CU: decryptRecord(cdmfRecord)
        CU-->>RH: plainRecord
        RH-->>IH: plainRecord
    end
    IH-->>App: cursor over decrypted results`,
  };

  // 7. GDPR Data Export
  flows['flow-gdpr-export'] = {
    id: 'flow-gdpr-export',
    name: 'GDPR Data Export',
    description: 'User requests data export from dashboard → scan all storage → decrypt → package as downloadable archive',
    scopeNodeId: rootId,
    steps: [
      step('gdpr-dashboard/page-vault.js', 'User clicks Export', 1),
      step('gdpr-dashboard/state.js', 'Gather storage inventory', 2),
      step('gdpr-manager.js', 'Scan all storage APIs', 3),
      step('crypto-handler.js', 'Decrypt all entries', 4),
      step('gdpr-manager.js', 'Package as JSON archive', 5),
      step('gdpr-dashboard/page-vault.js', 'Trigger download', 6),
    ],
    sequenceDiagram: `sequenceDiagram
    participant User
    participant Vault as page-vault
    participant State as dashboard state
    participant GM as gdpr-manager
    participant Crypto as crypto-handler
    participant LS as localStorage
    participant IDB as IndexedDB

    User->>Vault: Click "Export My Data"
    Vault->>State: getStorageInventory()
    State-->>Vault: inventory
    Vault->>GM: exportAllData(inventory)
    GM->>LS: Scan all localStorage keys
    GM->>IDB: Scan all IDB stores
    loop For each encrypted entry
        GM->>Crypto: decrypt(entry)
        Crypto-->>GM: plaintext
    end
    GM-->>Vault: JSON archive blob
    Vault->>User: Download data-export.json`,
  };

  // 8. GDPR Data Deletion
  flows['flow-gdpr-delete'] = {
    id: 'flow-gdpr-delete',
    name: 'GDPR Data Deletion',
    description: 'User requests right-to-erasure → identify all encrypted entries → delete from storage + B-Tree indexes',
    scopeNodeId: rootId,
    steps: [
      step('gdpr-dashboard/page-vault.js', 'User requests deletion', 1),
      step('gdpr-manager.js', 'Identify CDMF entries', 2),
      step('src/idb/delete-handler.js', 'Delete IDB records', 3),
      step('src/idb/clear-handler.js', 'Clear object stores', 4),
      step('gdpr-manager.js', 'Delete localStorage entries', 5),
      step('gdpr-dashboard/state.js', 'Update dashboard state', 6),
    ],
    sequenceDiagram: `sequenceDiagram
    participant User
    participant Vault as page-vault
    participant GM as gdpr-manager
    participant DH as delete-handler
    participant CH as clear-handler
    participant CM as connection-manager
    participant State as dashboard state

    User->>Vault: Click "Delete All My Data"
    Vault->>Vault: Confirm deletion dialog
    Vault->>GM: deleteAllData()
    GM->>DH: deleteIDBRecords(stores)
    DH->>CM: getConnection(dbName)
    CM-->>DH: connection
    DH->>DH: Delete each record
    GM->>CH: clearStores(storeNames)
    CH->>CM: getConnection(dbName)
    CH->>CH: store.clear()
    GM->>GM: Remove localStorage CDMF keys
    GM-->>Vault: deletion complete
    Vault->>State: refreshInventory()
    State-->>Vault: empty inventory
    Vault->>User: "All data deleted"`,
  };

  // ── Module-level flows (scopeNodeId = module node) ─────────────────

  // Storage Interception: Proxy pattern detail
  flows['flow-intercept-proxy'] = {
    id: 'flow-intercept-proxy',
    name: 'API Proxy Pattern',
    description: 'How interceptors replace native APIs: save original → create proxy → override on window',
    scopeNodeId: modId('Storage Interception'),
    steps: [
      step('interceptor.js', 'Save window.localStorage ref', 1),
      step('interceptor.js', 'Create proxy handler', 2),
      step('interceptor-localstorage.js', 'Define setItem/getItem traps', 3),
      step('cdmf-config.js', 'Load config (which keys to encrypt)', 4),
      step('interceptor-init.js', 'Replace window.localStorage', 5),
    ],
    sequenceDiagram: `sequenceDiagram
    participant Init as interceptor-init
    participant Base as interceptor
    participant LSI as interceptor-localstorage
    participant Config as cdmf-config
    participant Window

    Init->>Base: initInterception()
    Base->>Window: Save original localStorage ref
    Base->>Config: loadConfig()
    Config-->>Base: { encryptedKeys, mode }
    Base->>LSI: createLocalStorageProxy(original, config)
    LSI->>LSI: Define get/set/removeItem traps
    LSI-->>Base: proxyObject
    Base->>Window: window.localStorage = proxyObject
    Note over Window: All future calls go through proxy`,
  };

  // B-Tree: Insert operation
  flows['flow-btree-insert'] = {
    id: 'flow-btree-insert',
    name: 'B-Tree Insert',
    description: 'Insert key into B+ Tree: find leaf → insert → split if overflow → persist modified nodes',
    scopeNodeId: modId('B-Tree Indexing'),
    steps: [
      step('btree-integration.js', 'Receive insert request', 1),
      step('btree-manager.js', 'Find target leaf node', 2),
      step('btree-node.js', 'Insert key in sorted order', 3),
      step('btree-manager.js', 'Split if node overflows', 4),
      step('btree-storage.js', 'Persist modified nodes', 5),
      step('crypto-handler.js', 'Encrypt node data', 6),
    ],
    sequenceDiagram: `sequenceDiagram
    participant BI as btree-integration
    participant BM as btree-manager
    participant BN as btree-node
    participant BS as btree-storage
    participant Crypto as crypto-handler

    BI->>BM: insert(indexName, key, recordId)
    BM->>BM: findLeaf(key) - traverse from root
    BM->>BN: insertKey(key, recordId)
    BN->>BN: Insert in sorted position
    alt Node overflows (keys > order)
        BN-->>BM: overflow
        BM->>BN: split() → left, right, promotedKey
        BM->>BM: Insert promotedKey in parent
        Note over BM: May cascade splits up the tree
    end
    BM->>BS: persistNodes(modifiedNodes[])
    loop For each modified node
        BS->>Crypto: encrypt(nodeData)
        Crypto-->>BS: encryptedNode
        BS->>BS: Store in localStorage
    end`,
  };

  // B-Tree: Search operation
  flows['flow-btree-search'] = {
    id: 'flow-btree-search',
    name: 'B-Tree Range Search',
    description: 'Range query on B+ Tree: find start leaf → follow sibling pointers → collect matching keys',
    scopeNodeId: modId('B-Tree Indexing'),
    steps: [
      step('btree-integration.js', 'Receive range query', 1),
      step('btree-manager.js', 'Find start leaf node', 2),
      step('btree-storage.js', 'Load nodes from storage', 3),
      step('crypto-handler.js', 'Decrypt node data', 4),
      step('btree-node.js', 'Scan keys in range', 5),
      step('btree-manager.js', 'Follow leaf sibling chain', 6),
    ],
    sequenceDiagram: `sequenceDiagram
    participant BI as btree-integration
    participant BM as btree-manager
    participant BS as btree-storage
    participant Crypto as crypto-handler
    participant BN as btree-node

    BI->>BM: rangeSearch(indexName, lower, upper)
    BM->>BS: loadNode(rootId)
    BS->>BS: Read from localStorage
    BS->>Crypto: decrypt(nodeData)
    Crypto-->>BS: plainNode
    BS-->>BM: rootNode
    BM->>BM: Traverse to leaf containing lower bound
    loop Walk leaf chain
        BM->>BN: getKeysInRange(lower, upper)
        BN-->>BM: matchingKeys[]
        alt Has next sibling & keys in range
            BM->>BS: loadNode(siblingId)
            BS-->>BM: siblingNode
        else No more matches
            Note over BM: Stop scanning
        end
    end
    BM-->>BI: allMatchingRecordIds[]`,
  };

  // IndexedDB Handlers: Write pipeline detail
  flows['flow-idb-write-detail'] = {
    id: 'flow-idb-write-detail',
    name: 'Write Handler Pipeline',
    description: 'Detailed write-handler flow: validate → encrypt fields → serialize → store → index',
    scopeNodeId: modId('IndexedDB Handlers'),
    steps: [
      step('src/idb/write-handler.js', 'Receive put/add request', 1),
      step('src/idb/connection-manager.js', 'Get active connection', 2),
      step('src/idb/crypto-utils.js', 'Encrypt sensitive fields', 3),
      step('src/idb/write-handler.js', 'Execute native put', 4),
      step('src/idb/index-handler.js', 'Update indexes', 5),
    ],
    sequenceDiagram: `sequenceDiagram
    participant Proxy as IDB Proxy
    participant WH as write-handler
    participant CM as connection-manager
    participant CU as crypto-utils
    participant IH as index-handler
    participant IDB as Native IDB Store

    Proxy->>WH: handlePut(storeName, value, key)
    WH->>CM: getConnection(dbName)
    CM-->>WH: IDBDatabase
    WH->>CU: encryptRecord(value)
    CU->>CU: Identify encryptable fields
    CU->>CU: AES-GCM encrypt each field
    CU-->>WH: encryptedRecord
    WH->>IDB: transaction.objectStore.put(encryptedRecord)
    IDB-->>WH: resultKey
    WH->>IH: updateIndexes(storeName, resultKey, value)
    IH-->>WH: indexes updated
    WH-->>Proxy: resultKey`,
  };

  // GDPR Dashboard: Page navigation
  flows['flow-gdpr-nav'] = {
    id: 'flow-gdpr-nav',
    name: 'Dashboard Navigation',
    description: 'User navigates between dashboard pages → state updates → page renders with fresh data',
    scopeNodeId: modId('GDPR Dashboard'),
    steps: [
      step('gdpr-dashboard/dashboard.js', 'Handle tab click', 1),
      step('gdpr-dashboard/state.js', 'Update active page', 2),
      step('gdpr-dashboard/page-overview.js', 'Render if Overview', 3),
      step('gdpr-dashboard/page-explorer.js', 'Render if Explorer', 4),
      step('gdpr-dashboard/page-vault.js', 'Render if Vault', 5),
      step('gdpr-dashboard/page-audit.js', 'Render if Audit', 6),
    ],
    sequenceDiagram: `sequenceDiagram
    participant User
    participant Dash as dashboard.js
    participant State as state.js
    participant Over as page-overview
    participant Exp as page-explorer
    participant Vault as page-vault
    participant Audit as page-audit

    User->>Dash: Click "Explorer" tab
    Dash->>State: setActivePage('explorer')
    State-->>Dash: stateUpdated
    Dash->>Dash: Hide current page
    Dash->>Exp: render()
    Exp->>State: getStorageData()
    State-->>Exp: entries[]
    Exp->>Exp: Build DOM table
    Exp-->>User: Explorer page visible`,
  };

  // GDPR Dashboard: Data exploration with preview
  flows['flow-gdpr-explore'] = {
    id: 'flow-gdpr-explore',
    name: 'Storage Explorer',
    description: 'User browses encrypted storage entries → preview modal shows decrypted content',
    scopeNodeId: modId('GDPR Dashboard'),
    steps: [
      step('gdpr-dashboard/page-explorer.js', 'List storage entries', 1),
      step('gdpr-dashboard/state.js', 'Fetch entry data', 2),
      step('gdpr-dashboard/utils.js', 'Format display values', 3),
      step('gdpr-dashboard/modal-preview.js', 'Show preview modal', 4),
    ],
    sequenceDiagram: `sequenceDiagram
    participant User
    participant Exp as page-explorer
    participant State as state.js
    participant Utils as utils.js
    participant Modal as modal-preview

    User->>Exp: Click on storage entry row
    Exp->>State: getEntryDetail(key)
    State-->>Exp: { raw, decrypted, metadata }
    Exp->>Utils: formatValue(decrypted)
    Utils-->>Exp: formattedHTML
    Exp->>Modal: showPreview(key, formattedHTML, metadata)
    Modal->>Modal: Render side-by-side view
    Modal-->>User: Modal with encrypted vs decrypted`,
  };

  graph = { ...graph, flows };

  return graph;
}

export const demoGraphService = {
  generateDemoGraph,
};

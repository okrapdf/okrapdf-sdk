# OkraPDF Plugin Architecture

## Overview

VSCode/Chrome extension-style plugin system for hybrid PDF extraction workflows.
Plugins declare UI contributions, credentials, and workflow nodes via manifests.

## Core Concepts

### Plugin Manifest
```typescript
interface PluginManifest {
  id: 'qwen-vl-extractor';
  name: 'Qwen VL Extraction';
  
  contributes: {
    panels: ['pdf-viewer'];           // Which UI area
    overlays: [{
      id: 'extraction-progress',
      location: 'pdf-viewer',
      trigger: 'on-workflow-running',
    }];
  };
  
  credentials: [{                      // Bundled per plugin
    providerId: 'openrouter',
    required: true,
  }];
  
  workflowNode: {                      // n8n-style node
    type: 'textExtractor',
    inputs: ['pdf-pages'],
    outputs: ['page-text', 'bounding-boxes'],
  };
  
  onComplete: {
    returns: ['extracted-text'],
    uiBehavior: ['enable-chat', 'add-overlay'],
  };
}
```

### Lifecycle Hooks
```
onDocumentOpen    → Plugin activates, registers overlays
onWorkflowStart   → Plugin prepares extraction
onNodeStart       → Node begins processing
onNodeComplete    → Node finished, results available
onNodeError       → Node failed, can retry
onWorkflowComplete → All nodes done
onDocumentClose   → Plugin deactivates, cleanup
```

## Electron IPC Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   React UI   │    │ Redux Store  │    │ Plugin Overlays  │  │
│  │              │◄───│  workflow    │◄───│ (from manifest)  │  │
│  │  PDF Viewer  │    │  slice       │    │                  │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                   ▲                     ▲              │
│         │                   │                     │              │
│         ▼                   │                     │              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    PRELOAD SCRIPT                        │   │
│  │  contextBridge.exposeInMainWorld('pluginAPI', {         │   │
│  │    executeNode: (id, type, ctx) => invoke('plugin:exec')│   │
│  │    onProgress: (cb) => on('plugin:progress', cb)        │   │
│  │  })                                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                    IPC (invoke/handle)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN PROCESS                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Plugin Host                             │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │  │
│  │  │  Registry  │  │  Executor  │  │  Credential Store  │ │  │
│  │  │            │  │            │  │                    │ │  │
│  │  │ plugins[]  │  │ runNode()  │  │ getKey(provider)   │ │  │
│  │  └────────────┘  └────────────┘  └────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Plugin Instances                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ text-       │  │ qwen-vl-    │  │ entity-         │  │  │
│  │  │ extractor   │  │ markdown    │  │ detector        │  │  │
│  │  │             │  │             │  │                 │  │  │
│  │  │ pdfjs-dist  │  │ OpenRouter  │  │ OpenRouter      │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Message Flow

### Extraction Workflow
```
1. User opens PDF
   Renderer ─── invoke('plugin:lifecycle', 'onDocumentOpen') ──▶ Main
   Main dispatches to all plugins with onDocumentOpen hook

2. Workflow starts automatically
   Renderer ─── invoke('plugin:execute-node', {textExtractor}) ──▶ Main
   Main finds plugin, calls executeNode()

3. Progress updates (per page)
   Main ─── send('plugin:progress', {page: 5, total: 12}) ──▶ Renderer
   Renderer updates Redux → UI shows progress bar

4. Node completes
   Main ─── send('plugin:node-complete', {result}) ──▶ Renderer
   Renderer stores result, triggers next node or completes

5. Overlay triggered
   Renderer checks manifest.contributes.overlays
   Renders plugin's overlay component with current state
```

### Credential Flow
```
Plugin needs API key:
  Plugin.executeNode() calls context.getCredential('openrouter')
  Main process looks up encrypted keychain
  Returns key to plugin (never exposed to renderer)
```

## Plugin Development

### Creating a Plugin
```typescript
// src/manifest.ts
export const manifest: PluginManifest = {
  id: 'my-extractor',
  name: 'My Custom Extractor',
  workflowNode: {
    type: 'myExtractor',
    inputs: ['pdf-pages'],
    outputs: ['custom-data'],
  },
  credentials: [{ providerId: 'my-api', required: true }],
};

// src/index.ts
export function createPlugin(): PluginInstance {
  return {
    manifest,
    
    async executeNode(nodeType, context, onProgress) {
      const apiKey = await context.getCredential('my-api');
      
      for (let page = 1; page <= context.totalPages; page++) {
        onProgress(page, context.totalPages);
        // ... process page
      }
      
      return { nodeId: 'my-extractor', status: 'success', pages: {} };
    },
    
    onDocumentOpen(context) {
      console.log('Document opened:', context.workspaceId);
    },
  };
}
```

### Plugin Registration (Main Process)
```typescript
// main.ts
import { createPluginRegistry } from '@okrapdf/plugin-types';
import { createTextExtractorPlugin } from '@okrapdf/plugin-text-extractor';

const registry = createPluginRegistry();
registry.register(createTextExtractorPlugin());

ipcMain.handle('plugin:execute-node', async (event, args) => {
  const plugin = registry.getPluginForNode(args.nodeType);
  if (!plugin) throw new Error(`No plugin for ${args.nodeType}`);
  
  const context: PluginContext = {
    workspaceId: args.workspaceId,
    workspacePath: args.workspacePath,
    totalPages: args.totalPages,
    getCredential: (id) => keychain.get(id),
    reportProgress: (cur, tot) => {
      event.sender.send('plugin:progress', { current: cur, total: tot });
    },
  };
  
  return plugin.executeNode(args.nodeType, context, context.reportProgress);
});
```

## Hybrid Extraction Workflows

Plugins chain together for complex extraction:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    PDF      │    │   pdfjs     │    │  Qwen VL    │
│   Input     │───▶│   text      │───▶│  markdown   │
│             │    │  extractor  │    │  (tables)   │
└─────────────┘    └─────────────┘    └─────────────┘
                          │                  │
                          ▼                  ▼
                   ┌─────────────┐    ┌─────────────┐
                   │   Entity    │    │   Chat      │
                   │  detector   │    │  enabled    │
                   │  (bboxes)   │    │             │
                   └─────────────┘    └─────────────┘
```

Each plugin:
- Declares its inputs/outputs in manifest
- Can access previous node results via `context.getPreviousNodeResult()`
- Bundles its own API credentials
- Provides its own overlay UI for progress/results

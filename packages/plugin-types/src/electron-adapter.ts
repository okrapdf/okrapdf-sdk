import type { PluginInstance, PluginContext, WorkflowNodeResult } from './runtime';
import type { PluginManifest } from './manifest';
import type { PluginRegistry } from './registry';

export interface ElectronPluginAPI {
  'plugin:register': (manifest: PluginManifest) => Promise<void>;
  'plugin:execute-node': (args: {
    pluginId: string;
    nodeType: string;
    workspaceId: string;
    workspacePath: string;
    totalPages: number;
  }) => Promise<WorkflowNodeResult>;
  'plugin:cancel': (args: { pluginId: string; nodeType: string }) => Promise<void>;
  'plugin:get-overlays': (trigger: string) => Promise<Array<{ pluginId: string; overlayId: string }>>;
}

export interface ElectronPluginEvents {
  'plugin:progress': { pluginId: string; nodeType: string; current: number; total: number };
  'plugin:node-complete': { pluginId: string; result: WorkflowNodeResult };
  'plugin:node-error': { pluginId: string; nodeType: string; error: string };
  'plugin:lifecycle': { event: string; pluginId: string; data?: unknown };
}

export interface MainProcessPluginHost {
  registry: PluginRegistry;
  
  registerHandlers(ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => void;
  }): void;
  
  sendToRenderer(
    webContents: { send: (channel: string, data: unknown) => void },
    event: keyof ElectronPluginEvents,
    data: ElectronPluginEvents[keyof ElectronPluginEvents]
  ): void;
}

export interface RendererPluginClient {
  register(manifest: PluginManifest): Promise<void>;
  executeNode(pluginId: string, nodeType: string, context: Omit<PluginContext, 'getCredential' | 'reportProgress' | 'getPreviousNodeResult'>): Promise<WorkflowNodeResult>;
  cancel(pluginId: string, nodeType: string): Promise<void>;
  getOverlays(trigger: string): Promise<Array<{ pluginId: string; overlayId: string }>>;
  
  onProgress(callback: (data: ElectronPluginEvents['plugin:progress']) => void): () => void;
  onNodeComplete(callback: (data: ElectronPluginEvents['plugin:node-complete']) => void): () => void;
  onNodeError(callback: (data: ElectronPluginEvents['plugin:node-error']) => void): () => void;
}

type IpcRenderer = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, listener: (...args: unknown[]) => void) => void;
};

export function createPreloadPluginAPI(ipcRenderer: IpcRenderer): RendererPluginClient {
  return {
    async register(manifest) {
      await ipcRenderer.invoke('plugin:register', manifest);
    },

    async executeNode(pluginId, nodeType, context) {
      return ipcRenderer.invoke('plugin:execute-node', {
        pluginId,
        nodeType,
        workspaceId: context.workspaceId,
        workspacePath: context.workspacePath,
        totalPages: context.totalPages,
      }) as Promise<WorkflowNodeResult>;
    },

    async cancel(pluginId, nodeType) {
      await ipcRenderer.invoke('plugin:cancel', { pluginId, nodeType });
    },

    async getOverlays(trigger) {
      return ipcRenderer.invoke('plugin:get-overlays', trigger) as Promise<Array<{ pluginId: string; overlayId: string }>>;
    },

    onProgress(callback) {
      const listener = (...args: unknown[]) => callback(args[1] as ElectronPluginEvents['plugin:progress']);
      ipcRenderer.on('plugin:progress', listener);
      return () => ipcRenderer.removeListener('plugin:progress', listener);
    },

    onNodeComplete(callback) {
      const listener = (...args: unknown[]) => callback(args[1] as ElectronPluginEvents['plugin:node-complete']);
      ipcRenderer.on('plugin:node-complete', listener);
      return () => ipcRenderer.removeListener('plugin:node-complete', listener);
    },

    onNodeError(callback) {
      const listener = (...args: unknown[]) => callback(args[1] as ElectronPluginEvents['plugin:node-error']);
      ipcRenderer.on('plugin:node-error', listener);
      return () => ipcRenderer.removeListener('plugin:node-error', listener);
    },
  };
}

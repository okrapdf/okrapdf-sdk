import type {
  PluginInstance,
  PluginContext,
  WorkflowNodeResult,
  PluginLifecycleEvent,
  OverlayRenderProps,
} from './runtime';
import type { PluginManifest, OverlayContribution } from './manifest';

export interface PluginRegistry {
  register(plugin: PluginInstance): void;
  unregister(pluginId: string): void;
  getPlugin(pluginId: string): PluginInstance | undefined;
  getAllPlugins(): PluginInstance[];
  
  getPluginForNode(nodeType: string): PluginInstance | undefined;
  getOverlaysForTrigger(trigger: OverlayContribution['trigger']): Array<{
    plugin: PluginInstance;
    overlay: OverlayContribution;
  }>;
  
  dispatchLifecycle(
    event: PluginLifecycleEvent,
    context: PluginContext,
    extra?: { result?: WorkflowNodeResult; results?: WorkflowNodeResult[]; nodeType?: string; error?: Error }
  ): Promise<void>;
}

export function createPluginRegistry(): PluginRegistry {
  const plugins = new Map<string, PluginInstance>();

  return {
    register(plugin: PluginInstance) {
      plugins.set(plugin.manifest.id, plugin);
    },

    unregister(pluginId: string) {
      plugins.delete(pluginId);
    },

    getPlugin(pluginId: string) {
      return plugins.get(pluginId);
    },

    getAllPlugins() {
      return Array.from(plugins.values());
    },

    getPluginForNode(nodeType: string) {
      for (const plugin of plugins.values()) {
        if (plugin.canHandleNode?.(nodeType)) return plugin;
        if (plugin.manifest.workflowNode?.type === nodeType) return plugin;
      }
      return undefined;
    },

    getOverlaysForTrigger(trigger) {
      const result: Array<{ plugin: PluginInstance; overlay: OverlayContribution }> = [];
      
      for (const plugin of plugins.values()) {
        const overlays = plugin.manifest.contributes.overlays ?? [];
        for (const overlay of overlays) {
          if (overlay.trigger === trigger) {
            result.push({ plugin, overlay });
          }
        }
      }
      
      return result.sort((a, b) => (b.overlay.priority ?? 0) - (a.overlay.priority ?? 0));
    },

    async dispatchLifecycle(event, context, extra = {}) {
      const handlers: Array<() => Promise<void>> = [];

      for (const plugin of plugins.values()) {
        switch (event) {
          case 'onDocumentOpen':
            if (plugin.onDocumentOpen) handlers.push(() => plugin.onDocumentOpen!(context));
            break;
          case 'onDocumentClose':
            if (plugin.onDocumentClose) handlers.push(() => plugin.onDocumentClose!(context.workspaceId));
            break;
          case 'onWorkflowStart':
            if (plugin.onWorkflowStart) handlers.push(() => plugin.onWorkflowStart!(context));
            break;
          case 'onWorkflowComplete':
            if (plugin.onWorkflowComplete && extra.results) {
              handlers.push(() => plugin.onWorkflowComplete!(context, extra.results!));
            }
            break;
          case 'onNodeStart':
            if (plugin.onNodeStart && extra.nodeType) {
              handlers.push(() => plugin.onNodeStart!(context, extra.nodeType!));
            }
            break;
          case 'onNodeComplete':
            if (plugin.onNodeComplete && extra.result) {
              handlers.push(() => plugin.onNodeComplete!(context, extra.result!));
            }
            break;
          case 'onNodeError':
            if (plugin.onNodeError && extra.nodeType && extra.error) {
              handlers.push(() => plugin.onNodeError!(context, extra.nodeType!, extra.error!));
            }
            break;
        }
      }

      await Promise.all(handlers.map(h => h().catch(console.error)));
    },
  };
}

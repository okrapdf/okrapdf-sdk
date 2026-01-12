import type { PluginInstance, PluginContext, WorkflowNodeResult, OverlayRenderProps } from '@okrapdf/plugin-types';
import { manifest } from './manifest';

export { manifest } from './manifest';
export { ExtractionProgressOverlay } from './overlay';

export function createTextExtractorPlugin(): PluginInstance {
  return {
    manifest,

    async executeNode(
      nodeType: string,
      context: PluginContext,
      onProgress: (current: number, total: number) => void
    ): Promise<WorkflowNodeResult> {
      if (nodeType !== 'textExtractor') {
        throw new Error(`Unknown node type: ${nodeType}`);
      }

      const pages: Record<number, { page: number; text: string }> = {};

      for (let page = 1; page <= context.totalPages; page++) {
        onProgress(page, context.totalPages);
        pages[page] = { page, text: '' };
      }

      return {
        nodeId: 'text-extractor',
        nodeType: 'textExtractor',
        status: 'success',
        pages,
      };
    },

    renderOverlay(overlayId: string, props: OverlayRenderProps): unknown {
      if (overlayId === 'extraction-progress') {
        return { component: 'ExtractionProgressOverlay', props };
      }
      return null;
    },
  };
}

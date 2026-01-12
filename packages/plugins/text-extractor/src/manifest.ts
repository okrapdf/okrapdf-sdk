import type { PluginManifest } from '@okrapdf/plugin-types';

export const manifest: PluginManifest = {
  id: 'text-extractor',
  name: 'PDF Text Extractor',
  version: '0.1.0',
  description: 'Extract text from PDF pages using pdfjs-dist',

  contributes: {
    panels: ['pdf-viewer'],
    overlays: [
      {
        id: 'extraction-progress',
        location: 'pdf-viewer',
        trigger: 'on-workflow-running',
        priority: 100,
      },
    ],
  },

  workflowNode: {
    type: 'textExtractor',
    displayName: 'Text Extraction',
    icon: 'file-text',
    inputs: ['pdf-pages'],
    outputs: ['page-text'],
    defaultConfig: {},
  },

  onComplete: {
    returns: ['extracted-text'],
    uiBehavior: ['enable-chat'],
  },

  activationEvents: ['onDocument:open'],
};

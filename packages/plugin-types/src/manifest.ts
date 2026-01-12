/**
 * Plugin Manifest Schema
 * 
 * VSCode/Chrome extension style plugin system for OkraPDF.
 * Plugins declare what UI they enhance, what credentials they need,
 * and what workflow nodes they provide.
 */

export type PanelLocation = 'pdf-viewer' | 'chat' | 'sidebar' | 'header';
export type OverlayLocation = 'pdf-viewer' | 'full-screen' | 'panel-header' | 'bottom-bar';
export type OverlayTrigger = 'on-workflow-running' | 'on-workflow-complete' | 'on-error' | 'manual';

export interface OverlayContribution {
  id: string;
  location: OverlayLocation;
  trigger: OverlayTrigger;
  priority?: number;
}

export interface CommandContribution {
  id: string;
  title: string;
  icon?: string;
  when?: string;
}

export interface CredentialRequirement {
  providerId: string;
  required: boolean;
  description?: string;
}

export interface WorkflowNodeContribution {
  type: string;
  displayName: string;
  icon: string;
  inputs: string[];
  outputs: string[];
  defaultConfig?: Record<string, unknown>;
}

export interface PluginContributions {
  panels?: PanelLocation[];
  overlays?: OverlayContribution[];
  commands?: CommandContribution[];
}

export interface PluginOutputs {
  returns: string[];
  uiBehavior?: ('add-overlay' | 'enable-chat' | 'show-notification' | 'update-sidebar')[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  
  contributes: PluginContributions;
  credentials?: CredentialRequirement[];
  workflowNode?: WorkflowNodeContribution;
  onComplete?: PluginOutputs;
  
  activationEvents?: string[];
  main?: string;
}

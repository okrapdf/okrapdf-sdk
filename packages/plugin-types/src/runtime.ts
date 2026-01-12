import type { PluginManifest, WorkflowNodeContribution } from "./manifest";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BboxVertex {
  x: number;
  y: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function bboxToVertices(
  bbox2d: [number, number, number, number],
): BboxVertex[] {
  const [x1, y1, x2, y2] = bbox2d.map((v) => clamp(v / 1000));
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

export function verticesToBbox(
  vertices: BboxVertex[],
): NormalizedBoundingBox | null {
  if (!vertices || vertices.length < 4) return null;

  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);

  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function normalizeBbox(bbox: unknown): NormalizedBoundingBox | null {
  if (!bbox) return null;

  if (Array.isArray(bbox) && bbox.length === 4) {
    const [x1, y1, x2, y2] = bbox as number[];
    const scale = Math.max(x1, y1, x2, y2) > 1 ? 1000 : 1;
    return {
      x: clamp(x1 / scale),
      y: clamp(y1 / scale),
      width: clamp((x2 - x1) / scale),
      height: clamp((y2 - y1) / scale),
    };
  }

  if (typeof bbox === "object") {
    const b = bbox as Record<string, unknown>;

    if ("xmin" in b && "ymin" in b && "xmax" in b && "ymax" in b) {
      const { xmin, ymin, xmax, ymax } = b as {
        xmin: number;
        ymin: number;
        xmax: number;
        ymax: number;
      };
      const scale = Math.max(xmin, ymin, xmax, ymax) > 1 ? 1000 : 1;
      return {
        x: clamp(xmin / scale),
        y: clamp(ymin / scale),
        width: clamp((xmax - xmin) / scale),
        height: clamp((ymax - ymin) / scale),
      };
    }

    if ("x" in b && "y" in b && "width" in b && "height" in b) {
      const x = b.x as number;
      const y = b.y as number;
      const width = b.width as number;
      const height = b.height as number;
      const scale = Math.max(x, y, x + width, y + height) > 1 ? 1000 : 1;
      return {
        x: clamp(x / scale),
        y: clamp(y / scale),
        width: clamp(width / scale),
        height: clamp(height / scale),
      };
    }
  }

  return null;
}

export interface PageExtractionResult {
  page: number;
  text?: string;
  markdown?: string;
  entities?: Array<{
    id: string;
    type: "table" | "figure" | "footnote" | "signature";
    title: string | null;
    bbox: NormalizedBoundingBox | null;
  }>;
  blocks?: Array<{
    text: string;
    bbox: NormalizedBoundingBox | null;
  }>;
}

export interface WorkflowNodeResult {
  nodeId: string;
  nodeType: string;
  status: "success" | "error";
  pages: Record<number, PageExtractionResult>;
  error?: string;
}

export interface PluginContext {
  workspacePath: string;
  workspaceId: string;
  totalPages: number;
  getCredential: (providerId: string) => Promise<string | null>;
  reportProgress: (current: number, total: number) => void;
  getPreviousNodeResult: (
    nodeType: string,
  ) => Promise<WorkflowNodeResult | null>;
}

export type PluginLifecycleEvent =
  | "onDocumentOpen"
  | "onDocumentClose"
  | "onWorkflowStart"
  | "onWorkflowComplete"
  | "onNodeStart"
  | "onNodeComplete"
  | "onNodeError";

export interface PluginLifecycleHooks {
  onDocumentOpen?(context: PluginContext): Promise<void>;
  onDocumentClose?(workspaceId: string): Promise<void>;
  onWorkflowStart?(context: PluginContext): Promise<void>;
  onWorkflowComplete?(
    context: PluginContext,
    results: WorkflowNodeResult[],
  ): Promise<void>;
  onNodeStart?(context: PluginContext, nodeType: string): Promise<void>;
  onNodeComplete?(
    context: PluginContext,
    result: WorkflowNodeResult,
  ): Promise<void>;
  onNodeError?(
    context: PluginContext,
    nodeType: string,
    error: Error,
  ): Promise<void>;
}

export interface PluginInstance extends Partial<PluginLifecycleHooks> {
  manifest: PluginManifest;

  activate?(context: PluginContext): Promise<void>;
  deactivate?(): Promise<void>;

  executeNode?(
    nodeType: string,
    context: PluginContext,
    onProgress: (current: number, total: number) => void,
  ): Promise<WorkflowNodeResult>;

  renderOverlay?(overlayId: string, props: OverlayRenderProps): unknown;

  canHandleNode?(nodeType: string): boolean;
}

export interface OverlayRenderProps {
  isRunning: boolean;
  progress: { current: number; total: number; percentage: number };
  nodeStatuses: Record<string, "pending" | "running" | "success" | "error">;
  onCancel: () => void;
}

export type PluginFactory = () => PluginInstance;

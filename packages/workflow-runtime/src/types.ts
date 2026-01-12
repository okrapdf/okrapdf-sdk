export type WorkflowRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type NodeExecutionStatus = 'pending' | 'queued' | 'running' | 'success' | 'error' | 'skipped' | 'cancelled';

export interface PageResult {
  page: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  result?: unknown;
  error?: string;
  processedAt?: string;
}

export interface NodeExecution {
  nodeId: string;
  nodeType: string;
  status: NodeExecutionStatus;
  progress: {
    current: number;
    total: number;
    unit: 'pages' | 'items' | 'bytes';
  };
  pageResults: Record<number, PageResult>;
  config: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface WorkflowRun {
  id: string;
  workspaceId: string;
  workspacePath: string;
  status: WorkflowRunStatus;
  nodes: Record<string, NodeExecution>;
  nodeOrder: string[];
  totalPages: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface NodeProgress {
  nodeId: string;
  type: 'started' | 'page_complete' | 'page_error' | 'completed' | 'error';
  page?: number;
  totalPages?: number;
  result?: unknown;
  error?: string;
}

export interface CreateRunOptions {
  workspaceId: string;
  workspacePath: string;
  totalPages: number;
  nodes: Array<{
    nodeId: string;
    nodeType: string;
    config?: Record<string, unknown>;
  }>;
}

export interface WorkflowRunnerAdapter {
  executeNode(
    run: WorkflowRun,
    nodeId: string,
    onProgress: (progress: NodeProgress) => void
  ): Promise<void>;
  
  cancelNode(runId: string, nodeId: string): Promise<void>;
  
  retryPage(
    run: WorkflowRun,
    nodeId: string,
    page: number,
    onProgress: (progress: NodeProgress) => void
  ): Promise<void>;
  
  getPageResult(workspacePath: string, nodeType: string, page: number): Promise<unknown>;
}

export interface NodeTypeDefinition {
  type: string;
  displayName: string;
  icon: string;
  inputs: string[];
  outputs: string[];
  defaultConfig: Record<string, unknown>;
}

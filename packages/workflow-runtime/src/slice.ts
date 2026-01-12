import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';
import type {
  WorkflowRun,
  NodeExecution,
  NodeProgress,
  CreateRunOptions,
} from './types';

export interface WorkflowState {
  runs: Record<string, WorkflowRun>;
  activeRunId: string | null;
  runsByWorkspace: Record<string, string[]>;
}

const initialState: WorkflowState = {
  runs: {},
  activeRunId: null,
  runsByWorkspace: {},
};

function createNodeExecution(
  nodeId: string,
  nodeType: string,
  totalPages: number,
  config: Record<string, unknown> = {}
): NodeExecution {
  return {
    nodeId,
    nodeType,
    status: 'pending',
    progress: { current: 0, total: totalPages, unit: 'pages' },
    pageResults: {},
    config,
    retryCount: 0,
    maxRetries: 3,
  };
}

export const workflowSlice = createSlice({
  name: 'workflow',
  initialState,
  reducers: {
    createRun: (state, action: PayloadAction<CreateRunOptions>) => {
      const { workspaceId, workspacePath, totalPages, nodes } = action.payload;
      const runId = nanoid();
      const now = new Date().toISOString();

      const nodeExecutions: Record<string, NodeExecution> = {};
      const nodeOrder: string[] = [];

      for (const node of nodes) {
        nodeExecutions[node.nodeId] = createNodeExecution(
          node.nodeId,
          node.nodeType,
          totalPages,
          node.config
        );
        nodeOrder.push(node.nodeId);
      }

      const run: WorkflowRun = {
        id: runId,
        workspaceId,
        workspacePath,
        status: 'pending',
        nodes: nodeExecutions,
        nodeOrder,
        totalPages,
        createdAt: now,
        updatedAt: now,
      };

      state.runs[runId] = run;
      state.activeRunId = runId;

      if (!state.runsByWorkspace[workspaceId]) {
        state.runsByWorkspace[workspaceId] = [];
      }
      state.runsByWorkspace[workspaceId].push(runId);
    },

    startRun: (state, action: PayloadAction<{ runId: string }>) => {
      const run = state.runs[action.payload.runId];
      if (run && run.status === 'pending') {
        run.status = 'running';
        run.updatedAt = new Date().toISOString();
      }
    },

    pauseRun: (state, action: PayloadAction<{ runId: string }>) => {
      const run = state.runs[action.payload.runId];
      if (run && run.status === 'running') {
        run.status = 'paused';
        run.updatedAt = new Date().toISOString();
      }
    },

    resumeRun: (state, action: PayloadAction<{ runId: string }>) => {
      const run = state.runs[action.payload.runId];
      if (run && run.status === 'paused') {
        run.status = 'running';
        run.updatedAt = new Date().toISOString();
      }
    },

    cancelRun: (state, action: PayloadAction<{ runId: string }>) => {
      const run = state.runs[action.payload.runId];
      if (run && (run.status === 'running' || run.status === 'paused')) {
        run.status = 'cancelled';
        run.updatedAt = new Date().toISOString();
        for (const node of Object.values(run.nodes)) {
          if (node.status === 'running' || node.status === 'queued') {
            node.status = 'cancelled';
          }
        }
      }
    },

    completeRun: (state, action: PayloadAction<{ runId: string }>) => {
      const run = state.runs[action.payload.runId];
      if (run) {
        run.status = 'completed';
        run.completedAt = new Date().toISOString();
        run.updatedAt = run.completedAt;
      }
    },

    failRun: (state, action: PayloadAction<{ runId: string; error: string }>) => {
      const run = state.runs[action.payload.runId];
      if (run) {
        run.status = 'failed';
        run.error = action.payload.error;
        run.updatedAt = new Date().toISOString();
      }
    },

    startNode: (state, action: PayloadAction<{ runId: string; nodeId: string }>) => {
      const run = state.runs[action.payload.runId];
      const node = run?.nodes[action.payload.nodeId];
      if (node) {
        node.status = 'running';
        node.startedAt = new Date().toISOString();
      }
    },

    updateNodeProgress: (
      state,
      action: PayloadAction<{ runId: string; nodeId: string; progress: NodeProgress }>
    ) => {
      const { runId, nodeId, progress } = action.payload;
      const run = state.runs[runId];
      const node = run?.nodes[nodeId];
      if (!node) return;

      run.updatedAt = new Date().toISOString();

      switch (progress.type) {
        case 'started':
          node.status = 'running';
          node.startedAt = new Date().toISOString();
          if (progress.totalPages) {
            node.progress.total = progress.totalPages;
          }
          break;

        case 'page_complete':
          if (progress.page !== undefined) {
            node.pageResults[progress.page] = {
              page: progress.page,
              status: 'success',
              result: progress.result,
              processedAt: new Date().toISOString(),
            };
            node.progress.current = Object.keys(node.pageResults).filter(
              (p) => node.pageResults[Number(p)].status === 'success'
            ).length;
          }
          break;

        case 'page_error':
          if (progress.page !== undefined) {
            node.pageResults[progress.page] = {
              page: progress.page,
              status: 'error',
              error: progress.error,
              processedAt: new Date().toISOString(),
            };
          }
          break;

        case 'completed':
          node.status = 'success';
          node.completedAt = new Date().toISOString();
          node.progress.current = node.progress.total;
          break;

        case 'error':
          node.status = 'error';
          node.error = progress.error;
          node.completedAt = new Date().toISOString();
          break;
      }
    },

    retryNode: (state, action: PayloadAction<{ runId: string; nodeId: string }>) => {
      const run = state.runs[action.payload.runId];
      const node = run?.nodes[action.payload.nodeId];
      if (node && node.status === 'error' && node.retryCount < node.maxRetries) {
        node.status = 'queued';
        node.retryCount++;
        node.error = undefined;
        run.updatedAt = new Date().toISOString();
      }
    },

    retryPage: (
      state,
      action: PayloadAction<{ runId: string; nodeId: string; page: number }>
    ) => {
      const { runId, nodeId, page } = action.payload;
      const run = state.runs[runId];
      const node = run?.nodes[nodeId];
      if (node?.pageResults[page]) {
        node.pageResults[page] = {
          page,
          status: 'pending',
        };
        run.updatedAt = new Date().toISOString();
      }
    },

    setActiveRun: (state, action: PayloadAction<string | null>) => {
      state.activeRunId = action.payload;
    },

    deleteRun: (state, action: PayloadAction<{ runId: string }>) => {
      const run = state.runs[action.payload.runId];
      if (run) {
        const workspaceRuns = state.runsByWorkspace[run.workspaceId];
        if (workspaceRuns) {
          state.runsByWorkspace[run.workspaceId] = workspaceRuns.filter(
            (id) => id !== action.payload.runId
          );
        }
        delete state.runs[action.payload.runId];
        if (state.activeRunId === action.payload.runId) {
          state.activeRunId = null;
        }
      }
    },
  },
});

export const {
  createRun,
  startRun,
  pauseRun,
  resumeRun,
  cancelRun,
  completeRun,
  failRun,
  startNode,
  updateNodeProgress,
  retryNode,
  retryPage,
  setActiveRun,
  deleteRun,
} = workflowSlice.actions;

export default workflowSlice.reducer;

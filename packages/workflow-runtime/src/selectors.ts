import { createSelector } from '@reduxjs/toolkit';
import type { WorkflowState } from './slice';


type RootState = { workflow: WorkflowState };

export const selectWorkflowState = (state: RootState) => state.workflow;

export const selectAllRuns = createSelector(
  selectWorkflowState,
  (workflow) => Object.values(workflow.runs)
);

export const selectActiveRunId = createSelector(
  selectWorkflowState,
  (workflow) => workflow.activeRunId
);

export const selectActiveRun = createSelector(
  selectWorkflowState,
  selectActiveRunId,
  (workflow, activeId) => (activeId ? workflow.runs[activeId] : null)
);

export const selectRunById = (runId: string) =>
  createSelector(selectWorkflowState, (workflow) => workflow.runs[runId] ?? null);

export const selectRunsByWorkspace = (workspaceId: string) =>
  createSelector(selectWorkflowState, (workflow) => {
    const runIds = workflow.runsByWorkspace[workspaceId] ?? [];
    return runIds.map((id) => workflow.runs[id]).filter(Boolean);
  });

export const selectLatestRunForWorkspace = (workspaceId: string) =>
  createSelector(selectRunsByWorkspace(workspaceId), (runs) => {
    if (runs.length === 0) return null;
    return runs.reduce((latest, run) =>
      new Date(run.createdAt) > new Date(latest.createdAt) ? run : latest
    );
  });

export const selectNodeExecution = (runId: string, nodeId: string) =>
  createSelector(
    selectRunById(runId),
    (run) => run?.nodes[nodeId] ?? null
  );

export const selectRunProgress = (runId: string) =>
  createSelector(selectRunById(runId), (run) => {
    if (!run) return { completed: 0, total: 0, percentage: 0 };

    let totalPages = 0;
    let completedPages = 0;

    for (const node of Object.values(run.nodes)) {
      totalPages += node.progress.total;
      completedPages += node.progress.current;
    }

    return {
      completed: completedPages,
      total: totalPages,
      percentage: totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0,
    };
  });

export const selectNodeProgress = (runId: string, nodeId: string) =>
  createSelector(selectNodeExecution(runId, nodeId), (node) => {
    if (!node) return { completed: 0, total: 0, percentage: 0 };
    return {
      completed: node.progress.current,
      total: node.progress.total,
      percentage:
        node.progress.total > 0
          ? Math.round((node.progress.current / node.progress.total) * 100)
          : 0,
    };
  });

export const selectFailedPages = (runId: string, nodeId: string) =>
  createSelector(selectNodeExecution(runId, nodeId), (node) => {
    if (!node) return [];
    return Object.values(node.pageResults)
      .filter((p) => p.status === 'error')
      .map((p) => p.page);
  });

export const selectIsRunning = (runId: string) =>
  createSelector(selectRunById(runId), (run) => run?.status === 'running');

export const selectIsComplete = (runId: string) =>
  createSelector(selectRunById(runId), (run) => run?.status === 'completed');

export const selectCanRetry = (runId: string, nodeId: string) =>
  createSelector(selectNodeExecution(runId, nodeId), (node) => {
    if (!node) return false;
    return node.status === 'error' && node.retryCount < node.maxRetries;
  });

export const selectActiveRunStatus = createSelector(selectActiveRun, (run) => ({
  status: run?.status ?? 'idle',
  nodeStatuses: run
    ? Object.fromEntries(
        Object.entries(run.nodes).map(([id, node]) => [id, node.status])
      )
    : {},
}));

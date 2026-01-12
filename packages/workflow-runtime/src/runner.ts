import type { Dispatch } from '@reduxjs/toolkit';
import type { WorkflowRun, WorkflowRunnerAdapter, NodeProgress, CreateRunOptions } from './types';
import {
  createRun,
  startRun,
  startNode,
  updateNodeProgress,
  completeRun,
  failRun,
  cancelRun,
} from './slice';

export class WorkflowRunner {
  private adapter: WorkflowRunnerAdapter;
  private dispatch: Dispatch;
  private getState: () => { workflow: { runs: Record<string, WorkflowRun> } };
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(
    adapter: WorkflowRunnerAdapter,
    dispatch: Dispatch,
    getState: () => { workflow: { runs: Record<string, WorkflowRun> } }
  ) {
    this.adapter = adapter;
    this.dispatch = dispatch;
    this.getState = getState;
  }

  async createAndStart(options: CreateRunOptions): Promise<string> {
    this.dispatch(createRun(options));
    const state = this.getState();
    const runs = Object.values(state.workflow.runs);
    const run = runs[runs.length - 1];
    
    if (run) {
      await this.start(run.id);
      return run.id;
    }
    throw new Error('Failed to create run');
  }

  async start(runId: string): Promise<void> {
    const run = this.getState().workflow.runs[runId];
    if (!run) throw new Error(`Run ${runId} not found`);

    this.dispatch(startRun({ runId }));

    const abortController = new AbortController();
    this.abortControllers.set(runId, abortController);

    try {
      for (const nodeId of run.nodeOrder) {
        if (abortController.signal.aborted) break;

        const currentRun = this.getState().workflow.runs[runId];
        if (currentRun.status === 'cancelled' || currentRun.status === 'paused') break;

        this.dispatch(startNode({ runId, nodeId }));

        await this.adapter.executeNode(currentRun, nodeId, (progress: NodeProgress) => {
          this.dispatch(updateNodeProgress({ runId, nodeId, progress }));
        });

        const updatedRun = this.getState().workflow.runs[runId];
        const node = updatedRun.nodes[nodeId];
        if (node.status === 'error') {
          this.dispatch(failRun({ runId, error: node.error || 'Node execution failed' }));
          return;
        }
      }

      const finalRun = this.getState().workflow.runs[runId];
      if (finalRun.status === 'running') {
        this.dispatch(completeRun({ runId }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.dispatch(failRun({ runId, error: message }));
    } finally {
      this.abortControllers.delete(runId);
    }
  }

  async cancel(runId: string): Promise<void> {
    const abortController = this.abortControllers.get(runId);
    if (abortController) {
      abortController.abort();
    }

    const run = this.getState().workflow.runs[runId];
    if (run) {
      for (const nodeId of Object.keys(run.nodes)) {
        await this.adapter.cancelNode(runId, nodeId).catch(() => {});
      }
    }

    this.dispatch(cancelRun({ runId }));
  }

  async retryFailedPages(runId: string, nodeId: string): Promise<void> {
    const run = this.getState().workflow.runs[runId];
    if (!run) return;

    const node = run.nodes[nodeId];
    if (!node) return;

    const failedPages = Object.values(node.pageResults)
      .filter((p) => p.status === 'error')
      .map((p) => p.page);

    for (const page of failedPages) {
      await this.adapter.retryPage(run, nodeId, page, (progress: NodeProgress) => {
        this.dispatch(updateNodeProgress({ runId, nodeId, progress }));
      });
    }
  }
}

import { WorkflowRunner } from './runner';

let runnerInstance: WorkflowRunner | null = null;

export function initializeWorkflowRunner(runner: WorkflowRunner) {
  runnerInstance = runner;
}

export function getWorkflowRunner(): WorkflowRunner {
  if (!runnerInstance) {
    throw new Error('WorkflowRunner not initialized. Call initializeWorkflowRunner first.');
  }
  return runnerInstance;
}

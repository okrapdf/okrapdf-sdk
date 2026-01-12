import { createSelector } from '@reduxjs/toolkit';
import type { ExtractionState } from './slice';

type RootState = { extraction: ExtractionState };

export const selectExtractionState = (state: RootState) => state.extraction;

export const selectWorkspaceId = createSelector(
  selectExtractionState,
  (extraction) => extraction.workspaceId
);

export const selectWorkspacePath = createSelector(
  selectExtractionState,
  (extraction) => extraction.workspacePath
);

export const selectExtractionStatus = createSelector(
  selectExtractionState,
  (extraction) => extraction.status
);

export const selectExtractionProgress = createSelector(
  selectExtractionState,
  (extraction) => extraction.progress
);

export const selectTotalPages = createSelector(
  selectExtractionState,
  (extraction) => extraction.totalPages
);

export const selectExtractionError = createSelector(
  selectExtractionState,
  (extraction) => extraction.error
);

export const selectIsExtracting = createSelector(
  selectExtractionStatus,
  (status) => status === 'extracting'
);

export const selectIsExtractionComplete = createSelector(
  selectExtractionStatus,
  (status) => status === 'completed'
);

export const selectExtractionPercentage = createSelector(
  selectExtractionProgress,
  selectTotalPages,
  (progress, totalPages) => {
    if (!progress || totalPages === 0) return 0;
    return Math.round((progress.currentPage / totalPages) * 100);
  }
);

export const selectHasWorkspace = createSelector(
  selectWorkspaceId,
  selectWorkspacePath,
  (id, path) => !!id && !!path
);

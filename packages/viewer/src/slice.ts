import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface WorkspaceFile {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface ViewerState {
  workspaceFiles: WorkspaceFile[];
  ocrFiles: WorkspaceFile[];
  lastViewedCount: number;
}

const initialState: ViewerState = {
  workspaceFiles: [],
  ocrFiles: [],
  lastViewedCount: 0,
};

const filterSystemFiles = (files: WorkspaceFile[]) =>
  files.filter(f => !f.name.startsWith('.') && f.name !== 'Thumbs.db');

export const viewerSlice = createSlice({
  name: 'viewer',
  initialState,
  reducers: {
    setWorkspaceFiles: (state, action: PayloadAction<WorkspaceFile[]>) => {
      state.workspaceFiles = filterSystemFiles(action.payload);
    },
    
    setOcrFiles: (state, action: PayloadAction<WorkspaceFile[]>) => {
      state.ocrFiles = filterSystemFiles(action.payload);
    },
    
    markFilesViewed: (state) => {
      state.lastViewedCount = state.workspaceFiles.length + state.ocrFiles.length;
    },
    
    clearViewer: () => initialState,
  },
});

export const {
  setWorkspaceFiles,
  setOcrFiles,
  markFilesViewed,
  clearViewer,
} = viewerSlice.actions;

export const selectWorkspaceFiles = (state: { viewer: ViewerState }) => state.viewer.workspaceFiles;
export const selectOcrFiles = (state: { viewer: ViewerState }) => state.viewer.ocrFiles;
export const selectNewFileCount = (state: { viewer: ViewerState }) => {
  const total = state.viewer.workspaceFiles.length + state.viewer.ocrFiles.length;
  return Math.max(0, total - state.viewer.lastViewedCount);
};

export default viewerSlice.reducer;

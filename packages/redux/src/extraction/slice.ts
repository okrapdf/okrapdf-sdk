import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';

export type ExtractionStatus = 'idle' | 'extracting' | 'completed' | 'failed';

export interface ExtractionProgressEvent {
  phase: 'text' | 'tables' | 'metadata';
  currentPage: number;
  totalPages: number;
  status: 'processing' | 'completed' | 'failed';
  message?: string;
  error?: string;
}

export interface PageContent {
  page: number;
  content: string;
  blocks?: Array<{ text: string; bbox?: { x: number; y: number; width: number; height: number } }>;
}

export interface ExtractedTable {
  id: string;
  page: number;
  markdown: string;
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number };
  confidence?: number;
  status: 'pending' | 'verified' | 'flagged' | 'rejected';
}

export interface ExtractionState {
  workspaceId: string | null;
  workspacePath: string | null;
  status: ExtractionStatus;
  progress: ExtractionProgressEvent | null;
  totalPages: number;
  error: string | null;
}

const initialState: ExtractionState = {
  workspaceId: null,
  workspacePath: null,
  status: 'idle',
  progress: null,
  totalPages: 0,
  error: null,
};

export interface ExtractionAdapter {
  startTextExtraction: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  cancelExtraction: () => Promise<void>;
  getPageCount: (workspacePath: string) => Promise<number>;
  getPageContent: (workspacePath: string, page: number) => Promise<PageContent | null>;
  getPageContents: (workspacePath: string, pages: number[]) => Promise<PageContent[]>;
  savePageContent: (workspacePath: string, page: number, content: string) => Promise<void>;
  subscribeToProgress: (
    workspaceId: string,
    callback: (event: ExtractionProgressEvent & { workspaceId: string }) => void
  ) => () => void;
}

let extractionAdapter: ExtractionAdapter | null = null;

export function setExtractionAdapter(adapter: ExtractionAdapter) {
  extractionAdapter = adapter;
}

export function getExtractionAdapter(): ExtractionAdapter {
  if (!extractionAdapter) {
    throw new Error('ExtractionAdapter not set. Call setExtractionAdapter first.');
  }
  return extractionAdapter;
}

export const initializeWorkspace = createAsyncThunk(
  'extraction/initializeWorkspace',
  async (
    { workspaceId, workspacePath }: { workspaceId: string; workspacePath: string },
    { dispatch }
  ) => {
    const adapter = getExtractionAdapter();
    const pageCount = await adapter.getPageCount(workspacePath);
    
    if (pageCount > 0) {
      const page1 = await adapter.getPageContent(workspacePath, 1);
      if (page1) {
        return { workspaceId, workspacePath, totalPages: pageCount, status: 'completed' as const };
      }
    }
    
    return { workspaceId, workspacePath, totalPages: pageCount, status: 'idle' as const };
  }
);

export const startExtraction = createAsyncThunk(
  'extraction/startExtraction',
  async (_, { getState, dispatch }) => {
    const state = (getState() as { extraction: ExtractionState }).extraction;
    if (!state.workspaceId) {
      throw new Error('No workspace set');
    }
    
    const adapter = getExtractionAdapter();
    const result = await adapter.startTextExtraction(state.workspaceId);
    
    if (!result.success) {
      throw new Error(result.error || 'Extraction failed');
    }
    
    return result;
  }
);

export const cancelExtraction = createAsyncThunk(
  'extraction/cancelExtraction',
  async () => {
    const adapter = getExtractionAdapter();
    await adapter.cancelExtraction();
  }
);

export const extractionSlice = createSlice({
  name: 'extraction',
  initialState,
  reducers: {
    setWorkspace: (
      state,
      action: PayloadAction<{ workspaceId: string; workspacePath: string }>
    ) => {
      state.workspaceId = action.payload.workspaceId;
      state.workspacePath = action.payload.workspacePath;
      state.status = 'idle';
      state.progress = null;
      state.error = null;
    },
    
    clearWorkspace: (state) => {
      state.workspaceId = null;
      state.workspacePath = null;
      state.status = 'idle';
      state.progress = null;
      state.totalPages = 0;
      state.error = null;
    },
    
    setProgress: (state, action: PayloadAction<ExtractionProgressEvent>) => {
      state.progress = action.payload;
      state.totalPages = action.payload.totalPages;
      
      if (action.payload.status === 'completed') {
        state.status = 'completed';
      } else if (action.payload.status === 'failed') {
        state.status = 'failed';
        state.error = action.payload.error || 'Extraction failed';
      } else {
        state.status = 'extracting';
      }
    },
    
    setTotalPages: (state, action: PayloadAction<number>) => {
      state.totalPages = action.payload;
    },
    
    setStatus: (state, action: PayloadAction<ExtractionStatus>) => {
      state.status = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      if (action.payload) {
        state.status = 'failed';
      }
    },
  },
  
  extraReducers: (builder) => {
    builder
      .addCase(initializeWorkspace.pending, (state) => {
        state.status = 'idle';
        state.error = null;
      })
      .addCase(initializeWorkspace.fulfilled, (state, action) => {
        state.workspaceId = action.payload.workspaceId;
        state.workspacePath = action.payload.workspacePath;
        state.totalPages = action.payload.totalPages;
        state.status = action.payload.status;
      })
      .addCase(initializeWorkspace.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to initialize workspace';
      })
      .addCase(startExtraction.pending, (state) => {
        state.status = 'extracting';
        state.error = null;
        state.progress = { phase: 'text', currentPage: 0, totalPages: state.totalPages, status: 'processing' };
      })
      .addCase(startExtraction.fulfilled, () => {})
      .addCase(startExtraction.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Extraction failed';
      })
      .addCase(cancelExtraction.fulfilled, (state) => {
        state.status = 'idle';
        state.progress = null;
      });
  },
});

export const {
  setWorkspace,
  clearWorkspace,
  setProgress,
  setTotalPages,
  setStatus,
  setError,
} = extractionSlice.actions;

export default extractionSlice.reducer;

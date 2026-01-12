export type {
  ISearchProvider,
  SearchMatch,
  SearchState,
  SearchOptions,
} from "./search";

export {
  viewerSlice,
  setWorkspaceFiles,
  setOcrFiles,
  markFilesViewed,
  clearViewer,
  selectWorkspaceFiles,
  selectOcrFiles,
  selectNewFileCount,
  type ViewerState,
  type WorkspaceFile,
} from "./slice";
export { default as viewerReducer } from "./slice";

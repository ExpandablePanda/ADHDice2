import { combineProjectionRevisions, createProjectionDomainRevision } from "@/lib/stable-task-projection";

export function createTasksCanvasRenderRevision(input: {
  activeTabId: string;
  currentFolderId: string | null;
  folderBreadcrumbIds: string[];
  openFolderRailIds: string[];
  searchResultIds: string[];
  selectedBucket: string;
  selectedTaskIds: string[];
  surface: string;
  taskDerivationRevision: string;
  view: string;
}) {
  return combineProjectionRevisions(
    input.taskDerivationRevision,
    createProjectionDomainRevision("tasks-canvas", {
      activeTabId: input.activeTabId,
      currentFolderId: input.currentFolderId,
      folderBreadcrumbIds: input.folderBreadcrumbIds,
      openFolderRailIds: input.openFolderRailIds,
      searchResultIds: input.searchResultIds,
      selectedBucket: input.selectedBucket,
      selectedTaskIds: input.selectedTaskIds,
      surface: input.surface,
      view: input.view,
    }),
  );
}

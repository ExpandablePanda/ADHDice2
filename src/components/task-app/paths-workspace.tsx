"use client";

import { Archive, Check, ChevronDown, Copy, Footprints, Link2, Plus, RotateCcw, Search, Trash2, Unlink, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@/lib/database.types";
import { formatTaskStatusLabel, renderTaskStatusCircle } from "@/components/task-app/task-status-ui";
import {
  createLocalStoragePathsStorageAdapter,
  getLocalPathDateKey,
  LOCAL_PATHS_PROTOTYPE_USER_ID,
  PATH_TYPES,
  type PathNode,
  type PathProgress,
  type PathRecord,
  type PathType,
} from "@/lib/paths-domain";
import {
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_INPUT_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { getSelectableTaskStatuses } from "@/lib/task-complete";

type LinkedTaskOption = Pick<Task, "id" | "repeat_frequency" | "status" | "title" | "trashed_at">;

type PathsWorkspaceProps = {
  onOpenTask?: (taskId: string) => void;
  onSetTaskStatus?: (taskId: string, status: Task["status"]) => void;
  tasks?: LinkedTaskOption[];
  userId?: string | null;
};

const PATH_TYPE_LABELS: Record<PathType, string> = {
  daily_reset: "Daily reset",
  one_time: "One time",
  reset_flow: "Reset flow",
};

const EMPTY_PROGRESS: PathProgress = {
  completedNodeIds: [],
  dateKey: null,
  pathId: "",
  updatedAt: "",
  userId: LOCAL_PATHS_PROTOTYPE_USER_ID,
};

const CANVAS_WIDTH = 1180;
const CANVAS_HEIGHT = 720;
const NODE_CARD_WIDTH = 252;
const NODE_CARD_HEIGHT = 116;
const CANVAS_NODE_PADDING = 24;
const LINKED_TASK_MENU_PANEL_CLASS = "rounded-[1rem] border border-[#e9e3f7] bg-white p-2 shadow-[0_18px_36px_rgba(34,24,74,0.12)] dark:border-white/10 dark:bg-[#1d1731]";
const LINKED_TASK_CHIP_CLASS = `${TASK_TABLE_CHIP_BASE_CLASS} gap-0 overflow-hidden border-[#e4deef] bg-[#f4f5f8] px-0 text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60`;
const PATH_PROGRESS_MARKER_COLOR = "#9b8bf0";

function cubicBezierPoint(start: number, controlA: number, controlB: number, end: number, t: number) {
  const inverse = 1 - t;
  return (inverse ** 3 * start) + (3 * inverse ** 2 * t * controlA) + (3 * inverse * t ** 2 * controlB) + (t ** 3 * end);
}

function cubicBezierTangent(start: number, controlA: number, controlB: number, end: number, t: number) {
  const inverse = 1 - t;
  return (3 * inverse ** 2 * (controlA - start))
    + (6 * inverse * t * (controlB - controlA))
    + (3 * t ** 2 * (end - controlB));
}

function getConnectionMarkerOffsets(startX: number, startY: number, endX: number, endY: number) {
  const distance = Math.hypot(endX - startX, endY - startY);
  if (distance < 220) {
    return [0.38, 0.68];
  }
  if (distance < 360) {
    return [0.28, 0.5, 0.72];
  }
  return [0.22, 0.42, 0.62, 0.8];
}

function PathLinkedTaskPill({
  onOpenTask,
  onSetTaskStatus,
  task,
}: {
  onOpenTask?: (taskId: string) => void;
  onSetTaskStatus?: (taskId: string, status: Task["status"]) => void;
  task: LinkedTaskOption;
}) {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLSpanElement | null>(null);
  const statusOptions = useMemo(() => getSelectableTaskStatuses(task), [task]);

  useEffect(() => {
    if (!isStatusMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (statusMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsStatusMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isStatusMenuOpen]);

  return (
    <span className="relative inline-flex max-w-full" data-path-node-control ref={statusMenuRef}>
      <span className={LINKED_TASK_CHIP_CLASS}>
        <button
          className="min-w-0 max-w-[190px] truncate px-2 py-1 text-left text-[13px] font-medium leading-none"
          disabled={!onOpenTask}
          onClick={(event) => {
            event.stopPropagation();
            onOpenTask?.(task.id);
          }}
          title={task.title}
          type="button"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{task.title}</span>
          </span>
        </button>
        <button
          aria-label={`Change task status from ${formatTaskStatusLabel(task.status)}`}
          className="flex h-[26px] items-center justify-center border-l border-[#d7cff6] px-1.5 dark:border-[#433567] [&>span]:h-4 [&>span]:w-4"
          onClick={(event) => {
            event.stopPropagation();
            setIsStatusMenuOpen((current) => !current);
          }}
          type="button"
        >
          {renderTaskStatusCircle(task.status, "sm")}
        </button>
      </span>
      {isStatusMenuOpen ? (
        <div className={`absolute left-0 top-[calc(100%+6px)] z-20 flex min-w-[190px] flex-col gap-1 ${LINKED_TASK_MENU_PANEL_CLASS}`}>
          {statusOptions.map((status) => (
            <button
              className={`flex items-center gap-2 rounded-[0.85rem] px-2.5 py-2 text-left text-[13px] font-medium transition ${
                status === task.status
                  ? "bg-[#f3efff] text-[#6f57f6] dark:bg-[#241b42] dark:text-[#cabfff]"
                  : "text-[#5f5878] hover:bg-[#f7f3ff] dark:text-white/72 dark:hover:bg-white/8"
              }`}
              key={status}
              onClick={(event) => {
                event.stopPropagation();
                onSetTaskStatus?.(task.id, status);
                setIsStatusMenuOpen(false);
              }}
              type="button"
            >
              {renderTaskStatusCircle(status, "sm")}
              <span>{formatTaskStatusLabel(status)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

function LinkedTaskPicker({
  linkedTaskById,
  linkedTasks,
  onSelectTask,
  selectedTaskId,
}: {
  linkedTaskById: Map<string, LinkedTaskOption>;
  linkedTasks: LinkedTaskOption[];
  onSelectTask: (taskId: string | null) => void;
  selectedTaskId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedTask = selectedTaskId ? linkedTaskById.get(selectedTaskId) ?? null : null;
  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return linkedTasks;
    }
    return linkedTasks.filter((task) => task.title.toLowerCase().includes(normalizedQuery));
  }, [linkedTasks, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (pickerRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <div className="relative" ref={pickerRef}>
      <button
        aria-expanded={isOpen}
        className={`${TASK_TABLE_INPUT_CLASS} flex items-center justify-between gap-2 text-left`}
        onClick={() => {
          setQuery("");
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        <span className="min-w-0 truncate">
          {selectedTask ? selectedTask.title : "No linked task"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#8c84aa] transition dark:text-white/50 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <div className={`absolute left-0 right-0 top-[calc(100%+0.55rem)] z-30 ${LINKED_TASK_MENU_PANEL_CLASS}`}>
          <label className="flex items-center gap-2 rounded-[0.95rem] border border-[#efe9ff] bg-[#fbfaff] px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#6f57f6] dark:text-[#c9bbff]" />
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[#27304c] outline-none placeholder:text-[#97a0b9] dark:text-white dark:placeholder:text-white/35"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks"
              value={query}
            />
          </label>
          <div className="mt-2 flex max-h-60 flex-col gap-1 overflow-y-auto">
            <button
              className={`flex items-center justify-between rounded-[0.9rem] px-3 py-2 text-left text-[13px] font-medium transition ${
                selectedTaskId === null
                  ? `${TASK_TABLE_ACTIVE_LIST_CHIP_CLASS} border`
                  : "text-[#5f5878] hover:bg-[#f7f3ff] dark:text-white/72 dark:hover:bg-white/8"
              }`}
              onClick={() => {
                onSelectTask(null);
                setIsOpen(false);
              }}
              type="button"
            >
              <span>No linked task</span>
              {selectedTaskId === null ? <Check className="h-3.5 w-3.5" /> : null}
            </button>
            {filteredTasks.length > 0 ? filteredTasks.map((task) => (
              <button
                className={`flex items-center justify-between gap-2 rounded-[0.9rem] px-3 py-2 text-left text-[13px] font-medium transition ${
                  selectedTaskId === task.id
                    ? `${TASK_TABLE_ACTIVE_LIST_CHIP_CLASS} border`
                    : "text-[#5f5878] hover:bg-[#f7f3ff] dark:text-white/72 dark:hover:bg-white/8"
                }`}
                key={task.id}
                onClick={() => {
                  onSelectTask(task.id);
                  setIsOpen(false);
                }}
                type="button"
              >
                <span className="truncate">{task.title}</span>
                {selectedTaskId === task.id ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            )) : (
              <div className="rounded-[0.9rem] border border-dashed border-[#e6e0f5] px-3 py-3 text-[13px] text-[#8a84a3] dark:border-white/10 dark:text-white/45">
                No tasks match that search.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PathsWorkspace({ onOpenTask, onSetTaskStatus, tasks = [], userId }: PathsWorkspaceProps) {
  const workspaceUserId = userId ?? LOCAL_PATHS_PROTOTYPE_USER_ID;
  const adapter = useMemo(() => createLocalStoragePathsStorageAdapter({ userId: workspaceUserId }), [workspaceUserId]);
  const [pathRecords, setPathRecords] = useState<PathRecord[]>([]);
  const [progressByPathId, setProgressByPathId] = useState<Record<string, PathProgress>>({});
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPathType, setCreatePathType] = useState<PathType>("reset_flow");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectSourceNodeId, setConnectSourceNodeId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    nodeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const todayKey = getLocalPathDateKey();
  const linkedTasks = useMemo(
    () => tasks
      .filter((task) => !task.trashed_at)
      .sort((left, right) => left.title.localeCompare(right.title)),
    [tasks],
  );
  const linkedTaskById = useMemo(
    () => new Map(linkedTasks.map((task) => [task.id, task])),
    [linkedTasks],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPaths() {
      const records = await adapter.listPaths({ userId: workspaceUserId });
      if (cancelled) {
        return;
      }

      const progressEntries = await Promise.all(records.map((record) => adapter.getPathProgress({
        dateKey: getProgressDateKey(record.path.pathType, todayKey),
        pathId: record.path.id,
        userId: workspaceUserId,
      })));

      if (cancelled) {
        return;
      }

      setPathRecords(records);
      setProgressByPathId(Object.fromEntries(progressEntries.map((progress) => [progress.pathId, progress])));
      setSelectedPathId((current) => current && records.some((record) => record.path.id === current)
        ? current
        : records.find((record) => !record.path.archivedAt)?.path.id ?? records[0]?.path.id ?? null);
    }

    void loadPaths();

    return () => {
      cancelled = true;
    };
  }, [adapter, todayKey, workspaceUserId]);

  const selectedRecord = pathRecords.find((record) => record.path.id === selectedPathId) ?? null;
  const selectedProgress = selectedRecord ? progressByPathId[selectedRecord.path.id] ?? EMPTY_PROGRESS : EMPTY_PROGRESS;
  const completedNodeIds = useMemo(() => new Set(selectedProgress.completedNodeIds), [selectedProgress.completedNodeIds]);
  const selectedNode = selectedRecord?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const nodeById = useMemo(
    () => new Map((selectedRecord?.nodes ?? []).map((node) => [node.id, node])),
    [selectedRecord?.nodes],
  );
  const connectionSegments = useMemo(() => (
    selectedRecord?.nodes.flatMap((node) => node.nextNodeIds.flatMap((nextNodeId) => {
      const targetNode = nodeById.get(nextNodeId);
      if (!targetNode) {
        return [];
      }

      const startX = node.position.x + NODE_CARD_WIDTH;
      const startY = node.position.y + NODE_CARD_HEIGHT / 2;
      const endX = targetNode.position.x;
      const endY = targetNode.position.y + NODE_CARD_HEIGHT / 2;
      const controlOffset = Math.max(80, Math.abs(endX - startX) * 0.42);

      return [{
        controlOffset,
        endX,
        endY,
        id: `${node.id}-${nextNodeId}`,
        sourceCompleted: completedNodeIds.has(node.id),
        startX,
        startY,
      }];
    })) ?? []
  ), [completedNodeIds, nodeById, selectedRecord?.nodes]);
  const activePathRecords = pathRecords.filter((record) => !record.path.archivedAt);
  const archivedPathRecords = pathRecords.filter((record) => record.path.archivedAt);

  async function saveRecord(nextRecord: PathRecord) {
    const saved = await adapter.savePath({ nodes: nextRecord.nodes, path: nextRecord.path });
    setPathRecords((current) => [
      ...current.filter((record) => record.path.id !== saved.path.id),
      saved,
    ].sort((left, right) => left.path.sortOrder - right.path.sortOrder || left.path.title.localeCompare(right.path.title)));
    return saved;
  }

  async function createPath() {
    const now = new Date().toISOString();
    const id = createPathId("path");
    const saved = await saveRecord({
      nodes: [],
      path: {
        archivedAt: null,
        createdAt: now,
        description: createDescription.trim() || null,
        id,
        pathType: createPathType,
        sortOrder: pathRecords.length,
        title: createTitle.trim() || "Untitled path",
        updatedAt: now,
        userId: workspaceUserId,
      },
    });
    setCreateDescription("");
    setCreatePathType("reset_flow");
    setCreateTitle("");
    setSelectedPathId(saved.path.id);
    setStatusMessage("Path created.");
  }

  async function updateSelectedPath(patch: Partial<Pick<PathRecord["path"], "description" | "pathType" | "title">>) {
    if (!selectedRecord) {
      return;
    }

    const saved = await saveRecord({
      ...selectedRecord,
      path: {
        ...selectedRecord.path,
        ...patch,
        description: patch.description === undefined ? selectedRecord.path.description : patch.description?.trim() || null,
        title: patch.title === undefined ? selectedRecord.path.title : patch.title.trim() || "Untitled path",
        updatedAt: new Date().toISOString(),
      },
    });
    if (patch.pathType) {
      const progress = await adapter.getPathProgress({
        dateKey: getProgressDateKey(saved.path.pathType, todayKey),
        pathId: saved.path.id,
        userId: workspaceUserId,
      });
      setProgressByPathId((current) => ({ ...current, [saved.path.id]: progress }));
    }
  }

  async function archiveSelectedPath() {
    if (!selectedRecord) {
      return;
    }

    const archived = await adapter.archivePath({
      archivedAt: selectedRecord.path.archivedAt ? null : new Date().toISOString(),
      pathId: selectedRecord.path.id,
      userId: workspaceUserId,
    });
    if (!archived) {
      return;
    }

    setPathRecords((current) => current.map((record) => record.path.id === archived.path.id ? archived : record));
    setStatusMessage(archived.path.archivedAt ? "Path archived." : "Path restored.");
  }

  async function deleteSelectedPath() {
    if (!selectedRecord) {
      return;
    }

    const confirmed = window.confirm(`Delete "${selectedRecord.path.title}"? PATHS progress for this path will also be removed.`);
    if (!confirmed) {
      return;
    }

    const deleted = await adapter.deletePath({ pathId: selectedRecord.path.id, userId: workspaceUserId });
    if (!deleted) {
      return;
    }

    setPathRecords((current) => current.filter((record) => record.path.id !== selectedRecord.path.id));
    setProgressByPathId((current) => {
      const next = { ...current };
      delete next[selectedRecord.path.id];
      return next;
    });
    setSelectedPathId(activePathRecords.find((record) => record.path.id !== selectedRecord.path.id)?.path.id ?? null);
    setStatusMessage("Path deleted.");
  }

  async function addNode() {
    await addNodeAt(getFallbackNodePosition(selectedRecord?.nodes.length ?? 0));
  }

  async function addNodeAt(position: { x: number; y: number }) {
    if (!selectedRecord) {
      return;
    }

    const node: PathNode = {
      id: createPathId(`${selectedRecord.path.id}-node`),
      linkedTaskId: null,
      nextNodeIds: [],
      note: null,
      pathId: selectedRecord.path.id,
      position: clampCanvasPosition(position),
      sortOrder: selectedRecord.nodes.length,
      title: "New chip",
    };
    await saveRecord({
      ...selectedRecord,
      nodes: normalizeNodeOrder([...selectedRecord.nodes, node]),
      path: { ...selectedRecord.path, updatedAt: new Date().toISOString() },
    });
    setSelectedNodeId(node.id);
    setStatusMessage("Chip added.");
  }

  async function updateNode(nodeId: string, patch: Partial<Pick<PathNode, "linkedTaskId" | "nextNodeIds" | "note" | "position" | "title">>) {
    if (!selectedRecord) {
      return;
    }

    await saveRecord({
      ...selectedRecord,
      nodes: selectedRecord.nodes.map((node) => node.id === nodeId
        ? {
            ...node,
            ...patch,
            linkedTaskId: patch.linkedTaskId === undefined ? node.linkedTaskId : patch.linkedTaskId,
            nextNodeIds: patch.nextNodeIds === undefined ? node.nextNodeIds : patch.nextNodeIds,
            note: patch.note === undefined ? node.note : patch.note.trim() || null,
            position: patch.position === undefined ? node.position : clampCanvasPosition(patch.position),
            title: patch.title === undefined ? node.title : patch.title.trim() || "Untitled node",
          }
        : node),
      path: { ...selectedRecord.path, updatedAt: new Date().toISOString() },
    });
  }

  async function deleteNode(nodeId: string) {
    if (!selectedRecord) {
      return;
    }

    const nextNodes = normalizeNodeOrder(selectedRecord.nodes.filter((node) => node.id !== nodeId));
    await saveRecord({
      ...selectedRecord,
      nodes: nextNodes.map((node) => ({
        ...node,
        nextNodeIds: node.nextNodeIds.filter((nextNodeId) => nextNodeId !== nodeId),
      })),
      path: { ...selectedRecord.path, updatedAt: new Date().toISOString() },
    });
    setSelectedNodeId((current) => current === nodeId ? null : current);
    setConnectSourceNodeId((current) => current === nodeId ? null : current);
    if (completedNodeIds.has(nodeId)) {
      await saveProgress([...completedNodeIds].filter((id) => id !== nodeId));
    }
  }

  async function duplicateNode(nodeId: string) {
    if (!selectedRecord) {
      return;
    }

    const source = selectedRecord.nodes.find((node) => node.id === nodeId);
    if (!source) {
      return;
    }

    const duplicate: PathNode = {
      ...source,
      id: createPathId(`${selectedRecord.path.id}-node`),
      nextNodeIds: [],
      position: clampCanvasPosition({ x: source.position.x + 36, y: source.position.y + 36 }),
      sortOrder: selectedRecord.nodes.length,
      title: `${source.title} copy`,
    };
    await saveRecord({
      ...selectedRecord,
      nodes: normalizeNodeOrder([...selectedRecord.nodes, duplicate]),
      path: { ...selectedRecord.path, updatedAt: new Date().toISOString() },
    });
    setSelectedNodeId(duplicate.id);
    setStatusMessage("Chip duplicated.");
  }

  async function connectNodes(sourceNodeId: string, targetNodeId: string) {
    if (!selectedRecord || sourceNodeId === targetNodeId) {
      return;
    }

    const sourceNode = selectedRecord.nodes.find((node) => node.id === sourceNodeId);
    const targetNode = selectedRecord.nodes.find((node) => node.id === targetNodeId);
    if (!sourceNode || !targetNode || sourceNode.nextNodeIds.includes(targetNodeId)) {
      setConnectSourceNodeId(null);
      return;
    }

    await updateNode(sourceNodeId, { nextNodeIds: [...sourceNode.nextNodeIds, targetNodeId] });
    setConnectSourceNodeId(null);
    setSelectedNodeId(targetNodeId);
    setStatusMessage("Chips connected.");
  }

  async function removeConnection(sourceNodeId: string, targetNodeId: string) {
    const sourceNode = selectedRecord?.nodes.find((node) => node.id === sourceNodeId);
    if (!sourceNode) {
      return;
    }

    await updateNode(sourceNodeId, {
      nextNodeIds: sourceNode.nextNodeIds.filter((nextNodeId) => nextNodeId !== targetNodeId),
    });
    setStatusMessage("Connection removed.");
  }

  function updateNodePositionLocally(nodeId: string, position: { x: number; y: number }) {
    if (!selectedRecord) {
      return;
    }

    const nextPosition = clampCanvasPosition(position);
    setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id
      ? {
          ...record,
          nodes: record.nodes.map((node) => node.id === nodeId ? { ...node, position: nextPosition } : node),
        }
      : record));
  }

  async function persistNodePosition(nodeId: string, position: { x: number; y: number }) {
    await updateNode(nodeId, { position });
  }

  async function toggleNodeComplete(nodeId: string) {
    const nextCompleted = completedNodeIds.has(nodeId)
      ? [...completedNodeIds].filter((id) => id !== nodeId)
      : [...completedNodeIds, nodeId];
    await saveProgress(nextCompleted);
  }

  async function saveProgress(completedNodeIdsInput: string[]) {
    if (!selectedRecord) {
      return;
    }

    const progress = await adapter.savePathProgress({
      completedNodeIds: completedNodeIdsInput,
      dateKey: getProgressDateKey(selectedRecord.path.pathType, todayKey),
      pathId: selectedRecord.path.id,
      userId: workspaceUserId,
    });
    setProgressByPathId((current) => ({ ...current, [selectedRecord.path.id]: progress }));
  }

  const completedCount = selectedRecord?.nodes.filter((node) => completedNodeIds.has(node.id)).length ?? 0;
  const totalCount = selectedRecord?.nodes.length ?? 0;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <section className="mt-4">
      <div className="mx-auto max-w-[1480px] space-y-3">
        <div className="rounded-[1.35rem] border border-[#ece8f8] bg-white/92 shadow-[0_18px_48px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0ecfa] px-4 py-3 dark:border-white/10">
            <div className="flex min-w-[260px] flex-1 flex-wrap items-center gap-2">
              <select
                className={`${TASK_TABLE_INPUT_CLASS} max-w-[320px]`}
                onChange={(event) => {
                  setSelectedPathId(event.target.value || null);
                  setSelectedNodeId(null);
                  setConnectSourceNodeId(null);
                }}
                value={selectedPathId ?? ""}
              >
                <option value="">Select a path</option>
                {[...activePathRecords, ...archivedPathRecords].map((record) => (
                  <option key={record.path.id} value={record.path.id}>
                    {record.path.title}{record.path.archivedAt ? " (archived)" : ""}
                  </option>
                ))}
              </select>
              <span className="rounded-full border border-[#dff0e5] bg-[#f2fbf5] px-2 py-1 text-[13px] font-medium leading-none text-[#4b7f5b] dark:border-[#2d5a3c] dark:bg-[#102516] dark:text-[#9dd9ad]">
                Saved locally
              </span>
              {selectedRecord ? (
                <span className="rounded-full border border-[#e4deef] bg-[#f4f5f8] px-2 py-1 text-[13px] font-medium leading-none text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60">
                  {completedCount}/{totalCount} Steps · {progressPercent}%
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TaskTableChipButton disabled={!selectedRecord} onClick={() => { void addNode(); }} toneClassName={TASK_TABLE_ACTIVE_LIST_CHIP_CLASS}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add chip
              </TaskTableChipButton>
              <TaskTableChipButton
                disabled={!selectedNode}
                onClick={() => {
                  if (!selectedNode) {
                    return;
                  }
                  setConnectSourceNodeId(selectedNode.id);
                  setStatusMessage("Click a target chip to connect.");
                }}
                toneClassName={connectSourceNodeId ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
              >
                <Link2 className="mr-1 h-3.5 w-3.5" />
                Connect
              </TaskTableChipButton>
              <TaskTableChipButton disabled={!selectedRecord} onClick={() => { void saveProgress([]); }} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Reset
              </TaskTableChipButton>
            </div>
          </div>

          <div className="grid min-h-[720px] gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              {selectedRecord ? (
                <div className="relative h-[720px] overflow-auto bg-[#fdfcff] dark:bg-[#100d1b]">
                  <div
                    className="relative min-h-[720px] min-w-[1180px] cursor-crosshair overflow-hidden"
                    onClick={(event) => {
                      if (event.target !== event.currentTarget) {
                        return;
                      }
                      void addNodeAt(getCanvasPoint(event.clientX, event.clientY, canvasRef.current));
                    }}
                    ref={canvasRef}
                    style={{
                      backgroundImage: "radial-gradient(circle, rgba(111,87,246,0.18) 1px, transparent 1.5px)",
                      backgroundSize: "28px 28px",
                    }}
                  >
                    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                      {connectionSegments.map((segment) => (
                        <path
                          className="drop-shadow-[0_1px_1px_rgba(111,87,246,0.14)]"
                          d={`M ${segment.startX} ${segment.startY} C ${segment.startX + segment.controlOffset} ${segment.startY}, ${segment.endX - segment.controlOffset} ${segment.endY}, ${segment.endX} ${segment.endY}`}
                          fill="none"
                          key={segment.id}
                          stroke="#b7a8f8"
                          strokeLinecap="round"
                          strokeWidth="2"
                        />
                      ))}
                    </svg>
                    {connectionSegments.flatMap((segment) => {
                      if (!segment.sourceCompleted) {
                        return [];
                      }

                      return getConnectionMarkerOffsets(segment.startX, segment.startY, segment.endX, segment.endY).map((offset, index) => {
                        const x = cubicBezierPoint(segment.startX, segment.startX + segment.controlOffset, segment.endX - segment.controlOffset, segment.endX, offset);
                        const y = cubicBezierPoint(segment.startY, segment.startY, segment.endY, segment.endY, offset);
                        const tangentX = cubicBezierTangent(segment.startX, segment.startX + segment.controlOffset, segment.endX - segment.controlOffset, segment.endX, offset);
                        const tangentY = cubicBezierTangent(segment.startY, segment.startY, segment.endY, segment.endY, offset);
                        const rotation = Math.atan2(tangentY, tangentX) * (180 / Math.PI);

                        return (
                          <span
                            className="pointer-events-none absolute z-[1] opacity-80"
                            key={`${segment.id}-marker-${offset}`}
                            style={{
                              left: x,
                              top: y,
                              transform: `translate(-50%, -50%) rotate(${rotation + (index % 2 === 0 ? 0 : 10)}deg)`,
                            }}
                          >
                            <Footprints className="h-3.5 w-3.5" style={{ color: PATH_PROGRESS_MARKER_COLOR }} />
                          </span>
                        );
                      });
                    })}

                    {selectedRecord.nodes.length === 0 ? (
                      <button
                        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[1rem] border border-dashed border-[#cfc3f8] bg-white/90 px-4 py-3 text-sm font-semibold text-[#6f57f6] shadow-[0_16px_40px_rgba(111,87,246,0.12)] dark:border-white/15 dark:bg-[#191329] dark:text-[#cabfff]"
                        onClick={() => { void addNodeAt({ x: 480, y: 300 }); }}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        Click canvas to add chip.
                      </button>
                    ) : null}

                    {selectedRecord.nodes.map((node) => {
                      const linkedTask = node.linkedTaskId ? linkedTaskById.get(node.linkedTaskId) : null;
                      const isComplete = completedNodeIds.has(node.id);
                      const isSelected = node.id === selectedNodeId;
                      const isConnectSource = node.id === connectSourceNodeId;

                      return (
                        <div
                          className={`absolute rounded-[1rem] border bg-white/95 p-3 shadow-[0_18px_42px_rgba(81,61,168,0.10)] transition dark:bg-[#1b152d]/95 ${isSelected ? "border-[#7f67ff] ring-4 ring-[#ddd4ff]" : "border-[#ece8f8]"} ${isComplete ? "opacity-75" : ""} ${isConnectSource ? "outline outline-2 outline-offset-2 outline-[#6f57f6]" : ""}`}
                          key={node.id}
                          onClick={() => {
                            if (connectSourceNodeId) {
                              void connectNodes(connectSourceNodeId, node.id);
                              return;
                            }
                            setSelectedNodeId(node.id);
                          }}
                          onPointerDown={(event) => {
                            if ((event.target as HTMLElement).closest("[data-path-node-control]")) {
                              return;
                            }
                            setSelectedNodeId(node.id);
                            dragRef.current = {
                              nodeId: node.id,
                              pointerId: event.pointerId,
                              startClientX: event.clientX,
                              startClientY: event.clientY,
                              startX: node.position.x,
                              startY: node.position.y,
                            };
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={(event) => {
                            const drag = dragRef.current;
                            if (!drag || drag.nodeId !== node.id || drag.pointerId !== event.pointerId) {
                              return;
                            }
                            updateNodePositionLocally(node.id, {
                              x: drag.startX + event.clientX - drag.startClientX,
                              y: drag.startY + event.clientY - drag.startClientY,
                            });
                          }}
                          onPointerUp={(event) => {
                            const drag = dragRef.current;
                            if (!drag || drag.nodeId !== node.id || drag.pointerId !== event.pointerId) {
                              return;
                            }
                            const nextPosition = clampCanvasPosition({
                              x: drag.startX + event.clientX - drag.startClientX,
                              y: drag.startY + event.clientY - drag.startClientY,
                            });
                            dragRef.current = null;
                            event.currentTarget.releasePointerCapture(event.pointerId);
                            updateNodePositionLocally(node.id, nextPosition);
                            void persistNodePosition(node.id, nextPosition);
                          }}
                          onPointerCancel={(event) => {
                            const drag = dragRef.current;
                            if (!drag || drag.nodeId !== node.id || drag.pointerId !== event.pointerId) {
                              return;
                            }
                            dragRef.current = null;
                          }}
                          style={{ left: node.position.x, top: node.position.y, width: NODE_CARD_WIDTH }}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              aria-label={isComplete ? "Mark chip incomplete" : "Mark chip complete"}
                              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${isComplete ? "border-[#6f57f6] bg-[#6f57f6] text-white" : "border-[#ddd2ff] bg-[#f7f3ff] text-[#6f57f6]"} dark:border-white/15 dark:bg-white/8`}
                              data-path-node-control
                              onClick={(event) => {
                                event.stopPropagation();
                                void toggleNodeComplete(node.id);
                              }}
                              type="button"
                            >
                              {isComplete ? <Check className="h-4 w-4" /> : <Footprints className="h-3.5 w-3.5" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-[13px] font-bold leading-5 ${isComplete ? "text-[#8a84a3] line-through" : "text-[#2f294a]"} dark:text-white`}>
                                {node.title}
                              </p>
                              {node.note ? (
                                <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[#7a7592] dark:text-white/55">{node.note}</p>
                              ) : null}
                            </div>
                          </div>
                          {linkedTask ? (
                            <div className="mt-3 max-w-full">
                              <PathLinkedTaskPill onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} task={linkedTask} />
                            </div>
                          ) : node.linkedTaskId ? (
                            <span className="mt-3 inline-flex rounded-full border border-[#ead6a6] bg-[#fff9ea] px-2 py-1 text-[12px] font-semibold text-[#8a6418] dark:border-[#65502a] dark:bg-[#312410] dark:text-[#f8d996]">
                              Linked task unavailable
                            </span>
                          ) : null}
                          <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[#cfc3f8] bg-white shadow-sm dark:border-[#7f67ff] dark:bg-[#1b152d]" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex h-[720px] items-center justify-center bg-[#fdfcff] p-6 dark:bg-[#100d1b]">
                  <div className="rounded-[1rem] border border-dashed border-[#d8d1ea] bg-white/88 p-6 text-sm text-[#6c6685] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/60">
                    Create or select a Path to open the canvas.
                  </div>
                </div>
              )}
            </div>

            <aside className="border-l border-[#f0ecfa] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.035]">
              {selectedRecord ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8e88a9] dark:text-white/40">Path</p>
                    <input
                      className={`${TASK_TABLE_INPUT_CLASS} mt-2`}
                      onBlur={(event) => { void updateSelectedPath({ title: event.target.value }); }}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id ? { ...record, path: { ...record.path, title: value } } : record));
                      }}
                      value={selectedRecord.path.title}
                    />
                    <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                      <select
                        className={TASK_TABLE_INPUT_CLASS}
                        onChange={(event) => { void updateSelectedPath({ pathType: event.target.value as PathType }); }}
                        value={selectedRecord.path.pathType}
                      >
                        {PATH_TYPES.map((pathType) => (
                          <option key={pathType} value={pathType}>{PATH_TYPE_LABELS[pathType]}</option>
                        ))}
                      </select>
                      <TaskTableChipButton onClick={() => { void archiveSelectedPath(); }} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>
                        <Archive className="mr-1 h-3.5 w-3.5" />
                        {selectedRecord.path.archivedAt ? "Restore" : "Archive"}
                      </TaskTableChipButton>
                    </div>
                    <textarea
                      className={`${TASK_TABLE_INPUT_CLASS} mt-2 min-h-[76px] resize-y leading-5`}
                      onBlur={(event) => { void updateSelectedPath({ description: event.target.value }); }}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id ? { ...record, path: { ...record.path, description: value } } : record));
                      }}
                      placeholder="Path description"
                      value={selectedRecord.path.description ?? ""}
                    />
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-[#ece8f8] dark:bg-white/10">
                    <div className="h-full rounded-full bg-[#6f57f6]" style={{ width: `${progressPercent}%` }} />
                  </div>

                  {selectedNode ? (
                    <div className="space-y-3 rounded-[1rem] border border-[#ece8f8] bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-[#1f2746] dark:text-white">Selected chip</p>
                        <button
                          aria-label="Clear selected chip"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e2daf8] bg-white text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"
                          onClick={() => setSelectedNodeId(null)}
                          type="button"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        className={TASK_TABLE_INPUT_CLASS}
                        onBlur={(event) => { void updateNode(selectedNode.id, { title: event.target.value }); }}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id
                            ? { ...record, nodes: record.nodes.map((node) => node.id === selectedNode.id ? { ...node, title: value } : node) }
                            : record));
                        }}
                        value={selectedNode.title}
                      />
                      <textarea
                        className={`${TASK_TABLE_INPUT_CLASS} min-h-[90px] resize-y leading-5`}
                        onBlur={(event) => { void updateNode(selectedNode.id, { note: event.target.value }); }}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPathRecords((current) => current.map((record) => record.path.id === selectedRecord.path.id
                            ? { ...record, nodes: record.nodes.map((node) => node.id === selectedNode.id ? { ...node, note: value } : node) }
                            : record));
                        }}
                        placeholder="Note"
                        value={selectedNode.note ?? ""}
                      />
                      <LinkedTaskPicker
                        linkedTaskById={linkedTaskById}
                        linkedTasks={linkedTasks}
                        onSelectTask={(taskId) => { void updateNode(selectedNode.id, { linkedTaskId: taskId }); }}
                        selectedTaskId={selectedNode.linkedTaskId ?? null}
                      />
                      {selectedNode.linkedTaskId ? (
                        <div className="flex flex-wrap gap-2">
                          {linkedTaskById.get(selectedNode.linkedTaskId) ? (
                            <div className="max-w-full">
                              <PathLinkedTaskPill
                                onOpenTask={onOpenTask}
                                onSetTaskStatus={onSetTaskStatus}
                                task={linkedTaskById.get(selectedNode.linkedTaskId)!}
                              />
                            </div>
                          ) : null}
                          <TaskTableChipButton onClick={() => { void updateNode(selectedNode.id, { linkedTaskId: null }); }} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>
                            <Unlink className="mr-1 h-3.5 w-3.5" />
                            Remove task
                          </TaskTableChipButton>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-[#7a7592] dark:text-white/55">Outgoing connections</p>
                        {selectedNode.nextNodeIds.length > 0 ? selectedNode.nextNodeIds.map((nextNodeId) => {
                          const target = nodeById.get(nextNodeId);
                          return (
                            <div className="flex items-center justify-between gap-2 rounded-[0.85rem] border border-[#ece8f8] bg-[#fbfaff] px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]" key={nextNodeId}>
                              <span className="truncate text-[13px] font-medium text-[#68738c] dark:text-white/60">{target?.title ?? "Missing chip"}</span>
                              <IconButton ariaLabel="Remove connection" onClick={() => { void removeConnection(selectedNode.id, nextNodeId); }}>
                                <X className="h-3.5 w-3.5" />
                              </IconButton>
                            </div>
                          );
                        }) : (
                          <p className="text-xs text-[#8a84a3] dark:text-white/45">No outgoing connections.</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <TaskTableChipButton onClick={() => { void toggleNodeComplete(selectedNode.id); }} toneClassName={completedNodeIds.has(selectedNode.id) ? TASK_TABLE_ACTIVE_LIST_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}>
                          <Check className="mr-1 h-3.5 w-3.5" />
                          {completedNodeIds.has(selectedNode.id) ? "Complete" : "Incomplete"}
                        </TaskTableChipButton>
                        <TaskTableChipButton onClick={() => { void duplicateNode(selectedNode.id); }} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          Duplicate
                        </TaskTableChipButton>
                        <TaskTableChipButton onClick={() => { void deleteNode(selectedNode.id); }} toneClassName="border-[#f4c7c7] bg-[#fff5f5] text-[#b42318] dark:border-[#6b2a2a] dark:bg-[#331616] dark:text-[#ffb4ad]">
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Delete
                        </TaskTableChipButton>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[1rem] border border-dashed border-[#d8d1ea] bg-white/70 p-4 text-sm text-[#6c6685] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/60">
                      Select a chip to edit title, note, linked task, connections, and progress.
                    </div>
                  )}

                  <div className="space-y-2 border-t border-[#f0ecfa] pt-4 dark:border-white/10">
                    <input
                      className={TASK_TABLE_INPUT_CLASS}
                      onChange={(event) => setCreateTitle(event.target.value)}
                      placeholder="New path title"
                      value={createTitle}
                    />
                    <textarea
                      className={`${TASK_TABLE_INPUT_CLASS} min-h-[64px] resize-y leading-5`}
                      onChange={(event) => setCreateDescription(event.target.value)}
                      placeholder="Description"
                      value={createDescription}
                    />
                    <select
                      className={TASK_TABLE_INPUT_CLASS}
                      onChange={(event) => setCreatePathType(event.target.value as PathType)}
                      value={createPathType}
                    >
                      {PATH_TYPES.map((pathType) => (
                        <option key={pathType} value={pathType}>{PATH_TYPE_LABELS[pathType]}</option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <TaskTableChipButton onClick={() => { void createPath(); }} toneClassName={TASK_TABLE_ACTIVE_LIST_CHIP_CLASS}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Create Path
                      </TaskTableChipButton>
                      <TaskTableChipButton onClick={() => { void deleteSelectedPath(); }} toneClassName="border-[#f4c7c7] bg-[#fff5f5] text-[#b42318] dark:border-[#6b2a2a] dark:bg-[#331616] dark:text-[#ffb4ad]">
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete Path
                      </TaskTableChipButton>
                    </div>
                  </div>

                  {statusMessage ? (
                    <p className="text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]">{statusMessage}</p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-black text-[#1f2746] dark:text-white">Create Path</p>
                  <input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setCreateTitle(event.target.value)} placeholder="New path title" value={createTitle} />
                  <TaskTableChipButton onClick={() => { void createPath(); }} toneClassName={TASK_TABLE_ACTIVE_LIST_CHIP_CLASS}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Create Path
                  </TaskTableChipButton>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function IconButton({
  ariaLabel,
  children,
  disabled = false,
  onClick,
  tone = "neutral",
}: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "danger" | "neutral";
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${tone === "danger" ? "border-[#f4c7c7] bg-[#fff5f5] text-[#b42318] dark:border-[#6b2a2a] dark:bg-[#331616] dark:text-[#ffb4ad]" : "border-[#e2daf8] bg-white text-[#6f57f6] hover:border-[#cbbcff] dark:border-white/10 dark:bg-white/[0.05] dark:text-[#cabfff]"}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function getProgressDateKey(pathType: PathType, todayKey: string) {
  return pathType === "daily_reset" ? todayKey : null;
}

function normalizeNodeOrder(nodes: PathNode[]) {
  return nodes.map((node, index) => ({
    ...node,
    sortOrder: index,
  }));
}

function getCanvasPoint(clientX: number, clientY: number, canvasElement: HTMLDivElement | null) {
  if (!canvasElement) {
    return getFallbackNodePosition(0);
  }

  const rect = canvasElement.getBoundingClientRect();
  return clampCanvasPosition({
    x: clientX - rect.left - NODE_CARD_WIDTH / 2,
    y: clientY - rect.top - NODE_CARD_HEIGHT / 2,
  });
}

function getFallbackNodePosition(index: number) {
  return clampCanvasPosition({
    x: 120 + (index % 4) * 260,
    y: 120 + Math.floor(index / 4) * 150,
  });
}

function clampCanvasPosition(position: { x: number; y: number }) {
  return {
    x: clampNumber(position.x, CANVAS_NODE_PADDING, CANVAS_WIDTH - NODE_CARD_WIDTH - CANVAS_NODE_PADDING),
    y: clampNumber(position.y, CANVAS_NODE_PADDING, CANVAS_HEIGHT - NODE_CARD_HEIGHT - CANVAS_NODE_PADDING),
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function createPathId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

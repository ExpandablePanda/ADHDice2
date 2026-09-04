"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import type { ScratchNote, ScratchNoteStatus, ScratchNoteTaskLink, Task } from "@/lib/database.types";
import type { ScratchNoteDraft } from "@/hooks/useScratchNotes";
import { getSelectableTaskStatusesForTask } from "@/lib/task-complete";
import {
  buildScratchTaskLinkToken,
  extractScratchSlashCommand,
  extractScratchSlashCommandFromAnchor,
  filterScratchLinkableTasks,
  parseScratchTaskTokenSegments,
  removeScratchTaskToken,
  replaceScratchRangeWithTaskToken,
} from "@/lib/scratch-paper-task-links";
import { formatTaskStatusLabel, renderTaskStatusCircle } from "@/components/task-app/task-status-ui";
import { TASK_TABLE_INPUT_CLASS, TaskTableChipButton } from "@/components/ui/task-table-primitives";

type ScratchPaperActions = {
  onCreate: (draft: ScratchNoteDraft) => Promise<string | null>;
  onCreateTask: (title: string) => void;
  onOpenTask: (taskId: string) => void;
  onSetStatus: (noteId: string, status: ScratchNoteStatus) => Promise<boolean>;
  onSetTaskStatus: (taskId: string, status: Task["status"]) => void;
  onUpdate: (noteId: string, draft: ScratchNoteDraft) => Promise<boolean>;
};

type ScratchSlashDebugState = {
  detectedSlashQuery: string | null;
  editorTextBeforeCaret: string;
  typedSlashEvent: boolean;
};

type ScratchPickerSource = "none" | "toolbar" | "typed-slash";
type ScratchPickerOpenEvent = "beforeinput" | "input" | "keydown" | "toolbar";
type ScratchPickerCloseReason = "escape" | "outside" | "selection" | "sync-no-query" | "blur" | "none";
type ScratchFocusedElement = "editor" | "other" | "picker-input";

export type ScratchPaperData = ScratchPaperActions & {
  error: string | null;
  isLoading: boolean;
  links: ScratchNoteTaskLink[];
  notes: ScratchNote[];
  tasks: Task[];
};

function linkedTaskIdsForNote(noteId: string, links: ScratchNoteTaskLink[]) {
  return links.filter((link) => link.note_id === noteId).map((link) => link.task_id);
}

function ensureLinkedTaskTokens(body: string, linkedTaskIds: string[], tasks: Task[]) {
  const referencedIds = new Set(parseScratchTaskTokenSegments(body).flatMap((segment) => segment.kind === "task" ? [segment.taskId] : []));
  return linkedTaskIds.reduce((currentBody, taskId) => {
    if (referencedIds.has(taskId)) return currentBody;
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) return currentBody;
    const separator = currentBody && !/\s$/.test(currentBody) ? " " : "";
    return `${currentBody}${separator}${buildScratchTaskLinkToken(task)}`;
  }, body);
}

function isLinkedTaskComplete(task: Task) {
  return task.status === "complete" || task.status === "done" || task.status === "did_my_best";
}

function ScratchTaskPill({
  onOpenTask,
  onSetTaskStatus,
  task,
}: {
  onOpenTask: (taskId: string) => void;
  onSetTaskStatus: (taskId: string, status: Task["status"]) => void;
  task: Task;
}) {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const statusOptions = getSelectableTaskStatusesForTask({ dueOn: task.due_on, repeatFrequency: task.repeat_frequency, status: task.status });

  return (
    <span className="relative inline-flex align-middle">
      <span className="inline-flex items-center overflow-hidden rounded-[0.4rem] border border-[#ddd2ff] bg-[#f3efff] text-sm leading-[1.25rem] text-[#6f57f6] dark:border-[#493a78] dark:bg-[#241b42] dark:text-[#cabfff]">
        <button
          className="min-w-0 max-w-[220px] truncate px-1.5 py-0 font-medium leading-[1.25rem]"
          onClick={() => onOpenTask(task.id)}
          title={`Open task: ${task.title}`}
          type="button"
        >
          {task.title}
        </button>
        <button
          aria-label={`Change task status from ${formatTaskStatusLabel(task.status)}`}
          className="flex h-5 items-center border-l border-[#d7cff6] px-1 py-0 font-medium leading-none dark:border-[#433567] [&>span]:h-4 [&>span]:w-4"
          onClick={() => setIsStatusMenuOpen((current) => !current)}
          type="button"
        >
          {renderTaskStatusCircle(task.status, "sm")}
        </button>
      </span>
      {isStatusMenuOpen ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-10 flex min-w-[180px] flex-col gap-1 rounded-[1rem] border border-[#e9e3f7] bg-white p-2 shadow-[0_18px_36px_rgba(34,24,74,0.12)] dark:border-white/10 dark:bg-[#1d1731]">
          {statusOptions.map((status) => (
            <button
              className={`flex items-center gap-2 rounded-[0.85rem] px-2.5 py-2 text-left text-[13px] font-medium transition ${
                status === task.status
                  ? "bg-[#f3efff] text-[#6f57f6] dark:bg-[#241b42] dark:text-[#cabfff]"
                  : "text-[#5f5878] hover:bg-[#f7f3ff] dark:text-white/72 dark:hover:bg-white/8"
              }`}
              key={status}
              onClick={() => {
                onSetTaskStatus(task.id, status);
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

function ScratchRenderedBody({
  body,
  linkedTaskIds,
  onOpenTask,
  onSetTaskStatus,
  tasks,
}: {
  body: string;
  linkedTaskIds: string[];
  onOpenTask: (taskId: string) => void;
  onSetTaskStatus: (taskId: string, status: Task["status"]) => void;
  tasks: Task[];
}) {
  const linkedTaskMap = useMemo(
    () => new Map(linkedTaskIds.map((taskId) => {
      const task = tasks.find((entry) => entry.id === taskId);
      return task ? [taskId, task] as const : null;
    }).filter((entry): entry is readonly [string, Task] => Boolean(entry))),
    [linkedTaskIds, tasks],
  );
  const segments = useMemo(() => parseScratchTaskTokenSegments(body), [body]);
  const referencedTaskIds = new Set(segments.flatMap((segment) => segment.kind === "task" ? [segment.taskId] : []));
  const unplacedLinkedTasks = linkedTaskIds.flatMap((taskId) => {
    if (referencedTaskIds.has(taskId)) {
      return [];
    }
    const task = linkedTaskMap.get(taskId);
    return task ? [task] : [];
  });

  return (
    <div className="text-sm leading-relaxed text-[#69627f] dark:text-white/65">
      <div className="whitespace-pre-wrap">
        {segments.map((segment, index) => {
          if (segment.kind === "text") {
            return segment.text ? <span key={`text-${index}`} className="whitespace-pre-wrap">{segment.text}</span> : null;
          }

          const task = linkedTaskMap.get(segment.taskId);
          return task ? (
            <ScratchTaskPill key={`task-${segment.taskId}-${index}`} onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} task={task} />
          ) : (
            <span key={`fallback-${segment.taskId}-${index}`} className="rounded-[0.4rem] border border-dashed border-[#d8d1ea] px-1.5 py-0 text-sm leading-[1.25rem] text-[#8d87a7] dark:border-white/15 dark:text-white/45">
              {segment.fallbackTitle}
            </span>
          );
        })}
        {unplacedLinkedTasks.map((task) => (
          <span key={`linked-${task.id}`}> <ScratchTaskPill onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} task={task} /></span>
        ))}
      </div>
    </div>
  );
}

function serializeScratchEditor(node: Node): string {
  if (node instanceof HTMLElement && node.dataset.taskToken) {
    return node.dataset.taskToken;
  }
  if (node instanceof HTMLBRElement) {
    return "\n";
  }

  return Array.from(node.childNodes).reduce((output, child) => {
    const isBlock = child instanceof HTMLElement && (child.tagName === "DIV" || child.tagName === "P");
    const childOutput = serializeScratchEditor(child);
    const needsBlockBreak = isBlock && output && !output.endsWith("\n") && !childOutput.startsWith("\n");
    return `${output}${needsBlockBreak ? "\n" : ""}${childOutput}`;
  }, "");
}

function getScratchEditorOffset(editor: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(editor);
  range.setEnd(selection.anchorNode as Node, selection.anchorOffset);
  const fragment = range.cloneContents();
  return serializeScratchEditor(fragment);
}

function restoreScratchEditorOffset(editor: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let remaining = offset;

  function place(node: Node): boolean {
    if (node instanceof HTMLElement && node.dataset.taskToken) {
      const tokenLength = node.dataset.taskToken.length;
      if (remaining <= tokenLength) {
        range.setStartAfter(node);
        return true;
      }
      remaining -= tokenLength;
      return false;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        return true;
      }
      remaining -= length;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (place(child)) return true;
    }
    return false;
  }

  if (!place(editor)) {
    range.selectNodeContents(editor);
    range.collapse(false);
  } else {
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function ScratchInlineEditor({
  body,
  editorRef,
  isPickerOpen,
  minHeightClass = "min-h-20",
  onChange,
  onDismissPicker,
  onKeyDown,
  onOpenTask,
  onSelectionRangeChange,
  onSetTaskStatus,
  onSlashDebug,
  placeholder,
  tasks,
}: {
  body: string;
  editorRef?: React.RefObject<HTMLDivElement | null>;
  isPickerOpen: boolean;
  minHeightClass?: string;
  onChange: (
    body: string,
    caretOffset: number,
    slashCommand: ReturnType<typeof extractScratchSlashCommand>,
    openEvent?: ScratchPickerOpenEvent,
  ) => void;
  onDismissPicker: (reason?: ScratchPickerCloseReason) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onOpenTask: (taskId: string) => void;
  onSelectionRangeChange: (range: { end: number; start: number }) => void;
  onSetTaskStatus: (taskId: string, status: Task["status"]) => void;
  onSlashDebug?: (state: ScratchSlashDebugState) => void;
  placeholder: string;
  tasks: Task[];
}) {
  const localEditorRef = useRef<HTMLDivElement | null>(null);
  const resolvedEditorRef = editorRef ?? localEditorRef;
  const activeSlashStartRef = useRef<number | null>(null);
  const caretOffsetRef = useRef<number | null>(null);
  const segments = useMemo(() => parseScratchTaskTokenSegments(body), [body]);

  useLayoutEffect(() => {
    const editor = resolvedEditorRef.current;
    const offset = caretOffsetRef.current;
    if (editor && offset !== null && document.activeElement === editor) {
      restoreScratchEditorOffset(editor, offset);
    }
  }, [body, resolvedEditorRef]);

  useEffect(() => {
    if (!isPickerOpen) activeSlashStartRef.current = null;
  }, [isPickerOpen]);

  function rememberSelection(notify = true) {
    const editor = resolvedEditorRef.current;
    if (!editor) return null;
    const offset = getScratchEditorOffset(editor);
    if (offset === null) return null;
    caretOffsetRef.current = offset.length;
    if (notify) {
      onSelectionRangeChange({ end: offset.length, start: offset.length });
    }
    return offset.length;
  }

  function emitEditorChange(editor: HTMLDivElement, inputEvent: InputEvent | null = null) {
    const nextBody = serializeScratchEditor(editor);
    const caretOffset = rememberSelection();
    const commandEnd = caretOffset ?? nextBody.length;
    if (activeSlashStartRef.current === null && inputEvent?.inputType === "insertText" && inputEvent.data === "/") {
      activeSlashStartRef.current = Math.max(0, commandEnd - 1);
    }
    const slashCommand = activeSlashStartRef.current === null
      ? null
      : extractScratchSlashCommandFromAnchor(nextBody, activeSlashStartRef.current, commandEnd);
    if (!slashCommand) activeSlashStartRef.current = null;
    if (slashCommand) {
      onSlashDebug?.({
        detectedSlashQuery: slashCommand.query,
        editorTextBeforeCaret: nextBody.slice(0, commandEnd),
        typedSlashEvent: true,
      });
    }
    onChange(nextBody, commandEnd, slashCommand, "input");
  }

  function insertTypedSlash(editor: HTMLDivElement, openEvent: "beforeinput" | "keydown") {
    const editorTextBeforeCaret = getScratchEditorOffset(editor);
    if (editorTextBeforeCaret === null) return false;
    const currentBody = serializeScratchEditor(editor);
    const slashStart = editorTextBeforeCaret.length;
    const nextBody = `${currentBody.slice(0, slashStart)}/${currentBody.slice(slashStart)}`;
    const slashCommand = extractScratchSlashCommandFromAnchor(nextBody, slashStart, slashStart + 1);
    if (!slashCommand) return false;

    activeSlashStartRef.current = slashStart;
    caretOffsetRef.current = slashStart + 1;
    onSlashDebug?.({
      detectedSlashQuery: "",
      editorTextBeforeCaret,
      typedSlashEvent: true,
    });
    onChange(nextBody, slashStart + 1, slashCommand, openEvent);
    return true;
  }

  return (
    <div
      aria-label={placeholder}
      className={`${minHeightClass} px-3 py-2 text-sm leading-relaxed text-[#69627f] outline-none empty:before:pointer-events-none empty:before:text-[#9b95ad] empty:before:content-[attr(data-placeholder)] dark:text-white/70 dark:empty:before:text-white/35`}
      contentEditable
      data-placeholder={placeholder}
      onBlur={() => { rememberSelection(false); }}
      onBeforeInput={(event) => {
        const inputEvent = event.nativeEvent as InputEvent;
        if (inputEvent.inputType !== "insertText" || inputEvent.data !== "/") return;
        event.preventDefault();
        insertTypedSlash(event.currentTarget, "beforeinput");
      }}
      onInput={(event) => {
        emitEditorChange(event.currentTarget, event.nativeEvent as InputEvent);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          activeSlashStartRef.current = null;
          onDismissPicker("escape");
          event.preventDefault();
          return;
        }
        if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          insertTypedSlash(event.currentTarget, "keydown");
          return;
        }
        onKeyDown?.(event);
      }}
      onKeyUp={(event) => {
        if (activeSlashStartRef.current === null) {
          rememberSelection();
          return;
        }
        emitEditorChange(event.currentTarget);
      }}
      onMouseUp={rememberSelection}
      ref={resolvedEditorRef}
      role="textbox"
      suppressContentEditableWarning
    >
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          return segment.text ? <span key={`text-${index}`} className="whitespace-pre-wrap">{segment.text}</span> : null;
        }
        const task = tasks.find((entry) => entry.id === segment.taskId);
        const token = `[[task:${segment.taskId}|${segment.fallbackTitle}]]`;
        return (
          <span contentEditable={false} data-task-token={token} key={`task-${segment.taskId}-${index}`}>
            {task ? <ScratchTaskPill onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} task={task} /> : segment.fallbackTitle}
          </span>
        );
      })}
    </div>
  );
}

function TaskLinkPicker({
  inputRef,
  linkedTaskIds,
  onCreateTask,
  onLink,
  onUnlink,
  query,
  setQuery,
  tasks,
}: {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  linkedTaskIds: string[];
  onCreateTask: (title: string) => void;
  onLink: (task: Task) => void;
  onUnlink: (taskId: string) => void;
  query: string;
  setQuery: (query: string) => void;
  tasks: Task[];
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = filterScratchLinkableTasks(tasks, query, linkedTaskIds).slice(0, 6);
  const hasExactMatch = matches.some((task) => task.title.trim().toLowerCase() === normalizedQuery);

  return (
    <div className="flex max-h-36 flex-col overflow-hidden rounded-[1rem] border border-[#e9e3f7] bg-white p-2 shadow-[0_18px_36px_rgba(34,24,74,0.14)] dark:border-white/10 dark:bg-[#1d1731]">
      <input
        autoFocus
        className={TASK_TABLE_INPUT_CLASS}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search current tasks"
        ref={inputRef}
        value={query}
      />
      <div className="mt-2 flex min-h-0 flex-1 flex-wrap gap-1.5 overflow-y-auto">
        {linkedTaskIds.map((taskId) => {
          const task = tasks.find((entry) => entry.id === taskId);
          return task ? <TaskTableChipButton key={taskId} onClick={() => onUnlink(taskId)}>Remove {task.title}</TaskTableChipButton> : null;
        })}
        {matches.map((task) => <TaskTableChipButton key={task.id} onClick={() => onLink(task)}>Link {task.title}</TaskTableChipButton>)}
        {normalizedQuery && !hasExactMatch ? (
          <TaskTableChipButton
            onClick={() => onCreateTask(query.trim())}
            toneClassName="border-[#cfeedd] bg-[#ecfbf3] text-[#119a69] dark:border-[#1e5a42] dark:bg-[#103726] dark:text-[#8ff0cc]"
          >
            Create Task &quot;{query.trim()}&quot;
          </TaskTableChipButton>
        ) : null}
        {!normalizedQuery && matches.length === 0 ? <p className="px-1 text-xs text-[#8d87a7] dark:text-white/40">No current tasks to link.</p> : null}
      </div>
    </div>
  );
}

function ScratchCurrentNoteEditor({
  notes,
  onCreate,
  onCreateTask,
  onCurrentNoteIdChange,
  onOpenTask,
  onSetStatus,
  onSetTaskStatus,
  onUpdate,
  links,
  tasks,
}: ScratchPaperData & { onCurrentNoteIdChange: (noteId: string | null) => void }) {
  const activeNotes = useMemo(() => notes.filter((note) => note.status === "active"), [notes]);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([]);
  const [isTitleVisible, setIsTitleVisible] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [taskQuery, setTaskQuery] = useState("");
  const [caretInsertRange, setCaretInsertRange] = useState<{ end: number; start: number } | null>(null);
  const [taskInsertRange, setTaskInsertRange] = useState<{ end: number; start: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pickerSource, setPickerSource] = useState<ScratchPickerSource>("none");
  const [lastOpenEvent, setLastOpenEvent] = useState<ScratchPickerOpenEvent | "none">("none");
  const [lastCloseReason, setLastCloseReason] = useState<ScratchPickerCloseReason>("none");
  const [focusedElement, setFocusedElement] = useState<ScratchFocusedElement>("other");
  const [slashDebug, setSlashDebug] = useState<ScratchSlashDebugState>({
    detectedSlashQuery: null,
    editorTextBeforeCaret: "",
    typedSlashEvent: false,
  });
  const editorRef = useRef<HTMLDivElement | null>(null);
  const pickerInputRef = useRef<HTMLInputElement | null>(null);
  const pickerAreaRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const saveInFlightRef = useRef(false);

  const dismissTaskPicker = useCallback((reason: ScratchPickerCloseReason = "none") => {
    setTaskQuery("");
    setTaskInsertRange(null);
    setPickerSource("none");
    setLastCloseReason(reason);
    setFocusedElement(reason === "outside" ? "other" : "editor");
    setIsLinking(false);
    if (reason === "escape" || reason === "selection") {
      window.requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    }
  }, []);

  const openTaskPicker = useCallback((slashCommand?: ReturnType<typeof extractScratchSlashCommand>, source: ScratchPickerSource = "typed-slash", openEvent: ScratchPickerOpenEvent = "input") => {
    setTaskInsertRange(slashCommand?.range ?? caretInsertRange ?? { end: body.length, start: body.length });
    setTaskQuery(slashCommand?.query ?? "");
    setPickerSource(source);
    setLastOpenEvent(openEvent);
    setLastCloseReason("none");
    setFocusedElement("picker-input");
    setIsLinking(true);
  }, [body.length, caretInsertRange]);

  useEffect(() => {
    if (!isLinking) return;
    const frame = window.requestAnimationFrame(() => {
      pickerInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isLinking]);

  useEffect(() => {
    if (!isLinking) return;
    function handlePointerDown(event: PointerEvent) {
      if (!pickerAreaRef.current?.contains(event.target as Node)) dismissTaskPicker("outside");
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismissTaskPicker("escape");
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissTaskPicker, isLinking]);

  const loadNote = useCallback((note: ScratchNote | null) => {
    const noteTaskIds = note ? linkedTaskIdsForNote(note.id, links) : [];
    setCurrentNoteId(note?.id ?? null);
    onCurrentNoteIdChange(note?.id ?? null);
    setBody(note ? ensureLinkedTaskTokens(note.body, noteTaskIds, tasks) : "");
    setTitle(note?.title ?? "");
    setLinkedTaskIds(noteTaskIds);
    setIsTitleVisible(Boolean(note?.title));
    setTaskQuery("");
    setTaskInsertRange(null);
    setIsLinking(false);
    setPickerSource("none");
    setFocusedElement("editor");
    setLastOpenEvent("none");
    setLastCloseReason("none");
    setIsDirty(false);
  }, [links, onCurrentNoteIdChange, tasks]);

  useEffect(() => {
    let noteToLoad: ScratchNote | null | undefined;
    if (!initializedRef.current && activeNotes.length > 0 && !isDirty) {
      initializedRef.current = true;
      noteToLoad = activeNotes[0];
    } else if (currentNoteId && !activeNotes.some((note) => note.id === currentNoteId) && !isDirty) {
      noteToLoad = activeNotes[0] ?? null;
    }
    if (noteToLoad === undefined) return;
    const targetNote = noteToLoad;
    const timeoutId = window.setTimeout(() => loadNote(targetNote), 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeNotes, currentNoteId, isDirty, loadNote]);

  async function save() {
    if (saveInFlightRef.current || (!currentNoteId && !body.trim() && !title.trim() && linkedTaskIds.length === 0)) return null;
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      if (currentNoteId) {
        const saved = await onUpdate(currentNoteId, { body, linkedTaskIds, title });
        if (saved) setIsDirty(false);
        return saved ? currentNoteId : null;
      }
      const createdNoteId = await onCreate({ body, linkedTaskIds, title });
      if (!createdNoteId) return null;
      setCurrentNoteId(createdNoteId);
      onCurrentNoteIdChange(createdNoteId);
      setIsDirty(false);
      return createdNoteId;
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  function linkTask(task: Task) {
    initializedRef.current = true;
    setLinkedTaskIds((current) => current.includes(task.id) ? current : [...current, task.id]);
    setBody((current) => replaceScratchRangeWithTaskToken(current, taskInsertRange ?? { end: current.length, start: current.length }, task));
    setIsDirty(true);
    dismissTaskPicker("selection");
  }

  function updateBody(
    nextBody: string,
    _caretOffset: number,
    slashCommand: ReturnType<typeof extractScratchSlashCommand>,
    openEvent?: ScratchPickerOpenEvent,
  ) {
    initializedRef.current = true;
    setBody(nextBody);
    setIsDirty(true);
    const tokenTaskIds = new Set(parseScratchTaskTokenSegments(nextBody).flatMap((segment) => segment.kind === "task" ? [segment.taskId] : []));
    setLinkedTaskIds((current) => current.filter((taskId) => tokenTaskIds.has(taskId) || !tasks.some((task) => task.id === taskId)));
    if (slashCommand) {
      openTaskPicker(slashCommand, "typed-slash", openEvent ?? "input");
      return;
    }

    if (isLinking && pickerSource !== "none") {
      return;
    }

    setTaskInsertRange(null);
    setTaskQuery("");
    setIsLinking(false);
    setPickerSource("none");
  }

  const currentIndex = currentNoteId ? activeNotes.findIndex((note) => note.id === currentNoteId) : -1;
  const debugResultsCount = filterScratchLinkableTasks(tasks, taskQuery, linkedTaskIds).slice(0, 6).length;

  async function switchTo(note: ScratchNote | undefined) {
    if (!note || note.id === currentNoteId) return;
    const hasDraftContent = Boolean(body.trim() || title.trim() || linkedTaskIds.length > 0);
    if (isDirty && (currentNoteId || hasDraftContent) && !await save()) return;
    loadNote(note);
  }

  async function startNewNote() {
    const hasDraftContent = Boolean(body.trim() || title.trim() || linkedTaskIds.length > 0);
    if (isDirty && (currentNoteId || hasDraftContent) && !await save()) return;
    initializedRef.current = true;
    loadNote(null);
  }

  async function changeCurrentStatus(status: ScratchNoteStatus) {
    if (!currentNoteId || (isDirty && !await save()) || !await onSetStatus(currentNoteId, status)) return;
    const nextNote = activeNotes.find((note) => note.id !== currentNoteId);
    loadNote(nextNote ?? null);
  }

  return (
    <div className="relative isolate space-y-2" ref={pickerAreaRef}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button aria-label="Previous scratch note" className="rounded-full p-1 text-[#6f57f6] transition hover:bg-[#eee8ff] disabled:cursor-not-allowed disabled:opacity-30 dark:text-[#cabfff] dark:hover:bg-white/10" disabled={currentIndex <= 0 || isSaving} onClick={() => { void switchTo(activeNotes[currentIndex - 1]); }} type="button"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-10 text-center text-[11px] text-[#8d87a7] dark:text-white/40">{currentIndex >= 0 ? `${currentIndex + 1} / ${activeNotes.length}` : "New"}</span>
          <button aria-label="Next scratch note" className="rounded-full p-1 text-[#6f57f6] transition hover:bg-[#eee8ff] disabled:cursor-not-allowed disabled:opacity-30 dark:text-[#cabfff] dark:hover:bg-white/10" disabled={currentIndex < 0 ? activeNotes.length === 0 || isSaving : currentIndex >= activeNotes.length - 1 || isSaving} onClick={() => { void switchTo(activeNotes[currentIndex < 0 ? 0 : currentIndex + 1]); }} type="button"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <TaskTableChipButton disabled={currentNoteId === null && !body.trim() && !title.trim() && linkedTaskIds.length === 0} onClick={() => { void startNewNote(); }}><Plus className="h-3 w-3" /> New Note</TaskTableChipButton>
      </div>
      {isTitleVisible || title ? <input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => { initializedRef.current = true; setTitle(event.target.value); setIsDirty(true); }} placeholder="Optional title" value={title} /> : null}
      <div className="relative rounded-[0.95rem] border border-[#ddd2ff] bg-white dark:border-white/15 dark:bg-white/8">
        <ScratchInlineEditor
          body={body}
          editorRef={editorRef}
          isPickerOpen={isLinking}
          onChange={updateBody}
          onDismissPicker={dismissTaskPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !isLinking) {
              event.preventDefault();
              void save();
            }
          }}
          onOpenTask={onOpenTask}
          onSelectionRangeChange={setCaretInsertRange}
          onSetTaskStatus={onSetTaskStatus}
          onSlashDebug={setSlashDebug}
          placeholder="Jot something down... Type / to link a task."
          tasks={tasks}
        />
        {isLinking ? (
          <div className="absolute inset-x-1 top-1 z-30">
            <TaskLinkPicker
              inputRef={pickerInputRef}
              linkedTaskIds={linkedTaskIds}
              onCreateTask={onCreateTask}
              onLink={linkTask}
              onUnlink={(taskId) => {
                setLinkedTaskIds((current) => current.filter((id) => id !== taskId));
                setBody((current) => removeScratchTaskToken(current, taskId));
                setIsDirty(true);
              }}
              query={taskQuery}
              setQuery={setTaskQuery}
              tasks={tasks}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!isTitleVisible && !title ? <TaskTableChipButton onClick={() => setIsTitleVisible(true)}>Add title</TaskTableChipButton> : null}
        <TaskTableChipButton
          onClick={() => {
            openTaskPicker(undefined, "toolbar", "toolbar");
          }}
        >
          / Link Task
        </TaskTableChipButton>
        <TaskTableChipButton
          disabled={isSaving || (!currentNoteId && !body.trim() && !title.trim() && linkedTaskIds.length === 0)}
          onClick={() => { void save(); }}
          toneClassName="border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]"
        >
          {isSaving ? "Saving" : "Save Note"}
        </TaskTableChipButton>
        {currentNoteId ? <TaskTableChipButton onClick={() => { void changeCurrentStatus("resolved"); }} toneClassName="border-[#d8f2e4] bg-[#eefaf3] text-[#119a69] dark:border-[#214f39] dark:bg-[#112d20] dark:text-[#8ff0cc]">Resolve</TaskTableChipButton> : null}
        {currentNoteId ? <TaskTableChipButton onClick={() => { void changeCurrentStatus("trashed"); }} toneClassName="border-[#ffd5dc] bg-[#fff2f4] text-[#c64c62] dark:border-[#4d2130] dark:bg-[#2a1620] dark:text-[#ffb1c0]">Trash</TaskTableChipButton> : null}
        <span className="text-[11px] text-[#8d87a7] dark:text-white/40">Shift+Enter adds a line. Enter saves.</span>
      </div>
      {process.env.NODE_ENV === "development" ? (
        <p className="break-all text-[9px] leading-tight text-[#8d87a7] dark:text-white/35">
          pickerSource: {pickerSource} | pickerOpen: {isLinking ? "true" : "false"} | focusedElement: {focusedElement} | lastOpenEvent: {lastOpenEvent} | lastCloseReason: {lastCloseReason} | taskQuery: {taskQuery || "(empty)"} | detectedSlashQuery: {slashDebug.detectedSlashQuery ?? "none"} | typedSlashEvent: {slashDebug.typedSlashEvent ? "yes" : "no"} | resultsCount: {debugResultsCount}
        </p>
      ) : null}
    </div>
  );
}

function ScratchNoteCard({ links, note, onCreateTask, onOpenTask, onSetStatus, onSetTaskStatus, onUpdate, tasks }: ScratchPaperActions & { links: ScratchNoteTaskLink[]; note: ScratchNote; tasks: Task[] }) {
  const noteTaskIds = linkedTaskIdsForNote(note.id, links);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(note.title ?? "");
  const [body, setBody] = useState(() => ensureLinkedTaskTokens(note.body, noteTaskIds, tasks));
  const [linkedTaskIds, setLinkedTaskIds] = useState(noteTaskIds);
  const [isLinking, setIsLinking] = useState(false);
  const [taskQuery, setTaskQuery] = useState("");
  const [isTitleVisible, setIsTitleVisible] = useState(Boolean(note.title));
  const [caretInsertRange, setCaretInsertRange] = useState<{ end: number; start: number } | null>(null);
  const [taskInsertRange, setTaskInsertRange] = useState<{ end: number; start: number } | null>(null);
  const [pickerSource, setPickerSource] = useState<ScratchPickerSource>("none");
  const [lastOpenEvent, setLastOpenEvent] = useState<ScratchPickerOpenEvent | "none">("none");
  const [lastCloseReason, setLastCloseReason] = useState<ScratchPickerCloseReason>("none");
  const [focusedElement, setFocusedElement] = useState<ScratchFocusedElement>("other");
  const editorRef = useRef<HTMLDivElement | null>(null);
  const pickerInputRef = useRef<HTMLInputElement | null>(null);
  const pickerAreaRef = useRef<HTMLElement | null>(null);
  const linkedTasks = noteTaskIds.flatMap((taskId) => {
    const task = tasks.find((entry) => entry.id === taskId);
    return task ? [task] : [];
  });
  const allLinkedComplete = linkedTasks.length > 0 && linkedTasks.every(isLinkedTaskComplete);

  const dismissTaskPicker = useCallback((reason: ScratchPickerCloseReason = "none") => {
    setTaskQuery("");
    setTaskInsertRange(null);
    setPickerSource("none");
    setLastCloseReason(reason);
    setFocusedElement(reason === "outside" ? "other" : "editor");
    setIsLinking(false);
    if (reason === "escape" || reason === "selection") {
      window.requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    }
  }, []);

  const openTaskPicker = useCallback((slashCommand?: ReturnType<typeof extractScratchSlashCommand>, source: ScratchPickerSource = "typed-slash", openEvent: ScratchPickerOpenEvent = "input") => {
    setTaskInsertRange(slashCommand?.range ?? caretInsertRange ?? { end: body.length, start: body.length });
    setTaskQuery(slashCommand?.query ?? "");
    setPickerSource(source);
    setLastOpenEvent(openEvent);
    setLastCloseReason("none");
    setFocusedElement("picker-input");
    setIsLinking(true);
  }, [body.length, caretInsertRange]);

  useEffect(() => {
    if (!isLinking) return;
    const frame = window.requestAnimationFrame(() => {
      pickerInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isLinking]);

  useEffect(() => {
    if (!isLinking) return;
    function handlePointerDown(event: PointerEvent) {
      if (!pickerAreaRef.current?.contains(event.target as Node)) dismissTaskPicker("outside");
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismissTaskPicker("escape");
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissTaskPicker, isLinking]);

  function updateDraftBody(nextBody: string, _caretOffset: number, slashCommand: ReturnType<typeof extractScratchSlashCommand>) {
    setBody(nextBody);
    const tokenTaskIds = new Set(parseScratchTaskTokenSegments(nextBody).flatMap((segment) => segment.kind === "task" ? [segment.taskId] : []));
    setLinkedTaskIds((current) => current.filter((taskId) => tokenTaskIds.has(taskId) || !tasks.some((task) => task.id === taskId)));
    if (slashCommand) {
      openTaskPicker(slashCommand, "typed-slash", "input");
      return;
    }

    if (isLinking && pickerSource !== "none") {
      return;
    }

    setTaskInsertRange(null);
    setTaskQuery("");
    setIsLinking(false);
    setPickerSource("none");
    setFocusedElement("editor");
  }

  if (isEditing) {
    return (
      <article className="space-y-2 rounded-[1rem] border border-[#e9e3f7] bg-white/85 p-3 dark:border-white/10 dark:bg-white/[0.04]" ref={pickerAreaRef}>
        {isTitleVisible || title ? <input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setTitle(event.target.value)} placeholder="Optional title" value={title} /> : null}
        <div className="relative rounded-[0.95rem] border border-[#ddd2ff] bg-white dark:border-white/15 dark:bg-white/8">
          <ScratchInlineEditor
            body={body}
            editorRef={editorRef}
            isPickerOpen={isLinking}
            minHeightClass="min-h-24"
            onChange={updateDraftBody}
            onDismissPicker={dismissTaskPicker}
            onOpenTask={onOpenTask}
            onSelectionRangeChange={setCaretInsertRange}
            onSetTaskStatus={onSetTaskStatus}
            placeholder="Edit note"
            tasks={tasks}
          />
          {isLinking ? (
            <div className="absolute inset-x-1 top-1 z-30">
            <TaskLinkPicker
              inputRef={pickerInputRef}
              linkedTaskIds={linkedTaskIds}
                onCreateTask={onCreateTask}
                onLink={(task) => {
                  setLinkedTaskIds((current) => current.includes(task.id) ? current : [...current, task.id]);
                  setBody((current) => replaceScratchRangeWithTaskToken(current, taskInsertRange ?? { end: current.length, start: current.length }, task));
                  dismissTaskPicker("selection");
                }}
                onUnlink={(taskId) => {
                  setLinkedTaskIds((current) => current.filter((id) => id !== taskId));
                  setBody((current) => removeScratchTaskToken(current, taskId));
                }}
                query={taskQuery}
                setQuery={setTaskQuery}
                tasks={tasks}
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!isTitleVisible && !title ? <TaskTableChipButton onClick={() => setIsTitleVisible(true)}>Add title</TaskTableChipButton> : null}
          <TaskTableChipButton
            onClick={() => {
              openTaskPicker(undefined, "toolbar", "toolbar");
            }}
          >
            / Link Task
          </TaskTableChipButton>
          <TaskTableChipButton onClick={() => setIsEditing(false)}>Cancel</TaskTableChipButton>
          <TaskTableChipButton
            onClick={() => { void onUpdate(note.id, { body, linkedTaskIds, title }).then((saved) => saved && setIsEditing(false)); }}
            toneClassName="border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff]"
          >Save</TaskTableChipButton>
        </div>
        {process.env.NODE_ENV === "development" ? (
          <p className="break-all text-[9px] leading-tight text-[#8d87a7] dark:text-white/35">
            pickerSource: {pickerSource} | pickerOpen: {isLinking ? "true" : "false"} | focusedElement: {focusedElement} | lastOpenEvent: {lastOpenEvent} | lastCloseReason: {lastCloseReason} | taskQuery: {taskQuery || "(empty)"} | resultsCount: {filterScratchLinkableTasks(tasks, taskQuery, linkedTaskIds).slice(0, 6).length}
          </p>
        ) : null}
      </article>
    );
  }

  return (
    <article className="space-y-2 rounded-[1rem] border border-[#e9e3f7] bg-white/85 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      {note.title ? <h3 className="text-sm font-semibold text-[#2f294a] dark:text-white">{note.title}</h3> : null}
      {note.body || noteTaskIds.length > 0 ? <ScratchRenderedBody body={note.body} linkedTaskIds={noteTaskIds} onOpenTask={onOpenTask} onSetTaskStatus={onSetTaskStatus} tasks={tasks} /> : null}
      {allLinkedComplete && note.status === "active" ? (
        <p className="text-xs font-medium text-[#119a69] dark:text-[#8ff0cc]">All linked tasks complete</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {note.status === "active" ? <TaskTableChipButton onClick={() => { void onSetStatus(note.id, "resolved"); }} toneClassName="border-[#d8f2e4] bg-[#eefaf3] text-[#119a69] dark:border-[#214f39] dark:bg-[#112d20] dark:text-[#8ff0cc]">Resolve</TaskTableChipButton> : null}
        <TaskTableChipButton onClick={() => setIsEditing(true)}>Edit</TaskTableChipButton>
        {note.status !== "active" ? <TaskTableChipButton onClick={() => { void onSetStatus(note.id, "active"); }}>Restore Active</TaskTableChipButton> : null}
        {note.status !== "trashed" ? (
          <TaskTableChipButton onClick={() => { void onSetStatus(note.id, "trashed"); }} toneClassName="border-[#ffd5dc] bg-[#fff2f4] text-[#c64c62] dark:border-[#4d2130] dark:bg-[#2a1620] dark:text-[#ffb1c0]">Trash</TaskTableChipButton>
        ) : null}
      </div>
    </article>
  );
}

export function ScratchPaperWidget(props: ScratchPaperData & { onViewNotes: () => void }) {
  const [search, setSearch] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const activeNotes = useMemo(() => props.notes.filter((note) => {
    const query = search.trim().toLowerCase();
    return note.status === "active" && (!query || `${note.title ?? ""} ${note.body}`.toLowerCase().includes(query));
  }), [props.notes, search]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#6f57f6] dark:text-[#cabfff]">Scratch Paper</p>
        <TaskTableChipButton onClick={props.onViewNotes}>View Notes</TaskTableChipButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-3 pb-1">
          <section className="space-y-2 rounded-[1rem] border border-[#ece6fb] bg-white/78 p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
            <ScratchCurrentNoteEditor {...props} onCurrentNoteIdChange={setCurrentNoteId} />
          </section>
          <section className="space-y-2">
            <input className={`${TASK_TABLE_INPUT_CLASS} py-1.5`} onChange={(event) => setSearch(event.target.value)} placeholder="Search active notes" value={search} />
            {props.error ? <p className="text-xs text-[#c64c62]">Apply the Scratch Paper SQL migration, then refresh.</p> : null}
            {props.isLoading ? <p className="text-xs text-[#8d87a7]">Loading notes...</p> : null}
            {activeNotes.filter((note) => note.id !== currentNoteId).map((note) => <ScratchNoteCard key={note.id} {...props} note={note} />)}
            {!props.isLoading && activeNotes.filter((note) => note.id !== currentNoteId).length === 0 ? <p className="text-xs text-[#8d87a7] dark:text-white/40">No other active notes.</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

export function ScratchPaperPageSection(props: ScratchPaperData) {
  const [filter, setFilter] = useState<"all" | ScratchNoteStatus>("all");
  const [search, setSearch] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const filteredNotes = useMemo(() => props.notes.filter((note) => {
    const matchesFilter = filter === "all" || note.status === filter;
    const query = search.trim().toLowerCase();
    return matchesFilter && (!query || `${note.title ?? ""} ${note.body}`.toLowerCase().includes(query));
  }), [filter, props.notes, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold text-[#2f294a] dark:text-white">Scratch Paper</h2><p className="text-sm text-[#827a9e] dark:text-white/45">Quick notes that can stay linked to current tasks.</p></div>
      </div>
      <ScratchCurrentNoteEditor {...props} onCurrentNoteIdChange={setCurrentNoteId} />
      <div className="my-4 flex flex-wrap gap-1.5">
        {(["all", "active", "resolved", "trashed"] as const).map((value) => (
          <TaskTableChipButton key={value} onClick={() => setFilter(value)} toneClassName={filter === value ? "border-[#ddd2ff] bg-[#6f57f6] text-white" : undefined}>
            {value === "all" ? "All" : value === "trashed" ? "Trash" : value[0].toUpperCase() + value.slice(1)}
          </TaskTableChipButton>
        ))}
      </div>
      <input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setSearch(event.target.value)} placeholder="Search Scratch Paper notes" value={search} />
      {props.error ? <p className="mt-3 text-sm text-[#c64c62]">Scratch Paper is waiting for its SQL migration. Apply it in Supabase, then refresh.</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {filteredNotes.filter((note) => note.id !== currentNoteId).map((note) => <ScratchNoteCard key={note.id} {...props} note={note} />)}
      </div>
      {!props.isLoading && filteredNotes.length === 0 ? <p className="mt-6 text-center text-sm text-[#8d87a7]">No notes match this view.</p> : null}
    </div>
  );
}

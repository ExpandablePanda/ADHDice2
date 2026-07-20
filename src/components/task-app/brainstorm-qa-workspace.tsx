"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Copy, GripVertical, Plus, StickyNote, Trash2 } from "lucide-react";
import { ModalShell } from "@/components/modal-shell";
import { TaskTableChipButton, TASK_TABLE_CHIP_BASE_CLASS, TASK_TABLE_ICON_LABEL_GAP_CLASS, TASK_TABLE_INPUT_CLASS, TASK_TABLE_LIST_CHIP_CLASS } from "@/components/ui/task-table-primitives";
import { AdhdChip, AdhdPanel } from "@/components/ui-system";
import {
  addQaItem,
  createQaSession,
  deleteQaItem,
  deleteQaSession,
  deriveQaProgress,
  duplicateQaSession,
  generateQaFailuresReport,
  generateQaFullReport,
  importQaItems,
  reorderQaItems,
  resetQaSession,
  updateQaItem,
  updateQaSession,
  type BrainstormQaState,
  type QaSession,
  type QaStatus,
} from "@/lib/brainstorm-qa";

type Confirmation = "delete-session" | "replace" | "reset" | null;

const statusOptions: Array<{ label: string; value: QaStatus }> = [
  { label: "Not Tested", value: "not_tested" },
  { label: "Pass", value: "pass" },
  { label: "Fail", value: "fail" },
  { label: "Blocked", value: "blocked" },
];
const statusTone: Record<QaStatus, string> = {
  blocked: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
  fail: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100",
  not_tested: "border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60",
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
};
const labelClass = "text-sm font-semibold text-[#40385f] dark:text-white/85";

export function BrainstormQaWorkspace({ appVersion, qaState, updateQaState }: {
  appVersion: string;
  qaState: BrainstormQaState;
  updateQaState: (qaState: BrainstormQaState) => void;
}) {
  const [importDraft, setImportDraft] = useState("");
  const [importVersionDraft, setImportVersionDraft] = useState("");
  const [importVersionSessionId, setImportVersionSessionId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => new Set());
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ armed: boolean; id: string; pointerId: number; startY: number; timer: number | null } | null>(null);
  const activeSession = qaState.sessions.find((session) => session.id === qaState.activeSessionId) ?? null;
  const progress = useMemo(() => activeSession ? deriveQaProgress(activeSession) : null, [activeSession]);
  const orderedItems = useMemo(() => {
    if (!activeSession || !dragOrder) return activeSession?.items ?? [];
    const byId = new Map(activeSession.items.map((item) => [item.id, item]));
    return dragOrder.map((id) => byId.get(id)).filter((item): item is QaSession["items"][number] => Boolean(item));
  }, [activeSession, dragOrder]);
  const fullReport = useMemo(() => activeSession ? generateQaFullReport(activeSession) : "", [activeSession]);
  const importVersion = importVersionSessionId === activeSession?.id ? importVersionDraft : activeSession?.appVersion ?? "";

  const setActiveSession = useCallback((next: QaSession) => {
    updateQaState({ ...qaState, activeSessionId: next.id, sessions: qaState.sessions.map((session) => session.id === next.id ? next : session) });
  }, [qaState, updateQaState]);

  const isItemExpanded = (itemId: string, status: QaStatus) => status !== "pass" || expandedItemIds.has(itemId);
  const toggleItemExpansion = (itemId: string, status: QaStatus) => {
    if (status !== "pass") return;
    setExpandedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };
  const setItemStatus = (itemId: string, status: QaStatus) => {
    setExpandedItemIds((current) => {
      const next = new Set(current);
      if (status === "pass") next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    setActiveSession(updateQaItem(activeSession!, itemId, { status }));
  };
  const handleCompactRowClick = (event: ReactMouseEvent<HTMLDivElement>, itemId: string, status: QaStatus, expanded: boolean) => {
    if (expanded || status !== "pass" || (event.target as HTMLElement).closest("button, input, select, textarea, label")) return;
    toggleItemExpansion(itemId, status);
  };
  const collapsePassedItems = () => setExpandedItemIds((current) => {
    const next = new Set(current);
    activeSession?.items.filter((item) => item.status === "pass").forEach((item) => next.delete(item.id));
    return next;
  });
  const expandAllItems = () => setExpandedItemIds(new Set(activeSession?.items.map((item) => item.id) ?? []));

  const createSession = () => {
    const session = createQaSession({ appVersion });
    updateQaState({ ...qaState, activeSessionId: session.id, sessions: [...qaState.sessions, session] });
    setFeedback("New QA session saved.");
  };

  const closeConfirmation = () => {
    setConfirmation(null);
    window.queueMicrotask(() => restoreFocusRef.current?.focus());
  };

  const requestConfirmation = (type: Exclude<Confirmation, null>) => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmation(type);
  };

  const runImport = (mode: "append" | "replace") => {
    if (!activeSession) return;
    const result = importQaItems(activeSession, importDraft, mode, importVersion);
    if (result.count === 0) {
      setFeedback("No checklist items found. The session was not changed.");
      return;
    }
    setActiveSession(result.session);
    setImportDraft("");
    setFeedback(`${result.count} item${result.count === 1 ? "" : "s"} imported.`);
  };

  const copyReport = async (kind: "full" | "follow-up") => {
    if (!activeSession) return;
    const report = kind === "full" ? fullReport : generateQaFailuresReport(activeSession);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(report);
      setFeedback(kind === "full" ? "Full report copied." : "Failures and blocked report copied.");
    } catch {
      setFeedback("Could not copy the report. Clipboard access is unavailable.");
    }
  };

  const cancelDrag = () => {
    if (dragRef.current?.timer !== null) window.clearTimeout(dragRef.current.timer);
    dragRef.current = null;
    setDragOrder(null);
  };

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.armed) {
        if (Math.abs(event.clientY - drag.startY) > 8) cancelDrag();
        return;
      }
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-qa-item-id]");
      const targetId = target?.dataset.qaItemId;
      if (!targetId || targetId === drag.id) return;
      setDragOrder((current) => {
        if (!current) return current;
        const from = current.indexOf(drag.id);
        const to = current.indexOf(targetId);
        if (from < 0 || to < 0 || from === to) return current;
        const next = [...current];
        next.splice(to, 0, next.splice(from, 1)[0]);
        return next;
      });
    };
    const handleUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.timer !== null) window.clearTimeout(drag.timer);
      if (drag.armed && activeSession && dragOrder) {
        const byId = new Map(activeSession.items.map((item) => [item.id, item]));
        setActiveSession(updateQaSession(activeSession, { items: dragOrder.map((id) => byId.get(id)).filter((item): item is QaSession["items"][number] => Boolean(item)) }));
        setFeedback("Checklist order saved.");
      }
      dragRef.current = null;
      setDragOrder(null);
    };
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && dragRef.current) cancelDrag(); };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", cancelDrag);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", cancelDrag);
      window.removeEventListener("keydown", handleKey);
    };
  }, [activeSession, dragOrder, setActiveSession]);

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, itemId: string) => {
    if (!activeSession) return;
    const arm = () => {
      if (!dragRef.current || dragRef.current.id !== itemId) return;
      dragRef.current.armed = true;
      setDragOrder(activeSession.items.map((item) => item.id));
      setFeedback("Reordering checklist. Press Escape to cancel.");
    };
    dragRef.current = { armed: event.pointerType !== "touch", id: itemId, pointerId: event.pointerId, startY: event.clientY, timer: null };
    if (event.pointerType === "touch") dragRef.current.timer = window.setTimeout(arm, 300);
    else arm();
  };

  if (!activeSession) {
    return (
      <AdhdPanel className="text-center" padding="lg">
        <h3 className="text-lg font-semibold text-[#342d53] dark:text-white">Start a QA session</h3>
        <p className="mt-2 text-sm text-[#716b8c] dark:text-white/60">Create a saved workspace, then paste manual QA steps or add items one at a time.</p>
        <TaskTableChipButton className={`mt-4 ${TASK_TABLE_ICON_LABEL_GAP_CLASS}`} onClick={createSession} toneClassName="border-[#6f57f6] bg-[#6f57f6] text-white"><Plus aria-hidden="true" size={13} />New Session</TaskTableChipButton>
        <p aria-live="polite" className="mt-3 min-h-5 text-sm text-[#716b8c]">{feedback}</p>
      </AdhdPanel>
    );
  }

  return (
    <div className="space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AdhdPanel padding="lg">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="min-w-0 flex-1 space-y-1.5 sm:min-w-72"><span className={labelClass}>QA session</span><select className={TASK_TABLE_INPUT_CLASS} onChange={(event) => { setImportVersionSessionId(null); updateQaState({ ...qaState, activeSessionId: event.target.value }); }} value={activeSession.id}>{qaState.sessions.map((session) => <option key={session.id} value={session.id}>{session.title || "Untitled QA Session"}</option>)}</select></label>
          <div className="flex flex-wrap gap-2">
            <TaskTableChipButton className={TASK_TABLE_ICON_LABEL_GAP_CLASS} onClick={createSession}><Plus aria-hidden="true" size={13} />New Session</TaskTableChipButton>
            <TaskTableChipButton onClick={() => { const copy = duplicateQaSession(activeSession); updateQaState({ ...qaState, activeSessionId: copy.id, sessions: [...qaState.sessions, copy] }); setFeedback("QA session duplicated."); }}>Duplicate</TaskTableChipButton>
            <TaskTableChipButton onClick={() => requestConfirmation("reset")} toneClassName="border-amber-200 bg-amber-50 text-amber-800">Reset for retest</TaskTableChipButton>
            <TaskTableChipButton className={TASK_TABLE_ICON_LABEL_GAP_CLASS} onClick={() => requestConfirmation("delete-session")} toneClassName="border-rose-200 bg-rose-50 text-rose-700"><Trash2 aria-hidden="true" size={13} />Delete session</TaskTableChipButton>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5"><span className={labelClass}>Title or feature name</span><input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setActiveSession(updateQaSession(activeSession, { title: event.target.value }))} value={activeSession.title} /></label>
          <label className="space-y-1.5"><span className={labelClass}>App version</span><input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setActiveSession(updateQaSession(activeSession, { appVersion: event.target.value }))} value={activeSession.appVersion} /></label>
          <label className="space-y-1.5"><span className={labelClass}>Environment</span><input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setActiveSession(updateQaSession(activeSession, { environment: event.target.value }))} placeholder="Mobile PWA" value={activeSession.environment} /></label>
          <label className="space-y-1.5"><span className={labelClass}>Session date</span><input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setActiveSession(updateQaSession(activeSession, { sessionDate: event.target.value }))} type="date" value={activeSession.sessionDate} /></label>
        </div>
      </AdhdPanel>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <AdhdPanel padding="lg">
          <h3 className="text-lg font-semibold text-[#342d53] dark:text-white">Import checklist</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]"><label className="block space-y-1.5"><span className={labelClass}>Paste QA steps</span><textarea className={`${TASK_TABLE_INPUT_CLASS} min-h-40 resize-y whitespace-pre-wrap`} onChange={(event) => setImportDraft(event.target.value)} placeholder="1. Parent Task opens in overlay\n- Timer continues running\n[ ] Test unavailable task" value={importDraft} /></label><label className="block space-y-1.5"><span className={labelClass}>Version</span><input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => { setImportVersionSessionId(activeSession.id); setImportVersionDraft(event.target.value); }} placeholder="Unversioned" value={importVersion} /></label></div>
          <div className="mt-3 flex flex-wrap gap-2"><TaskTableChipButton onClick={() => runImport("append")} toneClassName="border-[#6f57f6] bg-[#6f57f6] text-white">Append Items</TaskTableChipButton><TaskTableChipButton disabled={!activeSession.items.length} onClick={() => requestConfirmation("replace")}>Replace Items</TaskTableChipButton></div>
        </AdhdPanel>
        <AdhdPanel padding="lg">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-[#342d53] dark:text-white">Progress</h3><p className="mt-1 text-sm text-[#716b8c] dark:text-white/60">{progress?.tested} / {progress?.total} tested</p></div><div className="flex flex-wrap gap-2"><AdhdChip tone={progress?.label === "Complete" ? "done" : progress?.label === "In progress" ? "progress" : "notDue"}>{progress?.label}</AdhdChip>{progress?.followUp ? <AdhdChip toneClassName={statusTone.fail}>Needs follow-up</AdhdChip> : null}<TaskTableChipButton onClick={collapsePassedItems}>Collapse passed</TaskTableChipButton><TaskTableChipButton onClick={expandAllItems}>Expand all</TaskTableChipButton></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><p>Pass: {progress?.pass}</p><p>Fail: {progress?.fail}</p><p>Blocked: {progress?.blocked}</p><p>Not Tested: {progress?.notTested}</p></div>
        </AdhdPanel>
      </div>

      <AdhdPanel padding="lg">
        <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 space-y-1.5"><span className={labelClass}>Add QA item</span><input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setNewItemText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const next = addQaItem(activeSession, newItemText); if (next !== activeSession) { setActiveSession(next); setNewItemText(""); setFeedback("QA item added."); } } }} value={newItemText} /></label><TaskTableChipButton onClick={() => { const next = addQaItem(activeSession, newItemText); if (next !== activeSession) { setActiveSession(next); setNewItemText(""); setFeedback("QA item added."); } }}><Plus size={13} /> Add Item</TaskTableChipButton></div>
        <div className="mt-4 space-y-3">
          {orderedItems.length === 0 ? <p className="rounded-[1rem] border border-dashed border-[#dcd4ed] px-4 py-8 text-center text-sm text-[#81799b] dark:border-white/15 dark:text-white/45">Import or add the first QA item.</p> : null}
          {orderedItems.map((item, index) => {
            const expanded = isItemExpanded(item.id, item.status);
            return (
            <article className="min-w-0 rounded-[1rem] border border-[#eee9f8] bg-[#fcfbff] p-3 dark:border-white/8 dark:bg-white/[0.025]" data-qa-item-id={item.id} key={item.id}>
              <div className="flex min-w-0 flex-wrap items-center gap-2" onClick={(event) => handleCompactRowClick(event, item.id, item.status, expanded)}>
                <button aria-label={`Drag ${item.text}`} className="touch-pan-y cursor-grab rounded-full p-1.5 text-[#81799b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d79f6]" onPointerDown={(event) => beginDrag(event, item.id)} type="button"><GripVertical size={17} /></button>
                <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_LIST_CHIP_CLASS}`}>{item.appVersion || "No version"}</span>
                <fieldset aria-label={`QA item status: ${item.text}`} className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0">
                  {statusOptions.map((option) => {
                    const selected = item.status === option.value;
                    return <label className={`${TASK_TABLE_CHIP_BASE_CLASS} cursor-pointer transition focus-within:outline-none focus-within:ring-2 focus-within:ring-[#8d79f6] ${selected ? statusTone[option.value] : TASK_TABLE_LIST_CHIP_CLASS}`} key={option.value}><input checked={selected} className="sr-only" name={`qa-status-${item.id}`} onChange={() => setItemStatus(item.id, option.value)} type="radio" value={option.value} />{option.label}</label>;
                  })}
                </fieldset>
                {!expanded ? <button aria-label={`Expand QA item: ${item.text}`} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[#514a6c] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8d79f6] dark:text-white/75" onClick={() => toggleItemExpansion(item.id, item.status)} type="button">{item.text}</button> : null}
                {!expanded && item.notes.trim() ? <span aria-label="Notes present" className="inline-flex items-center gap-1 text-xs font-semibold text-[#716b8c] dark:text-white/60"><StickyNote aria-hidden="true" size={14} />Notes</span> : null}
                <div className="ml-auto flex gap-1"><button aria-label={`Move ${item.text} up`} className="rounded-full p-1.5 text-[#716b8c] disabled:opacity-30" disabled={index === 0} onClick={() => setActiveSession(reorderQaItems(activeSession, index, index - 1))} type="button"><ArrowUp size={16} /></button><button aria-label={`Move ${item.text} down`} className="rounded-full p-1.5 text-[#716b8c] disabled:opacity-30" disabled={index === orderedItems.length - 1} onClick={() => setActiveSession(reorderQaItems(activeSession, index, index + 1))} type="button"><ArrowDown size={16} /></button><button aria-label={`Delete ${item.text}`} className="rounded-full p-1.5 text-rose-600" onClick={() => setActiveSession(deleteQaItem(activeSession, item.id))} type="button"><Trash2 size={16} /></button>{item.status === "pass" ? <button aria-label={`${expanded ? "Collapse" : "Expand"} QA item: ${item.text}`} className="rounded-full p-1.5 text-[#716b8c]" onClick={() => toggleItemExpansion(item.id, item.status)} type="button">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button> : null}</div>
              </div>
              {expanded ? <><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <label className="min-w-0 space-y-1.5"><span className={labelClass}>Item text</span><textarea className={`${TASK_TABLE_INPUT_CLASS} min-h-20 resize-y`} onChange={(event) => setActiveSession(updateQaItem(activeSession, item.id, { text: event.target.value }))} value={item.text} /></label>
                <label className="space-y-1.5"><span className={labelClass}>Version</span><input className={TASK_TABLE_INPUT_CLASS} onChange={(event) => setActiveSession(updateQaItem(activeSession, item.id, { appVersion: event.target.value }))} placeholder="Unversioned" value={item.appVersion} /></label>
              </div>
              <label className="mt-3 block min-w-0 space-y-1.5"><span className={labelClass}>Notes</span><textarea aria-label={`Notes for ${item.text}`} className={`${TASK_TABLE_INPUT_CLASS} min-h-20 resize-y`} onChange={(event) => setActiveSession(updateQaItem(activeSession, item.id, { notes: event.target.value }))} value={item.notes} /></label></> : null}
            </article>
            );
          })}
        </div>
      </AdhdPanel>

      <AdhdPanel padding="lg"><label className="block space-y-1.5"><span className={labelClass}>General observations</span><textarea className={`${TASK_TABLE_INPUT_CLASS} min-h-32 resize-y`} onChange={(event) => setActiveSession(updateQaSession(activeSession, { observations: event.target.value }))} value={activeSession.observations} /></label></AdhdPanel>
      <AdhdPanel padding="lg"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold text-[#342d53] dark:text-white">Report preview</h3><div className="flex flex-wrap gap-2"><TaskTableChipButton onClick={() => { void copyReport("full"); }}><span className="inline-flex min-w-0 items-center gap-1.5"><Copy className="shrink-0" size={13} /> Copy Full Report</span></TaskTableChipButton><TaskTableChipButton onClick={() => { void copyReport("follow-up"); }}><span className="inline-flex min-w-0 items-center gap-1.5"><Copy className="shrink-0" size={13} /> Copy Failures and Blocked</span></TaskTableChipButton></div></div><pre className="adhdice-scrollbar mt-4 max-h-[36rem] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[1rem] border border-[#e6e0f1] bg-[#faf9fd] p-4 text-sm leading-6 text-[#514a6c] dark:border-white/10 dark:bg-black/15 dark:text-white/70">{fullReport}</pre><p aria-live="polite" className="mt-3 min-h-5 text-sm text-[#716b8c] dark:text-white/60">{feedback}</p></AdhdPanel>

      {confirmation ? <ModalShell label={confirmation === "reset" ? "Reset QA session" : confirmation === "delete-session" ? "Delete QA session" : "Replace checklist items"} onClose={closeConfirmation}><AdhdPanel className="w-[min(92vw,30rem)]" padding="lg"><h3 className="text-lg font-semibold text-[#342d53] dark:text-white">{confirmation === "reset" ? "Reset for retesting?" : confirmation === "delete-session" ? "Delete this QA session?" : "Replace checklist items?"}</h3><p className="mt-2 text-sm leading-6 text-[#716b8c] dark:text-white/60">{confirmation === "reset" ? "Every item will return to Not Tested. Item notes, metadata, order, and general observations will remain." : confirmation === "delete-session" ? "This permanently removes this QA session and its checklist, notes, and observations. Questionnaire content and other QA sessions will remain." : "The current item list will be replaced. Session metadata and general observations will remain."}</p><div className="mt-5 flex justify-end gap-2"><TaskTableChipButton onClick={closeConfirmation}>Cancel</TaskTableChipButton><TaskTableChipButton onClick={() => { if (confirmation === "reset") { setActiveSession(resetQaSession(activeSession)); setFeedback("Session reset for retesting. Notes and observations were preserved."); } else if (confirmation === "delete-session") { updateQaState(deleteQaSession(qaState, activeSession.id)); setExpandedItemIds(new Set()); setImportVersionSessionId(null); setFeedback("QA session deleted."); } else runImport("replace"); closeConfirmation(); }} toneClassName={confirmation === "reset" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-rose-200 bg-rose-50 text-rose-700"}>Confirm</TaskTableChipButton></div></AdhdPanel></ModalShell> : null}
    </div>
  );
}

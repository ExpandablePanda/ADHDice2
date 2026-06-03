"use client";

import { useMemo, useState } from "react";

type PrototypePriority = "focus" | "important" | "urgent";
type PrototypeRepeat = "custom" | "daily" | "monthly" | "none" | "weekly";

type PrototypeTask = {
  dueOn: string;
  dueTime: string;
  id: string;
  priorities: PrototypePriority[];
  repeat: PrototypeRepeat;
  title: string;
};

const PRIORITY_OPTIONS: Array<{ label: string; value: PrototypePriority }> = [
  { label: "Focus", value: "focus" },
  { label: "Important", value: "important" },
  { label: "Urgent", value: "urgent" },
];

const REPEAT_OPTIONS: Array<{ label: string; value: PrototypeRepeat }> = [
  { label: "No Repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Custom Cadence", value: "custom" },
];

const CHIP_BASE = "inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold leading-none whitespace-nowrap";

function getTodayOffset(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDueLabel(dueOn: string, dueTime: string) {
  const today = getTodayOffset(0);
  const tomorrow = getTodayOffset(1);
  const dateLabel = !dueOn
    ? "No date"
    : dueOn === today
      ? "Today"
      : dueOn === tomorrow
        ? "Tomorrow"
        : dueOn;

  if (!dueTime) {
    return dateLabel;
  }

  return `${dateLabel} · ${dueTime}`;
}

function repeatTone(repeat: PrototypeRepeat) {
  return repeat === "none"
    ? "bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60"
    : "bg-[#fff6df] text-[#b77900] dark:bg-[#44350d] dark:text-[#ffd56b]";
}

function priorityTone(priority: PrototypePriority) {
  if (priority === "focus") return "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]";
  if (priority === "important") return "bg-[#fff6df] text-[#b77900] dark:bg-[#44350d] dark:text-[#ffd56b]";
  return "bg-[#fff1f3] text-[#d94e67] dark:bg-[#44232f] dark:text-[#ff9eaf]";
}

export function TestTaskTablePrototype() {
  const [tasks, setTasks] = useState<PrototypeTask[]>([
    { dueOn: "", dueTime: "", id: "prototype-1", priorities: ["focus"], repeat: "daily", title: "Prototype morning reset" },
    { dueOn: getTodayOffset(1), dueTime: "09:00", id: "prototype-2", priorities: ["important", "urgent"], repeat: "weekly", title: "Prototype follow-up task" },
    { dueOn: getTodayOffset(0), dueTime: "", id: "prototype-3", priorities: [], repeat: "none", title: "Prototype inbox triage" },
  ]);
  const [openMenu, setOpenMenu] = useState<{ field: "due" | "priority" | "repeat"; taskId: string } | null>(null);
  const [dueDrafts, setDueDrafts] = useState<Record<string, { dueOn: string; dueTime: string }>>({});

  const duePresetRows = useMemo(
    () => [
      [
        { label: "No Date", value: "" },
        { label: "Today", value: getTodayOffset(0) },
      ],
      [
        { label: "Tomorrow", value: getTodayOffset(1) },
        { label: "Next Week", value: getTodayOffset(7) },
      ],
    ],
    [],
  );

  function patchTask(taskId: string, updater: (task: PrototypeTask) => PrototypeTask) {
    setTasks((current) => current.map((task) => (task.id === taskId ? updater(task) : task)));
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-6xl rounded-[2rem] border border-[#eee7ff] bg-[linear-gradient(180deg,#fcfbff_0%,#f8f4ff_100%)] p-6 text-left shadow-[0_28px_80px_rgba(116,88,255,0.12)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(35,28,58,0.95)_0%,rgba(25,20,43,0.98)_100%)]">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b92be] dark:text-white/35">
          Test Table Prototype
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#342d56] dark:text-white">
          Experimental task table
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#726a96] dark:text-white/60">
          This table is isolated to the Test page so we can prototype due chips, multi-priority chips, and repeat chips without changing the real Tasks page.
        </p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-4 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
        <table className="min-w-full border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b92be] dark:text-white/35">
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Repeat</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const dueDraft = dueDrafts[task.id] ?? { dueOn: task.dueOn, dueTime: task.dueTime };
              return (
                <tr className="rounded-[1rem] bg-[#fbfaff] dark:bg-white/[0.03]" key={task.id}>
                  <td className="rounded-l-[1rem] px-3 py-3 text-[15px] font-semibold text-[#2d274d] dark:text-white">{task.title}</td>

                  <td className="relative px-3 py-3">
                    <button
                      className="appearance-none border-0 bg-transparent p-0 text-left"
                      onClick={() => setOpenMenu((current) => current?.taskId === task.id && current.field === "due" ? null : { field: "due", taskId: task.id })}
                      type="button"
                    >
                      <span className={`${CHIP_BASE} bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60`}>
                        {formatDueLabel(task.dueOn, task.dueTime)}
                      </span>
                    </button>
                    {openMenu?.taskId === task.id && openMenu.field === "due" ? (
                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 inline-block w-fit rounded-[1.5rem] bg-white/88 px-3 py-3 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-[#1a1230]/92 dark:ring-white/10">
                        <div className="space-y-2">
                          {duePresetRows.map((row, rowIndex) => (
                            <div className="flex items-center gap-2" key={`${task.id}-due-row-${rowIndex}`}>
                              {row.map((option) => (
                                <button
                                  className="appearance-none border-0 bg-transparent p-0 text-left"
                                  key={`${task.id}-due-${option.label}`}
                                  onClick={() => {
                                    patchTask(task.id, (current) => ({ ...current, dueOn: option.value, dueTime: option.value ? current.dueTime : "" }));
                                    setOpenMenu(null);
                                  }}
                                  type="button"
                                >
                                  <span className={`${CHIP_BASE} ${task.dueOn === option.value ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]" : "bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60"}`}>
                                    {option.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ))}
                          <div className="grid gap-2 pt-2">
                            <input
                              className="rounded-[0.9rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-2 text-sm outline-none dark:border-white/15 dark:bg-white/8 dark:text-white"
                              onChange={(event) => setDueDrafts((current) => ({ ...current, [task.id]: { ...dueDraft, dueOn: event.target.value } }))}
                              type="date"
                              value={dueDraft.dueOn}
                            />
                            <input
                              className="rounded-[0.9rem] border border-[#e5e0f5] bg-[#fbfaff] px-3 py-2 text-sm outline-none dark:border-white/15 dark:bg-white/8 dark:text-white"
                              onChange={(event) => setDueDrafts((current) => ({ ...current, [task.id]: { ...dueDraft, dueTime: event.target.value } }))}
                              type="time"
                              value={dueDraft.dueTime}
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              className="rounded-full border border-[#ddd6fb] bg-white px-3 py-2 text-sm font-semibold text-[#5c6684] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70"
                              onClick={() => {
                                patchTask(task.id, () => ({ ...task, dueOn: "", dueTime: "" }));
                                setOpenMenu(null);
                              }}
                              type="button"
                            >
                              Clear
                            </button>
                            <button
                              className="rounded-full bg-[#6f57f6] px-3 py-2 text-sm font-semibold text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                              onClick={() => {
                                patchTask(task.id, (current) => ({ ...current, dueOn: dueDraft.dueOn, dueTime: dueDraft.dueTime }));
                                setOpenMenu(null);
                              }}
                              type="button"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </td>

                  <td className="relative px-3 py-3">
                    <button
                      className="appearance-none border-0 bg-transparent p-0 text-left"
                      onClick={() => setOpenMenu((current) => current?.taskId === task.id && current.field === "priority" ? null : { field: "priority", taskId: task.id })}
                      type="button"
                    >
                      <span className="flex flex-wrap gap-2">
                        {task.priorities.length === 0 ? (
                          <span className={`${CHIP_BASE} bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60`}>None</span>
                        ) : (
                          task.priorities.map((priority) => (
                            <span className={`${CHIP_BASE} ${priorityTone(priority)}`} key={`${task.id}-${priority}`}>
                              {PRIORITY_OPTIONS.find((option) => option.value === priority)?.label}
                            </span>
                          ))
                        )}
                      </span>
                    </button>
                    {openMenu?.taskId === task.id && openMenu.field === "priority" ? (
                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 inline-block w-fit rounded-[1.5rem] bg-white/88 px-3 py-3 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-[#1a1230]/92 dark:ring-white/10">
                        <div className="flex flex-wrap gap-2">
                          {PRIORITY_OPTIONS.map((option) => {
                            const selected = task.priorities.includes(option.value);
                            return (
                              <button
                                className="appearance-none border-0 bg-transparent p-0 text-left"
                                key={`${task.id}-priority-${option.value}`}
                                onClick={() => {
                                  patchTask(task.id, (current) => ({
                                    ...current,
                                    priorities: selected
                                      ? current.priorities.filter((value) => value !== option.value)
                                      : [...current.priorities, option.value],
                                  }));
                                }}
                                type="button"
                              >
                                <span className={`${CHIP_BASE} ${selected ? priorityTone(option.value) : "bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60"}`}>
                                  {option.label}
                                </span>
                              </button>
                            );
                          })}
                          <button
                            className="appearance-none border-0 bg-transparent p-0 text-left"
                            onClick={() => patchTask(task.id, (current) => ({ ...current, priorities: [] }))}
                            type="button"
                          >
                            <span className={`${CHIP_BASE} bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60`}>Clear</span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </td>

                  <td className="relative rounded-r-[1rem] px-3 py-3">
                    <button
                      className="appearance-none border-0 bg-transparent p-0 text-left"
                      onClick={() => setOpenMenu((current) => current?.taskId === task.id && current.field === "repeat" ? null : { field: "repeat", taskId: task.id })}
                      type="button"
                    >
                      <span className={`${CHIP_BASE} ${repeatTone(task.repeat)}`}>
                        {REPEAT_OPTIONS.find((option) => option.value === task.repeat)?.label}
                      </span>
                    </button>
                    {openMenu?.taskId === task.id && openMenu.field === "repeat" ? (
                      <div className="absolute left-0 top-[calc(100%+0.45rem)] z-40 inline-block w-fit rounded-[1.5rem] bg-white/88 px-3 py-3 shadow-[0_24px_60px_rgba(115,88,255,0.14)] ring-1 ring-[#ede6ff] backdrop-blur-md dark:bg-[#1a1230]/92 dark:ring-white/10">
                        <div className="flex flex-wrap gap-2">
                          {REPEAT_OPTIONS.map((option) => (
                            <button
                              className="appearance-none border-0 bg-transparent p-0 text-left"
                              key={`${task.id}-repeat-${option.value}`}
                              onClick={() => {
                                patchTask(task.id, (current) => ({ ...current, repeat: option.value }));
                                setOpenMenu(null);
                              }}
                              type="button"
                            >
                              <span className={`${CHIP_BASE} ${task.repeat === option.value ? repeatTone(option.value) : "bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60"}`}>
                                {option.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

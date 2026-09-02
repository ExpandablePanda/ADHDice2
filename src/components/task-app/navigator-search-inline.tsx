"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { focusDropdownControl, revealDropdownOptionWithinPanel } from "@/lib/dropdown-interaction";
import { searchNavigatorTargets, type NavigatorSearchTarget } from "@/lib/navigator-search";
import { searchNavigatorTasks } from "@/lib/navigator-task-search";
import type { TaskSearchEntity } from "@/lib/task-search-selector";

export type NavigatorSearchPlacement = "bottom" | "left" | "right";

type NavigatorSearchInlineProps = {
  onClose: () => void;
  onNavigate: (target: NavigatorSearchTarget) => void;
  placement: NavigatorSearchPlacement;
  renderIcon: (name: string) => ReactNode;
  targets: readonly NavigatorSearchTarget[];
  taskSearchEntities: readonly TaskSearchEntity[];
};

export function NavigatorSearchInline({ onClose, onNavigate, placement, renderIcon, targets, taskSearchEntities }: NavigatorSearchInlineProps) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isTaskSearchMode, setIsTaskSearchMode] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const highlightedOptionRef = useRef<HTMLButtonElement | null>(null);
  const results = useMemo(
    () => isTaskSearchMode ? searchNavigatorTasks(query, taskSearchEntities) : searchNavigatorTargets(query, targets),
    [isTaskSearchMode, query, targets, taskSearchEntities],
  );

  useEffect(() => {
    focusDropdownControl(inputRef.current);
  }, []);

  useEffect(() => {
    revealDropdownOptionWithinPanel(highlightedOptionRef.current, panelRef.current);
  }, [highlightedIndex, query, results.length]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (results.length === 0 ? 0 : (current + 1) % results.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (results.length === 0 ? 0 : (current - 1 + results.length) % results.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = results[highlightedIndex];
      if (target) {
        onNavigate(target);
        onClose();
      }
    }
  };

  const resultsPositionClass = placement === "bottom"
    ? "bottom-full left-0 mb-3"
    : placement === "left"
      ? "left-full top-0 ml-3"
      : "right-full top-0 mr-3";

  return (
    <>
      <button
        aria-label="Search navigation"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#6f57f6] transition hover:bg-[#f1ecff] dark:text-[#cabfff] dark:hover:bg-white/10"
        onClick={() => focusDropdownControl(inputRef.current)}
        type="button"
      >
        {renderIcon("Search")}
      </button>
      <button
        aria-label="Search all tasks"
        aria-pressed={isTaskSearchMode}
        className={`flex h-10 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-black transition ${isTaskSearchMode ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]" : "text-[#6f57f6] hover:bg-[#f1ecff] dark:text-[#cabfff] dark:hover:bg-white/10"}`}
        onClick={() => {
          setIsTaskSearchMode((current) => !current);
          setQuery("");
          setHighlightedIndex(0);
          focusDropdownControl(inputRef.current);
        }}
        title="Search all tasks"
        type="button"
      >
        #
      </button>
      <div className="relative flex min-w-0 w-full flex-1 items-center sm:w-auto">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2 h-4 w-4 text-[#8d87a7] dark:text-white/45" />
        <input
          aria-activedescendant={results[highlightedIndex] ? `navigator-search-option-${results[highlightedIndex].id}` : undefined}
          aria-controls="navigator-search-results"
          aria-label={isTaskSearchMode ? "Search all tasks" : "Search pages and sections"}
          aria-autocomplete="list"
          aria-expanded="true"
          autoComplete="off"
          className="h-10 min-w-0 w-full rounded-xl bg-[#f7f5ff] pl-8 pr-2 text-sm font-medium text-[#27304c] outline-none ring-1 ring-[#e5e0f5] transition focus:ring-2 focus:ring-[#b9a9ff] dark:bg-white/8 dark:text-white dark:placeholder:text-white/40 dark:ring-white/10"
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlightedIndex(0);
          }}
          onClick={() => focusDropdownControl(inputRef.current)}
          onKeyDown={handleKeyDown}
          placeholder={isTaskSearchMode ? "Search all tasks..." : "Search pages and sections..."}
          ref={inputRef}
          role="combobox"
          type="search"
          value={query}
        />
      </div>
      <button
        aria-label="Close navigation search"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#8d94ac] transition hover:bg-[#f7f5ff] hover:text-[#6f57f6] dark:text-white/50 dark:hover:bg-white/8 dark:hover:text-[#cabfff]"
        onClick={onClose}
        type="button"
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </button>

      <div aria-label={isTaskSearchMode ? "All tasks" : "Navigation destinations"} className={`absolute z-30 ${placement === "bottom" ? "w-[min(28rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]" : "w-[min(28rem,calc(100vw-7rem))] max-w-[calc(100vw-7rem)] sm:w-[min(28rem,calc(100vw-22rem))] sm:max-w-[calc(100vw-22rem)]"} rounded-2xl border border-[#ece8f8] bg-white p-2 shadow-[0_20px_50px_rgba(60,44,140,0.18)] dark:border-white/10 dark:bg-[#171328] ${resultsPositionClass}`} id="navigator-search-results" role="listbox">
        {results.length === 0 ? (
          <p className="px-3 py-5 text-center text-sm font-medium text-[#7d88a1] dark:text-white/55">{isTaskSearchMode ? (query.trim() ? "No tasks found." : "Type to search all tasks.") : "No destinations found."}</p>
        ) : (
          <div className="adhdice-scrollbar max-h-[min(55vh,22rem)] overflow-y-auto" ref={panelRef}>
            {results.map((target, index) => (
              <button
                aria-selected={highlightedIndex === index}
                className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${highlightedIndex === index ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#2a214f] dark:text-[#cabfff]" : "text-[#27304c] hover:bg-[#f7f5ff] dark:text-white dark:hover:bg-white/8"}`}
                id={`navigator-search-option-${target.id}`}
                key={target.id}
                onClick={() => {
                  onNavigate(target);
                  onClose();
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                ref={index === highlightedIndex ? highlightedOptionRef : undefined}
                role="option"
                type="button"
              >
                <span className="min-w-0 truncate text-sm font-semibold">{target.title}</span>
                <span className="shrink-0 truncate text-right text-xs text-[#8d87a7] dark:text-white/45">{target.breadcrumb.join(" › ")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

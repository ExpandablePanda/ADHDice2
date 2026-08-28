"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ModalShell } from "../modal-shell";
import { searchNavigatorTargets, type NavigatorSearchTarget } from "@/lib/navigator-search";

type NavigatorSearchModalProps = {
  onClose: () => void;
  onNavigate: (target: NavigatorSearchTarget) => void;
  targets: readonly NavigatorSearchTarget[];
};

export function NavigatorSearchModal({ onClose, onNavigate, targets }: NavigatorSearchModalProps) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const results = useMemo(() => searchNavigatorTargets(query, targets), [query, targets]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      }
    }
  };

  return (
    <ModalShell autoFocus={false} className="w-[min(92vw,34rem)] self-center rounded-[1.5rem] border border-[#ece8f8] bg-white p-4 shadow-[0_25px_70px_rgba(60,44,140,0.2)] dark:border-white/10 dark:bg-[#171328] sm:p-5" label="Go To" onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#202844] dark:text-white">Go To</h2>
        <button aria-label="Close navigation search" className="rounded-lg p-1.5 text-[#8d94ac] transition hover:bg-[#f7f5ff] hover:text-[#6f57f6] dark:text-white/50 dark:hover:bg-white/8 dark:hover:text-[#cabfff]" onClick={onClose} type="button">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="relative mt-3">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d87a7] dark:text-white/45" />
        <input
          aria-activedescendant={results[highlightedIndex] ? `navigator-search-option-${results[highlightedIndex].id}` : undefined}
          aria-controls="navigator-search-results"
          aria-label="Search pages and sections"
          aria-autocomplete="list"
          aria-expanded="true"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-[#e5e0f5] bg-[#f7f5ff] pl-9 pr-3 text-sm font-medium text-[#27304c] outline-none transition focus:border-[#b9a9ff] focus:ring-2 focus:ring-[#cfc3ff]/50 dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-white/40"
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search pages and sections..."
          ref={inputRef}
          role="combobox"
          type="search"
          value={query}
        />
      </div>

      <div aria-label="Navigation destinations" className="adhdice-scrollbar mt-3 max-h-[min(55vh,22rem)] overflow-y-auto" id="navigator-search-results" role="listbox">
        {results.length === 0 ? (
          <p className="px-3 py-5 text-center text-sm font-medium text-[#7d88a1] dark:text-white/55">No destinations found.</p>
        ) : (
          results.map((target, index) => (
            <button
              aria-selected={highlightedIndex === index}
              className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${highlightedIndex === index ? "bg-[#f1ecff] text-[#6f57f6] dark:bg-[#2a214f] dark:text-[#cabfff]" : "text-[#27304c] hover:bg-[#f7f5ff] dark:text-white dark:hover:bg-white/8"}`}
              id={`navigator-search-option-${target.id}`}
              key={target.id}
              onClick={() => onNavigate(target)}
              onMouseEnter={() => setHighlightedIndex(index)}
              role="option"
              type="button"
            >
              <span className="min-w-0 truncate text-sm font-semibold">{target.title}</span>
              <span className="shrink-0 truncate text-right text-xs text-[#8d87a7] dark:text-white/45">{target.breadcrumb.join(" › ")}</span>
            </button>
          ))
        )}
      </div>
    </ModalShell>
  );
}

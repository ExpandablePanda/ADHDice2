import React, { useMemo, useState } from "react";
import { FocusCategory, FocusType, FocusSubtype, FocusLabelOptions, CategoryIcon } from "./task-app";
import { ModalShell } from "./modal-shell";

const ACCENT_COLORS = [
  "#6f57f6",
  "#3b82f6",
  "#06b6d4",
  "#14b8a6",
  "#12a876",
  "#84cc16",
  "#f59e0b",
  "#ea580c",
  "#f97316",
  "#ef4444",
  "#f05566",
  "#ec4899",
  "#d946ef",
  "#8b5cf6",
  "#6366f1",
  "#64748b",
];
const AVAILABLE_ICONS = [
  { name: "Code", label: "Code" },
  { name: "Briefcase", label: "Work" },
  { name: "Brain", label: "Think" },
  { name: "Calendar", label: "Plan" },
  { name: "FileText", label: "Admin" },
  { name: "Target", label: "Goals" },
  { name: "Book", label: "Read" },
  { name: "Pen", label: "Write" },
  { name: "CheckSquare", label: "Tasks" },
  { name: "Palette", label: "Create" },
  { name: "Home", label: "Home" },
  { name: "Heart", label: "Health" },
  { name: "Dumbbell", label: "Fitness" },
  { name: "Coffee", label: "Break" },
  { name: "Moon", label: "Sleep" },
  { name: "Gamepad", label: "Play" },
  { name: "Monitor", label: "Screen" },
  { name: "User", label: "Personal" },
  { name: "Camera", label: "Photo" },
  { name: "Music", label: "Music" },
  { name: "Headphones", label: "Audio" },
  { name: "Rocket", label: "Launch" },
  { name: "Plane", label: "Travel" },
  { name: "Sparkles", label: "Ideas" },
  { name: "Sun", label: "Morning" },
  { name: "Utensils", label: "Food" },
  { name: "Wifi", label: "Online" },
  { name: "Star", label: "Favorite" },
  { name: "Shield", label: "Protect" },
  { name: "Search", label: "Explore" },
  { name: "DollarSign", label: "Money" },
  { name: "Layers", label: "Systems" },
  { name: "Server", label: "Backend" },
  { name: "Lock", label: "Secure" },
  { name: "Box", label: "General" },
  { name: "Dice", label: "Random" },
  { name: "Zap", label: "Energy" },
  { name: "PieChart", label: "Stats" },
  { name: "Smartphone", label: "Mobile" },
  { name: "Dices", label: "Games" },
  { name: "calendar-days", label: "Schedule" },
  { name: "book-open-text", label: "Notes" },
  { name: "bolt", label: "Focus" },
  { name: "book-open-check", label: "Study" },
  { name: "boxes", label: "Chores" },
  { name: "user-round", label: "Self" },
  { name: "shield-check", label: "Safety" },
  { name: "monitor-smartphone", label: "Desktop" },
  { name: "music2", label: "Listen" },
  { name: "coffee", label: "Reset" },
];

type SortMode = "title" | "focusType";

export function CategoryManager({
  categories,
  history,
  labelOptions,
  lightMode,
  onUpdate,
  onDelete,
  onClose,
}: {
  categories: FocusCategory[];
  history: { categoryId: string | null }[];
  labelOptions: FocusLabelOptions;
  lightMode: boolean;
  onUpdate: (categories: FocusCategory[]) => Promise<boolean>;
  onDelete: (category: FocusCategory) => Promise<boolean>;
  onClose: () => void;
}) {
  const [editingCat, setEditingCat] = useState<FocusCategory | null>(null);
  const [primarySubtypeDraft, setPrimarySubtypeDraft] = useState<FocusSubtype>("Productive");
  const [secondarySubtypeDraft, setSecondarySubtypeDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [iconSearch, setIconSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("title");

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const primaryA = sortMode === "title" ? a.title : a.focusType;
      const primaryB = sortMode === "title" ? b.title : b.focusType;
      const primaryCompare = primaryA.localeCompare(primaryB, undefined, { sensitivity: "base" });
      if (primaryCompare !== 0) {
        return primaryCompare;
      }
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
  }, [categories, sortMode]);

  const filteredIcons = useMemo(() => {
    const query = iconSearch.trim().toLowerCase();
    if (!query) {
      return AVAILABLE_ICONS;
    }
    return AVAILABLE_ICONS.filter((icon) =>
      `${icon.label} ${icon.name}`.toLowerCase().includes(query),
    );
  }, [iconSearch]);

  const openEditor = (category: FocusCategory) => {
    setEditingCat(category);
    setPrimarySubtypeDraft(category.focusSubtype ?? "");
    setSecondarySubtypeDraft(category.focusSubtype2 ?? "");
  };

  const handlePrimarySubtypeChange = (nextSubtype: FocusSubtype) => {
    setPrimarySubtypeDraft(nextSubtype);
    if (editingCat) {
      setEditingCat({
        ...editingCat,
        focusSubtype: nextSubtype.trim() || null,
        focusSubtype2: secondarySubtypeDraft.trim() || null,
      });
    }
  };

  const handleSecondarySubtypeChange = (nextSubtype: string) => {
    setSecondarySubtypeDraft(nextSubtype);
    if (!editingCat) {
      return;
    }

    setEditingCat({
      ...editingCat,
      focusSubtype: primarySubtypeDraft.trim() || null,
      focusSubtype2: nextSubtype.trim() || null,
    });
  };

  const saveCategory = async (cat: FocusCategory) => {
    const normalizedTitle = cat.title.trim().toLowerCase();
    const existingCategory = categories.find((existing) => existing.id === cat.id);
    const hasHistory = history.some((entry) => entry.categoryId === cat.id);
    const changedCoreFields = existingCategory
      ? existingCategory.title !== cat.title ||
        existingCategory.focusType !== cat.focusType ||
        (existingCategory.focusSubtype ?? "") !== (cat.focusSubtype ?? "") ||
        (existingCategory.focusSubtype2 ?? "") !== (cat.focusSubtype2 ?? "")
      : false;
    const shouldCreateNewCategory = Boolean(
      existingCategory &&
      hasHistory &&
      changedCoreFields &&
      !window.confirm(
        "Renaming this category will not change past sessions. Press OK to rename this category, or Cancel to keep the old category and create a new one instead.",
      ),
    );
    const nextCategory = shouldCreateNewCategory
      ? { ...cat, id: crypto.randomUUID() }
      : cat;
    const next = categories
      .filter((existingCategory) => {
        const isSameRecord = existingCategory.id === nextCategory.id;
        const isDuplicateName = existingCategory.title.trim().toLowerCase() === normalizedTitle;
        return isSameRecord || !isDuplicateName;
      })
      .map((c) => (c.id === nextCategory.id ? nextCategory : c));

    if (!next.find((c) => c.id === nextCategory.id)) {
      next.push(nextCategory);
    }

    setIsSaving(true);
    try {
      const saved = await onUpdate(next);
      if (saved) {
        setEditingCat(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCategory = async (category: FocusCategory) => {
    setDeletingId(category.id);
    try {
      const deleted = await onDelete(category);
      if (deleted && editingCat?.id === category.id) {
        setEditingCat(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const formatCategoryMeta = (category: FocusCategory) => {
    return [category.focusType, category.focusSubtype, category.focusSubtype2].filter(Boolean).join(" / ");
  };

  return (
    <ModalShell className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[var(--radius-modal)] border p-10 shadow-[var(--shadow-modal)] ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface-elevated)]" : "border-white/10 bg-[#171329]"}`}>
        {!editingCat ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className={`text-3xl font-black ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>Master Categories</h2>
                <p className={`mt-2 text-sm ${lightMode ? "text-[var(--text-secondary)]" : "text-white/55"}`}>Sort the list by category title or focus type.</p>
              </div>
              <button
                className={`rounded-full p-2 transition hover:bg-white/10 ${lightMode ? "text-[var(--text-muted)]" : "text-white/40"}`}
                onClick={onClose}
                type="button"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <button
                className={`flex items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-5 py-4 transition hover:bg-white/5 ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--accent)]" : "border-white/10 text-[#cabfff]"}`}
                onClick={() => openEditor({ id: Math.random().toString(), title: "New Category", focusType: "Work", focusSubtype: "Productive", focusSubtype2: null, color: "#6f57f6", icon: "Code", dailyGoalSeconds: null, weeklyGoalSeconds: null })}
                type="button"
              >
                <span className="text-lg font-bold">+</span> Add New
              </button>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-40">Sort Categories</span>
                <select
                  className={`px-4 py-3 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  value={sortMode}
                >
                  <option value="title">Category Title</option>
                  <option value="focusType">Focus Type</option>
                </select>
              </label>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {sortedCategories.map((cat) => (
                <div key={cat.id}>
                  <div
                    className={`flex items-center gap-3 rounded-[var(--radius-card)] border p-4 transition hover:-translate-y-0.5 ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface-muted)] shadow-[var(--shadow-card)]" : "border-white/5 bg-white/[0.03]"}`}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      onClick={() => openEditor(cat)}
                      type="button"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: cat.color + "20", color: cat.color }}>
                        <CategoryIcon name={cat.icon} className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate font-bold ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>{cat.title}</p>
                        <p className={`truncate text-xs ${lightMode ? "text-[var(--text-secondary)]" : "text-white/50"}`}>{formatCategoryMeta(cat)}</p>
                      </div>
                    </button>
                    <button
                      aria-label={`Delete ${cat.title}`}
                      className={`grid h-10 w-10 shrink-0 place-items-center transition hover:scale-105 disabled:opacity-50 ${lightMode ? "ui-pill-button-danger-light" : "rounded-full bg-[#351924] text-[#ff9fbc]"}`}
                      disabled={deletingId === cat.id}
                      onClick={() => void deleteCategory(cat)}
                      type="button"
                    >
                      <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.4" viewBox="0 0 24 24">
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${lightMode ? "text-[var(--text-muted)]" : "text-white/35"}`}>
                  Focus Category
                </p>
                <h3 className={`mt-2 text-2xl font-black ${lightMode ? "text-[var(--text-primary)]" : "text-white"}`}>Edit {editingCat.title}</h3>
              </div>
              <button
                className={`rounded-full p-2 transition hover:bg-white/10 ${lightMode ? "text-[var(--text-muted)]" : "text-white/40"}`}
                onClick={() => setEditingCat(null)}
                type="button"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-40">Title</span>
                <input
                  className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                  onChange={(e) => setEditingCat({ ...editingCat, title: e.target.value })}
                  type="text"
                  value={editingCat.title}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-40">Focus Type</span>
                <input
                  className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                  list="category-manager-focus-types"
                  onChange={(e) => setEditingCat({ ...editingCat, focusType: e.target.value as FocusType })}
                  placeholder="Work"
                  type="text"
                  value={editingCat.focusType}
                />
                <datalist id="category-manager-focus-types">
                  {labelOptions.types.map((option) => <option key={option} value={option} />)}
                </datalist>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-40">Subtype</span>
                <input
                  className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                  list="category-manager-primary-subtypes"
                  onChange={(e) => handlePrimarySubtypeChange(e.target.value as FocusSubtype)}
                  placeholder="Productive"
                  type="text"
                  value={primarySubtypeDraft}
                />
                <datalist id="category-manager-primary-subtypes">
                  {labelOptions.primarySubtypes.map((option) => <option key={option} value={option} />)}
                </datalist>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-40">Subtype 2</span>
                <input
                  className={`px-4 py-2 ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                  list="category-manager-secondary-subtypes"
                  onChange={(e) => handleSecondarySubtypeChange(e.target.value)}
                  placeholder="Optional"
                  type="text"
                  value={secondarySubtypeDraft}
                />
                <datalist id="category-manager-secondary-subtypes">
                  {labelOptions.secondarySubtypes.map((option) => <option key={option} value={option} />)}
                </datalist>
              </label>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-40">Icon</span>
                  <input
                    aria-label="Search icons"
                    className={`w-full sm:w-[13rem] px-4 py-2 text-sm ${lightMode ? "ui-input-light" : "rounded-xl border border-white/10 bg-white/5 text-white"}`}
                    onChange={(e) => setIconSearch(e.target.value)}
                    placeholder="Search icons"
                    type="text"
                    value={iconSearch}
                  />
                </div>
                <div
                  className={`max-h-[22rem] overflow-y-auto rounded-[var(--radius-card)] border p-3 ${lightMode ? "border-[var(--border-soft)] bg-[var(--surface-muted)]" : "border-white/10 bg-white/[0.04]"}`}
                >
                  <div className="grid grid-cols-5 gap-3">
                  {filteredIcons.map((icon) => (
                    <button
                      aria-label={icon.label}
                      key={icon.name}
                      className={`flex h-14 w-14 items-center justify-center rounded-full border transition ${editingCat.icon === icon.name ? lightMode ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)] shadow-[0_10px_22px_rgba(111,87,246,0.16)]" : "border-white/25 bg-white/10 text-white" : lightMode ? "border-[var(--border-soft)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--accent-soft)] hover:-translate-y-0.5" : "border-white/10 bg-white/5 text-white/70 hover:border-white/20"}`}
                      onClick={() => setEditingCat({ ...editingCat, icon: icon.name })}
                      title={icon.label}
                      type="button"
                    >
                      <CategoryIcon
                        className="h-5 w-5"
                        name={icon.name}
                        style={{ color: editingCat.color }}
                      />
                    </button>
                  ))}
                  </div>
                </div>
                {filteredIcons.length === 0 ? (
                  <p className={`text-sm ${lightMode ? "text-[var(--text-secondary)]" : "text-white/55"}`}>
                    No icons matched that search.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-40">Accent Color</span>
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={`Select ${c} accent color`}
                      className={`h-10 w-10 rounded-2xl border-2 transition ${editingCat.color === c ? lightMode ? "border-[var(--text-primary)] scale-105" : "border-white scale-105" : lightMode ? "border-[var(--border-soft)]" : "border-transparent"}`}
                      onClick={() => setEditingCat({ ...editingCat, color: c })}
                      style={{ backgroundColor: c }}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-3">
              <button
                className={`mr-auto px-6 py-2 font-bold ${lightMode ? "ui-pill-button-danger-light" : "rounded-full bg-[#351924] text-[#ff9fbc]"}`}
                disabled={deletingId === editingCat.id || isSaving}
                onClick={() => void deleteCategory(editingCat)}
                type="button"
              >
                {deletingId === editingCat.id ? "Deleting..." : "Delete"}
              </button>
              <button
                className={`px-6 py-2 font-bold ${lightMode ? "ui-pill-button-light" : "rounded-full bg-white/5 text-white"}`}
                onClick={() => setEditingCat(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`px-8 py-2 font-bold ${lightMode ? "ui-pill-button-strong-light" : "rounded-full bg-[#6f57f6] text-white shadow-lg shadow-[#6f57f6]/20"}`}
                disabled={isSaving}
                onClick={() => void saveCategory(editingCat)}
                type="button"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </>
        )}
    </ModalShell>
  );
}

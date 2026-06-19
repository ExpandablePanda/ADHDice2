import React, { useMemo, useState } from "react";
import { type FocusCategory, type FocusType, type FocusSubtype, type FocusLabelOptions } from "@/lib/types";
import { CategoryIcon } from "./task-app";
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
  { name: "calendar-days", label: "Schedule" },
  { name: "FileText", label: "Admin" },
  { name: "Target", label: "Goals" },
  { name: "book-open-text", label: "Notes" },
  { name: "book-open-check", label: "Study" },
  { name: "Pen", label: "Write" },
  { name: "CheckSquare", label: "Tasks" },
  { name: "Palette", label: "Create" },
  { name: "Home", label: "Home" },
  { name: "Heart", label: "Health" },
  { name: "Dumbbell", label: "Fitness" },
  { name: "weight", label: "Weights" },
  { name: "Coffee", label: "Break" },
  { name: "bed-double", label: "Sleep" },
  { name: "Moon", label: "Night" },
  { name: "Gamepad", label: "Games" },
  { name: "monitor-smartphone", label: "Screens" },
  { name: "user-round", label: "Personal" },
  { name: "Camera", label: "Photo" },
  { name: "Music", label: "Music" },
  { name: "Headphones", label: "Audio" },
  { name: "guitar", label: "Guitar" },
  { name: "piano", label: "Piano" },
  { name: "drum", label: "Drums" },
  { name: "Rocket", label: "Launch" },
  { name: "Plane", label: "Travel" },
  { name: "Sparkles", label: "Ideas" },
  { name: "Sun", label: "Morning" },
  { name: "Utensils", label: "Food" },
  { name: "Wifi", label: "Online" },
  { name: "Star", label: "Favorite" },
  { name: "shield-check", label: "Safety" },
  { name: "Search", label: "Explore" },
  { name: "DollarSign", label: "Money" },
  { name: "Layers", label: "Systems" },
  { name: "Server", label: "Backend" },
  { name: "Lock", label: "Secure" },
  { name: "boxes", label: "Chores" },
  { name: "Zap", label: "Energy" },
  { name: "bolt", label: "Focus" },
  { name: "PieChart", label: "Stats" },
  { name: "Smartphone", label: "Mobile" },
  { name: "radiation", label: "Radioactive" },
  { name: "shopping-cart", label: "Shopping" },
  { name: "clapperboard", label: "Film" },
  { name: "film", label: "Movies" },
  { name: "popcorn", label: "Popcorn" },
  { name: "shower-head", label: "Shower" },
  { name: "bath", label: "Bath" },
  { name: "volleyball", label: "Sports" },
  { name: "basketball", label: "Basketball" },
  { name: "circle-dot", label: "Ball" },
  { name: "tv", label: "TV" },
  { name: "circle-play", label: "YouTube" },
];

const EXTENDED_ICONS = [
  // Food & drink
  { name: "apple", label: "Apple" },
  { name: "banana", label: "Banana" },
  { name: "beef", label: "Meat" },
  { name: "beer", label: "Beer" },
  { name: "bottle-wine", label: "Wine" },
  { name: "cake", label: "Cake" },
  { name: "candy", label: "Candy" },
  { name: "carrot", label: "Vegetable" },
  { name: "chef-hat", label: "Chef" },
  { name: "cherry", label: "Cherry" },
  { name: "cookie", label: "Cookie" },
  { name: "croissant", label: "Croissant" },
  { name: "cup-soda", label: "Soda" },
  { name: "egg", label: "Egg" },
  { name: "fish", label: "Fish" },
  { name: "ice-cream-bowl", label: "Ice Cream" },
  { name: "leaf", label: "Veggie" },
  { name: "citrus", label: "Citrus" },
  { name: "martini", label: "Cocktail" },
  { name: "milk", label: "Milk" },
  { name: "nut", label: "Nuts" },
  { name: "pizza", label: "Pizza" },
  { name: "salad", label: "Salad" },
  { name: "sandwich", label: "Sandwich" },
  { name: "soup", label: "Soup" },
  { name: "steak", label: "Steak" },
  { name: "utensils-crossed", label: "Sushi" },
  { name: "wheat", label: "Grain" },
  // Fitness & body
  { name: "activity", label: "Activity" },
  { name: "biceps-flexed", label: "Strength" },
  { name: "bike", label: "Bike" },
  { name: "flame", label: "Burn" },
  { name: "footprints", label: "Walk" },
  { name: "heart-pulse", label: "Cardio" },
  { name: "mountain", label: "Hiking" },
  { name: "person-standing", label: "Stretch" },
  { name: "footprints", label: "Run" },
  { name: "waves-ladder", label: "Swim" },
  { name: "circle-dot", label: "Tennis" },
  { name: "sport-shoe", label: "Sneakers" },
  { name: "trophy", label: "Trophy" },
  { name: "wind", label: "Breathe" },
  { name: "person-standing", label: "Yoga" },
  // Nature & outdoors
  { name: "cloud", label: "Cloud" },
  { name: "cloud-rain", label: "Rain" },
  { name: "flower", label: "Flower" },
  { name: "flower-2", label: "Bloom" },
  { name: "globe", label: "World" },
  { name: "mountain-snow", label: "Snow" },
  { name: "sprout", label: "Plant" },
  { name: "shovel", label: "Garden" },
  { name: "snowflake", label: "Winter" },
  { name: "sprout", label: "Grow" },
  { name: "sun-medium", label: "Sunny" },
  { name: "sunset", label: "Sunset" },
  { name: "thermometer", label: "Temp" },
  { name: "tree-deciduous", label: "Tree" },
  { name: "tree-pine", label: "Pine" },
  { name: "umbrella", label: "Umbrella" },
  { name: "waves", label: "Ocean" },
  // Home & life
  { name: "armchair", label: "Relax" },
  { name: "baby", label: "Baby" },
  { name: "backpack", label: "Backpack" },
  { name: "bath", label: "Bath" },
  { name: "bed-single", label: "Nap" },
  { name: "brush-cleaning", label: "Clean" },
  { name: "cooking-pot", label: "Cook" },
  { name: "door-open", label: "Door" },
  { name: "drill", label: "Drill" },
  { name: "hammer", label: "Repair" },
  { name: "key", label: "Key" },
  { name: "lamp", label: "Lamp" },
  { name: "lamp-desk", label: "Desk" },
  { name: "mailbox", label: "Mail" },
  { name: "package", label: "Package" },
  { name: "paintbrush", label: "Paint" },
  { name: "phone", label: "Call" },
  { name: "plug", label: "Power" },
  { name: "printer", label: "Print" },
  { name: "recycle", label: "Recycle" },
  { name: "refrigerator", label: "Fridge" },
  { name: "scissors", label: "Craft" },
  { name: "shirt", label: "Laundry" },
  { name: "shopping-bag", label: "Errands" },
  { name: "sofa", label: "Couch" },
  { name: "syringe", label: "Medical" },
  { name: "toilet", label: "Toilet" },
  { name: "tool", label: "DIY" },
  { name: "trash", label: "Trash" },
  { name: "tv-2", label: "Streaming" },
  { name: "washing-machine", label: "Laundry" },
  { name: "wrench", label: "Fix" },
  // Arts & media
  { name: "airplay", label: "Airplay" },
  { name: "album", label: "Album" },
  { name: "award", label: "Award" },
  { name: "boom-box", label: "Boombox" },
  { name: "brush", label: "Art" },
  { name: "cassette-tape", label: "Tape" },
  { name: "disc", label: "Disc" },
  { name: "dices", label: "Tabletop" },
  { name: "gamepad-2", label: "Console" },
  { name: "image", label: "Image" },
  { name: "joystick", label: "Joystick" },
  { name: "mic", label: "Mic" },
  { name: "mic-2", label: "Sing" },
  { name: "newspaper", label: "News" },
  { name: "radio", label: "Radio" },
  { name: "scroll", label: "Scroll" },
  { name: "ticket", label: "Event" },
  { name: "tv-minimal-play", label: "Watch" },
  { name: "video", label: "Video" },
  { name: "music-4", label: "Violin" },
  { name: "volume-2", label: "Sound" },
  // Transport & travel
  { name: "bus", label: "Bus" },
  { name: "cable-car", label: "Tram" },
  { name: "car", label: "Car" },
  { name: "car-front", label: "Drive" },
  { name: "compass", label: "Navigate" },
  { name: "map", label: "Map" },
  { name: "map-pin", label: "Location" },
  { name: "navigation", label: "GPS" },
  { name: "ship", label: "Boat" },
  { name: "train", label: "Train" },
  { name: "train-front", label: "Metro" },
  { name: "truck", label: "Truck" },
  // Work & productivity
  { name: "archive", label: "Archive" },
  { name: "bell", label: "Alert" },
  { name: "binoculars", label: "Research" },
  { name: "briefcase-medical", label: "Medical" },
  { name: "calculator", label: "Math" },
  { name: "chart-line", label: "Growth" },
  { name: "clipboard", label: "Clipboard" },
  { name: "clock", label: "Time" },
  { name: "cpu", label: "Computer" },
  { name: "database", label: "Database" },
  { name: "flag", label: "Flag" },
  { name: "folder", label: "Folder" },
  { name: "glasses", label: "Reading" },
  { name: "inbox", label: "Inbox" },
  { name: "landmark", label: "Finance" },
  { name: "laptop", label: "Laptop" },
  { name: "megaphone", label: "Announce" },
  { name: "message-circle", label: "Chat" },
  { name: "microscope", label: "Science" },
  { name: "paperclip", label: "Attach" },
  { name: "pencil", label: "Edit" },
  { name: "presentation", label: "Present" },
  { name: "receipt", label: "Receipt" },
  { name: "sticker", label: "Label" },
  { name: "swatch-book", label: "Design" },
  { name: "tag", label: "Tag" },
  { name: "terminal", label: "Terminal" },
  // People & social
  { name: "cat", label: "Cat" },
  { name: "dog", label: "Dog" },
  { name: "handshake", label: "Meeting" },
  { name: "users", label: "Team" },
  { name: "users-round", label: "Group" },
  { name: "smile", label: "Happy" },
  { name: "laugh", label: "Laugh" },
  { name: "baby", label: "Kids" },
  { name: "graduation-cap", label: "School" },
  { name: "church", label: "Spiritual" },
  { name: "drama", label: "Acting" },
  { name: "party-popper", label: "Celebrate" },
  { name: "gift", label: "Gift" },
  { name: "handshake", label: "Social" },
  // Misc
  { name: "anchor", label: "Anchor" },
  { name: "atom", label: "Physics" },
  { name: "biohazard", label: "Biohazard" },
  { name: "bomb", label: "Bomb" },
  { name: "crown", label: "VIP" },
  { name: "diamond", label: "Diamond" },
  { name: "dna", label: "Biology" },
  { name: "fingerprint-pattern", label: "Identity" },
  { name: "flask-conical", label: "Chemistry" },
  { name: "gem", label: "Gem" },
  { name: "ghost", label: "Ghost" },
  { name: "infinity", label: "Infinite" },
  { name: "leaf", label: "Nature" },
  { name: "magnet", label: "Attract" },
  { name: "milestone", label: "Milestone" },
  { name: "pill", label: "Medicine" },
  { name: "puzzle", label: "Puzzle" },
  { name: "shield-half", label: "Defense" },
  { name: "skull", label: "Skull" },
  { name: "swords", label: "Battle" },
  { name: "wand", label: "Magic" },
  { name: "zap-off", label: "Offline" },
];

type SortMode = "title" | "focusType";

export function CategoryManager({
  categories,
  history,
  labelOptions,
  onUpdate,
  onDelete,
  onClose,
}: {
  categories: FocusCategory[];
  history: { categoryId: string | null }[];
  labelOptions: FocusLabelOptions;
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
    const pool = [...AVAILABLE_ICONS, ...EXTENDED_ICONS];
    const seen = new Set<string>();
    return pool.filter((icon) => {
      if (seen.has(icon.name)) return false;
      seen.add(icon.name);
      return `${icon.label} ${icon.name}`.toLowerCase().includes(query);
    });
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
    <ModalShell
      className="adhdice-scrollbar w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[var(--radius-modal)] border p-10 shadow-[var(--shadow-modal)] border-[var(--border-soft)] bg-[var(--surface-elevated)] dark:border-white/10 dark:bg-[#171329]"
      onClose={editingCat ? () => setEditingCat(null) : onClose}
    >
        {!editingCat ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-[var(--text-primary)]">Master Categories</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Sort the list by category title or focus type.</p>
              </div>
              <button
                className="rounded-full p-2 transition hover:bg-white/10 text-[var(--text-muted)]"
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
                className="flex items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-5 py-4 transition hover:bg-white/5 border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--accent)] dark:border-white/10 dark:bg-transparent"
                onClick={() => openEditor({ id: Math.random().toString(), title: "New Category", focusType: "Work", focusSubtype: "Productive", focusSubtype2: null, color: "#6f57f6", icon: "Code", dailyGoalSeconds: null, weeklyGoalSeconds: null })}
                type="button"
              >
                <span className="text-lg font-bold">+</span> Add New
              </button>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-40">Sort Categories</span>
                <select
                  className="px-4 py-3 ui-input-light"
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
                  <div className="flex items-center gap-3 rounded-[var(--radius-card)] border p-4 transition hover:-translate-y-0.5 border-[var(--border-soft)] bg-[var(--surface-muted)] shadow-[var(--shadow-card)] dark:border-white/5 dark:bg-white/[0.03] dark:shadow-none">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      onClick={() => openEditor(cat)}
                      type="button"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: cat.color + "20", color: cat.color }}>
                        <CategoryIcon name={cat.icon} className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[var(--text-primary)]">{cat.title}</p>
                        <p className="truncate text-xs text-[var(--text-secondary)]">{formatCategoryMeta(cat)}</p>
                      </div>
                    </button>
                    <button
                      aria-label={`Delete ${cat.title}`}
                      className="grid h-10 w-10 shrink-0 place-items-center transition hover:scale-105 disabled:opacity-50 ui-pill-button-danger-light dark:rounded-full dark:bg-[#351924] dark:text-[#ff9fbc]"
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Focus Category
                </p>
                <h3 className="mt-2 text-2xl font-black text-[var(--text-primary)]">Edit {editingCat.title}</h3>
              </div>
              <button
                className="rounded-full p-2 transition hover:bg-white/10 text-[var(--text-muted)]"
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
                  className="px-4 py-2 ui-input-light"
                  onChange={(e) => setEditingCat({ ...editingCat, title: e.target.value })}
                  type="text"
                  value={editingCat.title}
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-40">Focus Type</span>
                <input
                  className="px-4 py-2 ui-input-light"
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
                  className="px-4 py-2 ui-input-light"
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
                  className="px-4 py-2 ui-input-light"
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
                    className="w-full sm:w-[13rem] px-4 py-2 text-sm ui-input-light"
                    onChange={(e) => setIconSearch(e.target.value)}
                    placeholder="Search icons"
                    type="text"
                    value={iconSearch}
                  />
                </div>
                <div className="adhdice-scrollbar max-h-[22rem] overflow-y-auto rounded-[var(--radius-card)] border p-3 border-[var(--border-soft)] bg-[var(--surface-muted)] dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="grid grid-cols-5 gap-3">
                  {filteredIcons.map((icon) => (
                    <button
                      aria-label={icon.label}
                      key={icon.name}
                      className={`flex h-14 w-14 items-center justify-center rounded-full border transition ${
                        editingCat.icon === icon.name
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)] shadow-[0_10px_22px_rgba(111,87,246,0.16)] dark:border-white/25 dark:bg-white/10 dark:text-white"
                          : "border-[var(--border-soft)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--accent-soft)] hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:border-white/20"
                      }`}
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
                  <p className="text-sm text-[var(--text-secondary)]">
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
                      className={`h-10 w-10 rounded-2xl border-2 transition ${
                        editingCat.color === c
                          ? "border-[var(--text-primary)] scale-105"
                          : "border-[var(--border-soft)] dark:border-transparent"
                      }`}
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
                className="mr-auto px-6 py-2 font-bold ui-pill-button-danger-light dark:rounded-full dark:bg-[#351924] dark:text-[#ff9fbc]"
                disabled={deletingId === editingCat.id || isSaving}
                onClick={() => void deleteCategory(editingCat)}
                type="button"
              >
                {deletingId === editingCat.id ? "Deleting..." : "Delete"}
              </button>
              <button
                className="px-6 py-2 font-bold ui-pill-button-light dark:rounded-full dark:bg-white/5 dark:text-white"
                onClick={() => setEditingCat(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-8 py-2 font-bold ui-pill-button-strong-light dark:rounded-full dark:bg-[#6f57f6] dark:text-white dark:shadow-lg dark:shadow-[#6f57f6]/20"
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

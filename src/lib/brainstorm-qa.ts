export type QaStatus = "not_tested" | "pass" | "fail" | "blocked";

export type QaItem = {
  appVersion: string;
  id: string;
  text: string;
  status: QaStatus;
  notes: string;
};

export type QaSession = {
  id: string;
  title: string;
  appVersion: string;
  environment: string;
  sessionDate: string;
  items: QaItem[];
  observations: string;
  createdAt: string;
  updatedAt: string;
};

export type BrainstormQaState = {
  schemaVersion: 2;
  activeSessionId: string | null;
  sessions: QaSession[];
};

export type QaProgress = {
  blocked: number;
  fail: number;
  followUp: boolean;
  label: "Not started" | "In progress" | "Complete";
  notTested: number;
  pass: number;
  tested: number;
  total: number;
};

export type QaIdFactory = () => string;

const QA_STATUSES = new Set<QaStatus>(["not_tested", "pass", "fail", "blocked"]);
const GENERIC_HEADINGS = new Set(["qa checklist", "test steps", "manual qa"]);
const EPOCH = "1970-01-01T00:00:00.000Z";

function validIso(value: unknown, fallback = EPOCH) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

function validDate(value: unknown, fallback: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00`)) ? value : fallback;
}

function localDate(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultId() {
  return globalThis.crypto?.randomUUID?.() ?? `qa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeAppVersion(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeItem(value: unknown, sessionAppVersion: string): QaItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<QaItem>;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const text = typeof item.text === "string" ? item.text.trim() : "";
  if (!id || !text) return null;
  return {
    appVersion: Object.hasOwn(item, "appVersion") ? normalizeAppVersion(item.appVersion) : sessionAppVersion,
    id,
    notes: typeof item.notes === "string" ? item.notes : "",
    status: QA_STATUSES.has(item.status as QaStatus) ? item.status as QaStatus : "not_tested",
    text,
  };
}

function normalizeSession(value: unknown, fallbackDate: string): QaSession | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Partial<QaSession>;
  const id = typeof session.id === "string" ? session.id.trim() : "";
  if (!id) return null;
  const createdAt = validIso(session.createdAt);
  const appVersion = normalizeAppVersion(session.appVersion);
  return {
    appVersion,
    createdAt,
    environment: typeof session.environment === "string" ? session.environment : "",
    id,
    items: Array.isArray(session.items) ? session.items.map((item) => normalizeItem(item, appVersion)).filter((item): item is QaItem => Boolean(item)) : [],
    observations: typeof session.observations === "string" ? session.observations : "",
    sessionDate: validDate(session.sessionDate, fallbackDate),
    title: typeof session.title === "string" ? session.title : "",
    updatedAt: validIso(session.updatedAt, createdAt),
  };
}

export function createEmptyBrainstormQaState(): BrainstormQaState {
  return { activeSessionId: null, schemaVersion: 2, sessions: [] };
}

export function normalizeBrainstormQaState(value: unknown, now = new Date()): BrainstormQaState {
  if (!value || typeof value !== "object") return createEmptyBrainstormQaState();
  const candidate = value as Partial<BrainstormQaState>;
  const sessions = Array.isArray(candidate.sessions)
    ? candidate.sessions.map((session) => normalizeSession(session, localDate(now))).filter((session): session is QaSession => Boolean(session))
    : [];
  const requestedId = typeof candidate.activeSessionId === "string" ? candidate.activeSessionId : null;
  return {
    activeSessionId: sessions.some((session) => session.id === requestedId) ? requestedId : sessions[0]?.id ?? null,
    schemaVersion: 2,
    sessions,
  };
}

export function createQaSession(options: { appVersion?: string; environment?: string; title?: string } = {}, now = new Date(), idFactory: QaIdFactory = defaultId): QaSession {
  const timestamp = now.toISOString();
  return {
    appVersion: options.appVersion ?? "",
    createdAt: timestamp,
    environment: options.environment ?? "",
    id: idFactory(),
    items: [],
    observations: "",
    sessionDate: localDate(now),
    title: options.title ?? "New QA Session",
    updatedAt: timestamp,
  };
}

export function duplicateQaSession(session: QaSession, now = new Date(), idFactory: QaIdFactory = defaultId): QaSession {
  const timestamp = now.toISOString();
  return {
    ...session,
    createdAt: timestamp,
    id: idFactory(),
    items: session.items.map((item) => ({ ...item, id: idFactory() })),
    sessionDate: localDate(now),
    title: `${session.title || "QA Session"} Copy`,
    updatedAt: timestamp,
  };
}

export function deleteQaSession(state: BrainstormQaState, sessionId: string): BrainstormQaState {
  const index = state.sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) return state;
  const sessions = state.sessions.filter((session) => session.id !== sessionId);
  return {
    ...state,
    activeSessionId: state.activeSessionId === sessionId ? sessions[Math.min(index, sessions.length - 1)]?.id ?? null : state.activeSessionId,
    sessions,
  };
}

export function resetQaSession(session: QaSession, now = new Date()): QaSession {
  return { ...session, items: session.items.map((item) => ({ ...item, status: "not_tested" })), updatedAt: now.toISOString() };
}

export function updateQaSession(session: QaSession, changes: Partial<Omit<QaSession, "id" | "createdAt" | "updatedAt">>, now = new Date()): QaSession {
  return { ...session, ...changes, updatedAt: now.toISOString() };
}

export function addQaItem(session: QaSession, text: string, now = new Date(), idFactory: QaIdFactory = defaultId): QaSession {
  const normalized = text.trim();
  if (!normalized) return session;
  return updateQaSession(session, { items: [...session.items, { appVersion: session.appVersion, id: idFactory(), notes: "", status: "not_tested", text: normalized }] }, now);
}

export function updateQaItem(session: QaSession, itemId: string, changes: Partial<Pick<QaItem, "appVersion" | "notes" | "status" | "text">>, now = new Date()): QaSession {
  const normalizedChanges = "appVersion" in changes ? { ...changes, appVersion: normalizeAppVersion(changes.appVersion) } : changes;
  return updateQaSession(session, { items: session.items.map((item) => item.id === itemId ? { ...item, ...normalizedChanges } : item) }, now);
}

export function deleteQaItem(session: QaSession, itemId: string, now = new Date()): QaSession {
  return updateQaSession(session, { items: session.items.filter((item) => item.id !== itemId) }, now);
}

export function clearPassedQaItems(session: QaSession): QaSession {
  if (!session.items.some((item) => item.status === "pass")) return session;
  return { ...session, items: session.items.filter((item) => item.status !== "pass") };
}

export function reorderQaItems(session: QaSession, fromIndex: number, toIndex: number, now = new Date()): QaSession {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= session.items.length || toIndex >= session.items.length) return session;
  const items = [...session.items];
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  return updateQaSession(session, { items }, now);
}

function stripListSyntax(value: string) {
  let text = value.trim();
  let previous = "";
  while (text && text !== previous) {
    previous = text;
    text = text
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\[(?: |x|X)\]\s*/, "")
      .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")
      .trim();
  }
  return text;
}

export function parseQaChecklist(source: string) {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const items: string[] = [];
  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const indented = /^\s+/.test(rawLine);
    const trimmed = rawLine.trim();
    const hasListMarker = /^(?:#{1,6}\s+|\[(?: |x|X)\]\s*|[-*+]\s+|\d+[.)]\s+)/.test(trimmed);
    const text = stripListSyntax(trimmed);
    if (!text || GENERIC_HEADINGS.has(text.toLowerCase().replace(/:$/, "").trim())) continue;
    if (indented && !hasListMarker && items.length > 0) items[items.length - 1] = `${items[items.length - 1]} ${text}`;
    else items.push(text);
  }
  return items;
}

export function importQaItems(session: QaSession, source: string, mode: "append" | "replace" = "append", appVersion = session.appVersion, now = new Date(), idFactory: QaIdFactory = defaultId) {
  const parsed = parseQaChecklist(source);
  if (parsed.length === 0) return { count: 0, session };
  const imported = parsed.map<QaItem>((text) => ({ appVersion: normalizeAppVersion(appVersion), id: idFactory(), notes: "", status: "not_tested", text }));
  return { count: imported.length, session: updateQaSession(session, { items: mode === "replace" ? imported : [...session.items, ...imported] }, now) };
}

export function deriveQaProgress(session: QaSession): QaProgress {
  const counts = session.items.reduce((result, item) => ({ ...result, [item.status]: result[item.status] + 1 }), { blocked: 0, fail: 0, not_tested: 0, pass: 0 });
  const total = session.items.length;
  const tested = total - counts.not_tested;
  return {
    blocked: counts.blocked,
    fail: counts.fail,
    followUp: counts.fail > 0 || counts.blocked > 0,
    label: tested === 0 ? "Not started" : tested === total ? "Complete" : "In progress",
    notTested: counts.not_tested,
    pass: counts.pass,
    tested,
    total,
  };
}

const STATUS_LABEL: Record<QaStatus, string> = { blocked: "BLOCKED", fail: "FAIL", not_tested: "NOT TESTED", pass: "PASS" };

function itemReportLines(item: QaItem) {
  const lines = [`${STATUS_LABEL[item.status]} — [${item.appVersion || "Unversioned"}] ${item.text}`];
  if (item.notes.trim()) lines.push(`Note: ${item.notes.trim()}`);
  return lines;
}

export function generateQaFullReport(session: QaSession) {
  const progress = deriveQaProgress(session);
  const versions = session.items.reduce<string[]>((result, item) => {
    const version = item.appVersion || "Unversioned";
    if (!result.includes(version)) result.push(version);
    return result;
  }, []);
  const versionLine = versions.length === 0
    ? `App version: ${session.appVersion}`
    : versions.length === 1 && versions[0] !== "Unversioned"
      ? `App version: ${versions[0]}`
      : `Versions: ${versions.join(", ")}`;
  const lines = [
    session.title,
    versionLine,
    `Environment: ${session.environment}`,
    `Session date: ${session.sessionDate}`,
    `${progress.tested} / ${progress.total} tested`,
    `Pass: ${progress.pass} | Fail: ${progress.fail} | Blocked: ${progress.blocked} | Not Tested: ${progress.notTested}`,
  ];
  if (session.items.length) lines.push("", ...session.items.flatMap(itemReportLines));
  if (session.observations.trim()) lines.push("", "General problems:", session.observations.trim());
  return `${lines.join("\n")}\n`;
}

export function generateQaFailuresReport(session: QaSession) {
  const items = session.items.filter((item) => item.status === "fail" || item.status === "blocked");
  return items.length ? `${items.flatMap(itemReportLines).join("\n")}\n` : "No failed or blocked items.";
}

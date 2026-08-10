const SUPABASE_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TaskStateCommandAuthContext = {
  userClaims?: { id?: unknown };
};

export function userIdFromContext(context: TaskStateCommandAuthContext): string | null {
  const userId = context.userClaims?.id;
  return typeof userId === "string" && SUPABASE_USER_ID_PATTERN.test(userId) ? userId : null;
}

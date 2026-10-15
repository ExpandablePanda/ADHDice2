export type HomeRecoveryRestoreGateConfig = {
  enabled: string | undefined;
  environment: string | undefined;
  allowedOrigins: string | undefined;
};

export function isHomeRecoveryRestoreEnabled(
  origin: string | null | undefined,
  config: HomeRecoveryRestoreGateConfig = {
    enabled: process.env.NEXT_PUBLIC_HOME_RECOVERY_RESTORE_ENABLED,
    environment: process.env.NEXT_PUBLIC_HOME_RECOVERY_RESTORE_ENV,
    allowedOrigins: process.env.NEXT_PUBLIC_HOME_RECOVERY_RESTORE_ALLOWED_ORIGINS,
  },
) {
  if (config.enabled !== "true" || !["development", "staging"].includes(config.environment ?? "") || !origin) return false;
  const allowedOrigins = (config.allowedOrigins ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (allowedOrigins.length === 0) return false;
  let currentOrigin: string;
  try {
    currentOrigin = new URL(origin).origin;
  } catch {
    return false;
  }
  return allowedOrigins.some((value) => {
    try {
      return new URL(value).origin === currentOrigin && value === new URL(value).origin;
    } catch {
      return false;
    }
  });
}

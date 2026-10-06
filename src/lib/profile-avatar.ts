export function getProfileAvatarInitial(displayName: string) {
  const normalizedName = displayName.trim();
  return normalizedName ? normalizedName.charAt(0).toUpperCase() : "?";
}

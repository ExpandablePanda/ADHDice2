import Image from "next/image";
import { getProfileAvatarInitial } from "@/lib/profile-avatar";

const PROFILE_AVATAR_BASE_CLASS = "rounded-full bg-[var(--hud-surface)] object-cover ring-[3px] ring-white/70 shadow-[0_8px_22px_rgba(81,61,168,0.12)]";

export function ProfileAvatarImage({
  avatarSrc,
  className = "h-11 w-11",
  displayName,
  priority = true,
}: {
  avatarSrc: string;
  className?: string;
  displayName: string;
  priority?: boolean;
}) {
  const sharedClassName = `${className} ${PROFILE_AVATAR_BASE_CLASS}`;
  if (!avatarSrc.trim()) {
    return (
      <span
        aria-label="Profile avatar"
        className={`${sharedClassName} flex items-center justify-center bg-[#f1ecff] text-sm font-bold text-[#6f57f6] dark:bg-white/10 dark:text-[#c5b8ff]`}
        role="img"
      >
        {getProfileAvatarInitial(displayName)}
      </span>
    );
  }

  return (
    <Image
      alt="Profile avatar"
      className={sharedClassName}
      height={44}
      key={avatarSrc}
      priority={priority}
      src={avatarSrc}
      unoptimized={avatarSrc.startsWith("data:")}
      width={44}
    />
  );
}

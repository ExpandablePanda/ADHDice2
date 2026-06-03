"use client";

export function PageShellHeader({
  subtitle,
  title,
}: {
  subtitle: string;
  title: string;
}) {
  return (
    <div className="pb-6 pt-[5px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8e88a9] dark:text-white/40">
        {subtitle}
      </p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-[#17203a] dark:text-white">
        {title}
      </h1>
    </div>
  );
}

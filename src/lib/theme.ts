export function themeTokens(lightMode: boolean) {
  const lm = lightMode;
  return {
    lm,
    cardBg:      lm ? "bg-[#f7f5ff]"   : "bg-white/5",
    labelColor:  lm ? "text-[#8e88a9]" : "text-white/40",
    headingColor:lm ? "text-[#17203a]" : "text-white",
    dimText:     lm ? "text-[#27304c]" : "text-white/70",
    accentBg:    lm ? "bg-[#6f57f6]"   : "bg-[#9b87ff]",
    accentText:  lm ? "text-white"     : "text-[#171127]",
  };
}

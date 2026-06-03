"use client";

import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { ErrorBoundary } from "../error-boundary";
import {
  applyD6MaterialPreset,
  DEFAULT_D6_VISUAL_STYLE,
  D6_FACE_ROTATION_PRESETS,
  type D6MaterialPreset,
  type D6VisualStyle,
} from "../dice-3d";

const D6CalibrationCanvas = lazy(() => import("../dice-3d").then((module) => ({ default: module.D6CalibrationCanvas })));

const BODY_COLORS = [
  { bodyEmissive: "#8f7af6", label: "Lavender", value: "#cbbcff" },
  { bodyEmissive: "#4f8fff", label: "Ocean", value: "#82b7ff" },
  { bodyEmissive: "#38b59c", label: "Mint", value: "#7ae2ca" },
  { bodyEmissive: "#c86d3d", label: "Amber", value: "#ffb56f" },
  { bodyEmissive: "#b6486f", label: "Rose", value: "#ff8db1" },
  { bodyEmissive: "#717b96", label: "Slate", value: "#bcc7df" },
  { bodyEmissive: "#3e485e", label: "Midnight", value: "#5c6988" },
  { bodyEmissive: "#c4a240", label: "Gold", value: "#f0cb63" },
  { bodyEmissive: "#9443ff", label: "Violet", value: "#bb7dff" },
  { bodyEmissive: "#ff547c", label: "Cherry", value: "#ff7f9e" },
  { bodyEmissive: "#24997b", label: "Jade", value: "#49d8b0" },
  { bodyEmissive: "#d86d11", label: "Copper", value: "#f39b48" },
] as const;

const PIP_COLORS = [
  { pipEmissive: "#f7f4ff", label: "White", value: "#ffffff" },
  { pipEmissive: "#f6fbff", label: "Ice", value: "#edf7ff" },
  { pipEmissive: "#fff4cf", label: "Cream", value: "#fff2bb" },
  { pipEmissive: "#2b3144", label: "Ink", value: "#1e2433" },
  { pipEmissive: "#3a2a1c", label: "Espresso", value: "#4a3424" },
  { pipEmissive: "#ffd8e5", label: "Blush", value: "#ffd1de" },
  { pipEmissive: "#dffbff", label: "Aqua", value: "#bff9ff" },
  { pipEmissive: "#efe4ff", label: "Lilac", value: "#ddc6ff" },
  { pipEmissive: "#ffd76f", label: "Sun", value: "#ffcb45" },
] as const;

const MATERIAL_PRESETS: Array<{ description: string; label: string; value: D6MaterialPreset }> = [
  { description: "Soft shine with the current polished look.", label: "Ceramic", value: "ceramic" },
  { description: "High-saturation candy shell with more glow.", label: "Candy", value: "candy" },
  { description: "Lower sheen and more powdery body feel.", label: "Matte", value: "matte" },
  { description: "Shinier translucent-style highlight balance.", label: "Glass", value: "glass" },
  { description: "Heavier metallic highlight response.", label: "Metal", value: "metal" },
];

function buildDiceStyleExport(style: D6VisualStyle) {
  return `const CUSTOM_D6_STYLE = ${JSON.stringify(style, null, 2)};`;
}

function SliderField({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-[#4d4272] dark:text-white/75">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <input
        className="w-full accent-[#6f57f6] dark:accent-[#cabfff]"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function CollapsibleSection({
  children,
  isOpen,
  onToggle,
  title,
}: {
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <section className="mt-5 rounded-[1.25rem] bg-[#f7f4ff] p-4 dark:bg-white/[0.05]">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between text-left"
        onClick={onToggle}
        type="button"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f87b4] dark:text-white/35">
          {title}
        </span>
        <span className="text-lg font-semibold text-[#6f57f6] dark:text-[#cabfff]">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export function TestDiceMaterialLab({
  dark,
}: {
  dark: boolean;
}) {
  const [style, setStyle] = useState<D6VisualStyle>(DEFAULT_D6_VISUAL_STYLE);
  const [previewFace, setPreviewFace] = useState<number>(5);
  const [openSections, setOpenSections] = useState({
    advancedFinish: false,
    customColors: false,
    exportStyle: false,
    material: false,
    pipColor: false,
    sideColor: true,
  });

  const exportText = useMemo(() => buildDiceStyleExport(style), [style]);
  const updateStyle = (patch: Partial<D6VisualStyle>) => setStyle((current) => ({ ...current, ...patch }));
  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  return (
    <div className="mx-auto mt-10 w-full max-w-6xl rounded-[2rem] border border-[#eee7ff] bg-[linear-gradient(180deg,#fcfbff_0%,#f8f4ff_100%)] p-6 text-left shadow-[0_28px_80px_rgba(116,88,255,0.12)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(35,28,58,0.95)_0%,rgba(25,20,43,0.98)_100%)]">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b92be] dark:text-white/35">
          Dice Material Lab
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#342d56] dark:text-white">
          Click through custom D6 looks
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#726a96] dark:text-white/60">
          Test body color, pip color, and finish presets for fun custom dice ideas. This stays isolated to the Test page so we can explore cosmetic variants safely.
        </p>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.6fr)_minmax(22rem,0.4fr)]">
        <div className="overflow-hidden rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-4 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <ErrorBoundary fallback={<div className="h-[420px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
            <Suspense fallback={<div className="h-[420px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
              <D6CalibrationCanvas
                dark={dark}
                height={420}
                interactive
                rotation={D6_FACE_ROTATION_PRESETS[previewFace] ?? D6_FACE_ROTATION_PRESETS[1]}
                scale={1.5}
                style={style}
              />
            </Suspense>
          </ErrorBoundary>
          <div className="mt-4 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((face) => (
              <button
                className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                  previewFace === face
                    ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#171127]"
                    : "bg-[#f4f1ff] text-[#655d88] dark:bg-white/[0.05] dark:text-white/65"
                }`}
                key={face}
                onClick={() => setPreviewFace(face)}
                type="button"
              >
                Face {face}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-[1.25rem] bg-[#f7f4ff] px-4 py-3 text-sm text-[#675f8d] dark:bg-white/[0.05] dark:text-white/60">
            Previewing face <span className="font-semibold text-[#3c345d] dark:text-white">#{previewFace}</span> with the currently selected custom style.
            {" "}Drag to rotate, drag the background to pan, and use scroll to zoom.
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-5 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <CollapsibleSection isOpen={openSections.sideColor} onToggle={() => toggleSection("sideColor")} title="Side Color">
            <div className="flex flex-wrap gap-2">
              {BODY_COLORS.map((option) => (
                <button
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                    style.bodyColor === option.value
                      ? "border-[#cbbcff] bg-[#f5f1ff] text-[#4d4272] dark:border-[#5a4a95] dark:bg-white/[0.08] dark:text-white"
                      : "border-[#e4def6] bg-white text-[#6a628d] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65"
                  }`}
                  key={option.label}
                  onClick={() => setStyle((current) => ({ ...current, bodyColor: option.value, bodyEmissive: option.bodyEmissive }))}
                  type="button"
                >
                  <span className="h-4 w-4 rounded-full border border-black/5" style={{ background: option.value }} />
                  {option.label}
                </button>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection isOpen={openSections.pipColor} onToggle={() => toggleSection("pipColor")} title="Pip Color">
            <div className="flex flex-wrap gap-2">
              {PIP_COLORS.map((option) => (
                <button
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                    style.pipColor === option.value
                      ? "border-[#cbbcff] bg-[#f5f1ff] text-[#4d4272] dark:border-[#5a4a95] dark:bg-white/[0.08] dark:text-white"
                      : "border-[#e4def6] bg-white text-[#6a628d] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65"
                  }`}
                  key={option.label}
                  onClick={() => setStyle((current) => ({ ...current, pipColor: option.value, pipEmissive: option.pipEmissive }))}
                  type="button"
                >
                  <span className="h-4 w-4 rounded-full border border-black/5" style={{ background: option.value }} />
                  {option.label}
                </button>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection isOpen={openSections.material} onToggle={() => toggleSection("material")} title="Material">
            <div className="space-y-2">
              {MATERIAL_PRESETS.map((preset) => (
                <button
                  className={`w-full rounded-[1rem] border px-4 py-3 text-left transition ${
                    style.finish === preset.value
                      ? "border-[#cbbcff] bg-[#f5f1ff] dark:border-[#5a4a95] dark:bg-white/[0.08]"
                      : "border-[#e4def6] bg-white dark:border-white/10 dark:bg-white/[0.03]"
                  }`}
                  key={preset.value}
                  onClick={() => setStyle((current) => applyD6MaterialPreset(current, preset.value))}
                  type="button"
                >
                  <p className="text-sm font-semibold text-[#4d4272] dark:text-white">{preset.label}</p>
                  <p className="mt-1 text-xs text-[#726a96] dark:text-white/55">{preset.description}</p>
                </button>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection isOpen={openSections.customColors} onToggle={() => toggleSection("customColors")} title="Custom Colors">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="rounded-[1rem] border border-[#e4def6] bg-white px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f87b4] dark:text-white/35">Body color</span>
                <div className="mt-2 flex items-center gap-3">
                  <input className="h-10 w-16 cursor-pointer rounded border-0 bg-transparent p-0" onChange={(event) => updateStyle({ bodyColor: event.target.value })} type="color" value={style.bodyColor} />
                  <span className="text-sm font-medium text-[#5f567f] dark:text-white/65">{style.bodyColor}</span>
                </div>
              </label>
              <label className="rounded-[1rem] border border-[#e4def6] bg-white px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f87b4] dark:text-white/35">Body glow</span>
                <div className="mt-2 flex items-center gap-3">
                  <input className="h-10 w-16 cursor-pointer rounded border-0 bg-transparent p-0" onChange={(event) => updateStyle({ bodyEmissive: event.target.value })} type="color" value={style.bodyEmissive} />
                  <span className="text-sm font-medium text-[#5f567f] dark:text-white/65">{style.bodyEmissive}</span>
                </div>
              </label>
              <label className="rounded-[1rem] border border-[#e4def6] bg-white px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f87b4] dark:text-white/35">Pip color</span>
                <div className="mt-2 flex items-center gap-3">
                  <input className="h-10 w-16 cursor-pointer rounded border-0 bg-transparent p-0" onChange={(event) => updateStyle({ pipColor: event.target.value })} type="color" value={style.pipColor} />
                  <span className="text-sm font-medium text-[#5f567f] dark:text-white/65">{style.pipColor}</span>
                </div>
              </label>
              <label className="rounded-[1rem] border border-[#e4def6] bg-white px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f87b4] dark:text-white/35">Pip glow</span>
                <div className="mt-2 flex items-center gap-3">
                  <input className="h-10 w-16 cursor-pointer rounded border-0 bg-transparent p-0" onChange={(event) => updateStyle({ pipEmissive: event.target.value })} type="color" value={style.pipEmissive} />
                  <span className="text-sm font-medium text-[#5f567f] dark:text-white/65">{style.pipEmissive}</span>
                </div>
              </label>
            </div>
          </CollapsibleSection>

          <CollapsibleSection isOpen={openSections.advancedFinish} onToggle={() => toggleSection("advancedFinish")} title="Advanced Finish">
            <div className="grid gap-4">
              <SliderField label="Body opacity" max={1} min={0.15} onChange={(value) => updateStyle({ bodyOpacity: value })} step={0.01} value={style.bodyOpacity} />
              <SliderField label="Body roughness" max={1} min={0} onChange={(value) => updateStyle({ bodyRoughness: value })} step={0.01} value={style.bodyRoughness} />
              <SliderField label="Body metalness" max={1} min={0} onChange={(value) => updateStyle({ bodyMetalness: value })} step={0.01} value={style.bodyMetalness} />
              <SliderField label="Body glow strength" max={0.35} min={0} onChange={(value) => updateStyle({ bodyEmissiveIntensity: value })} step={0.01} value={style.bodyEmissiveIntensity} />
              <SliderField label="Pip opacity" max={1} min={0.15} onChange={(value) => updateStyle({ pipOpacity: value })} step={0.01} value={style.pipOpacity} />
              <SliderField label="Pip roughness" max={1} min={0} onChange={(value) => updateStyle({ pipRoughness: value })} step={0.01} value={style.pipRoughness} />
              <SliderField label="Pip metalness" max={1} min={0} onChange={(value) => updateStyle({ pipMetalness: value })} step={0.01} value={style.pipMetalness} />
              <SliderField label="Pip glow strength" max={0.35} min={0} onChange={(value) => updateStyle({ pipEmissiveIntensity: value })} step={0.01} value={style.pipEmissiveIntensity} />
            </div>
          </CollapsibleSection>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="rounded-full bg-[#6f57f6] px-4 py-2 text-sm font-semibold text-white dark:bg-[#cabfff] dark:text-[#171127]"
              onClick={() => setStyle(DEFAULT_D6_VISUAL_STYLE)}
              type="button"
            >
              Reset To Default
            </button>
          </div>

          <CollapsibleSection isOpen={openSections.exportStyle} onToggle={() => toggleSection("exportStyle")} title="Export Style">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#4a416d] dark:text-white/75">
              {exportText}
            </pre>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}

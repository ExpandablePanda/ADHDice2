"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import { ErrorBoundary } from "../error-boundary";
import { D20_FACE_ROTATION_PRESETS } from "../dice-3d";

const D20CalibrationCanvas = lazy(() => import("../dice-3d").then((module) => ({ default: module.D20CalibrationCanvas })));

type RotationTuple = [number, number, number];

const FACE_VALUES = Array.from({ length: 20 }, (_, index) => index + 1);
const AXES: Array<{ key: keyof AxisValues; label: string }> = [
  { key: "x", label: "Rotate X" },
  { key: "y", label: "Rotate Y" },
  { key: "z", label: "Rotate Z" },
];
const DEGREE_STEP = 5;
const DEFAULT_ROTATION: RotationTuple = D20_FACE_ROTATION_PRESETS[20] ?? [0, 0, 0];

type AxisValues = {
  x: number;
  y: number;
  z: number;
};

function radiansToDegrees(value: number) {
  return Math.round((value * 180) / Math.PI);
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function tupleToDegrees(rotation: RotationTuple): AxisValues {
  return {
    x: radiansToDegrees(rotation[0]),
    y: radiansToDegrees(rotation[1]),
    z: radiansToDegrees(rotation[2]),
  };
}

function degreesToTuple(rotation: AxisValues): RotationTuple {
  return [
    degreesToRadians(rotation.x),
    degreesToRadians(rotation.y),
    degreesToRadians(rotation.z),
  ];
}

function formatRadians(value: number) {
  return Number(value.toFixed(4));
}

function createInitialRotations() {
  return Object.fromEntries(
    FACE_VALUES.map((face) => [face, D20_FACE_ROTATION_PRESETS[face] ?? DEFAULT_ROTATION]),
  ) as Record<number, RotationTuple>;
}

function buildExportText(rotations: Record<number, RotationTuple>) {
  return `const D20_FACE_ROTATIONS: Record<number, [number, number, number]> = ${JSON.stringify(
    Object.fromEntries(
      Object.entries(rotations).map(([face, [x, y, z]]) => [
        face,
        [formatRadians(x), formatRadians(y), formatRadians(z)],
      ]),
    ),
    null,
    2,
  )};`;
}

function isRotationSaved(face: number, savedFaces: number[]) {
  return savedFaces.includes(face);
}

export function TestD20FaceMapper({
  dark,
}: {
  dark: boolean;
}) {
  const [selectedFace, setSelectedFace] = useState<number>(1);
  const [savedRotations, setSavedRotations] = useState<Record<number, RotationTuple>>(() => createInitialRotations());
  const [savedFaces, setSavedFaces] = useState<number[]>(() => [...FACE_VALUES]);
  const [draftRotation, setDraftRotation] = useState<AxisValues>(
    () => tupleToDegrees(D20_FACE_ROTATION_PRESETS[1] ?? DEFAULT_ROTATION),
  );

  const activeRotation = useMemo(() => degreesToTuple(draftRotation), [draftRotation]);
  const exportText = useMemo(() => buildExportText(savedRotations), [savedRotations]);

  function loadFace(face: number) {
    setSelectedFace(face);
    setDraftRotation(tupleToDegrees(savedRotations[face] ?? DEFAULT_ROTATION));
  }

  function updateAxis(axis: keyof AxisValues, nextValue: number) {
    setDraftRotation((current) => ({ ...current, [axis]: nextValue }));
  }

  function nudgeAxis(axis: keyof AxisValues, delta: number) {
    setDraftRotation((current) => ({ ...current, [axis]: current[axis] + delta }));
  }

  function saveCurrentFace() {
    setSavedRotations((current) => ({
      ...current,
      [selectedFace]: activeRotation,
    }));
    setSavedFaces((current) => (
      current.includes(selectedFace)
        ? current
        : [...current, selectedFace].sort((left, right) => left - right)
    ));
  }

  function resetCurrentFace() {
    setSavedRotations((current) => ({
      ...current,
      [selectedFace]: D20_FACE_ROTATION_PRESETS[selectedFace] ?? DEFAULT_ROTATION,
    }));
    setSavedFaces((current) => current.filter((face) => face !== selectedFace));
    setDraftRotation(tupleToDegrees(D20_FACE_ROTATION_PRESETS[selectedFace] ?? DEFAULT_ROTATION));
  }

  function resetAllFaces() {
    setSavedRotations(createInitialRotations());
    setSavedFaces([...FACE_VALUES]);
    setSelectedFace(1);
    setDraftRotation(tupleToDegrees(D20_FACE_ROTATION_PRESETS[1] ?? DEFAULT_ROTATION));
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-6xl rounded-[2rem] border border-[#eee7ff] bg-[linear-gradient(180deg,#fcfbff_0%,#f8f4ff_100%)] p-6 text-left shadow-[0_28px_80px_rgba(116,88,255,0.12)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(35,28,58,0.95)_0%,rgba(25,20,43,0.98)_100%)]">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b92be] dark:text-white/35">
          D20 Face Mapper
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#342d56] dark:text-white">
          Drag the sandbox die and rebuild all 20 face targets
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#726a96] dark:text-white/60">
          Pick a face, rotate the D20 until that number is truly on top and camera-facing, then save it.
          Work through all 20 faces and send me the export block when the set is complete.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-[#efe8ff] px-4 py-2 font-semibold text-[#5f47d8] dark:bg-white/[0.08] dark:text-[#d3c7ff]">
          Saved {savedFaces.length}/20 faces
        </span>
        <span className="text-[#726a96] dark:text-white/60">
          Current face: <span className="font-semibold text-[#3c345d] dark:text-white">#{selectedFace}</span>
        </span>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.56fr)_minmax(20rem,0.44fr)]">
        <div className="overflow-hidden rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-4 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <ErrorBoundary fallback={<div className="h-[420px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
            <Suspense fallback={<div className="h-[420px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
              <D20CalibrationCanvas
                dark={dark}
                height={420}
                interactive
                onRotationChange={(nextRotation) => setDraftRotation(tupleToDegrees(nextRotation))}
                rotation={activeRotation}
              />
            </Suspense>
          </ErrorBoundary>
          <div className="mt-4 rounded-[1.25rem] bg-[#f7f4ff] px-4 py-3 text-sm text-[#675f8d] dark:bg-white/[0.05] dark:text-white/60">
            Drag anywhere in the sandbox to rotate the die freely around the full 360.
            {" "}Save once face <span className="font-semibold text-[#3c345d] dark:text-white">#{selectedFace}</span> is clearly the top result you want the roll to land on.
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-5 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {FACE_VALUES.map((face) => {
              const saved = isRotationSaved(face, savedFaces);
              const selected = selectedFace === face;

              return (
                <button
                  className={`rounded-[1rem] px-3 py-3 text-sm font-semibold transition ${
                    selected
                      ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#171127]"
                      : saved
                        ? "bg-[#e9fff6] text-[#13795b] dark:bg-[#113127] dark:text-[#9ff0d2]"
                        : "bg-[#f4f1ff] text-[#655d88] dark:bg-white/[0.05] dark:text-white/65"
                  }`}
                  key={face}
                  onClick={() => loadFace(face)}
                  type="button"
                >
                  Face {face}
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-4">
            {AXES.map((axis) => (
              <div key={axis.key}>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold text-[#4a416d] dark:text-white/75">
                  <span>{axis.label}</span>
                  <span>{draftRotation[axis.key]}&deg;</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-full bg-[#f4f1ff] px-3 py-2 text-sm font-semibold text-[#655d88] dark:bg-white/[0.05] dark:text-white/65"
                    onClick={() => nudgeAxis(axis.key, -DEGREE_STEP)}
                    type="button"
                  >
                    -{DEGREE_STEP}&deg;
                  </button>
                  <input
                    className="w-full accent-[#6f57f6] dark:accent-[#cabfff]"
                    max={180}
                    min={-180}
                    onChange={(event) => updateAxis(axis.key, Number(event.target.value))}
                    step={1}
                    type="range"
                    value={draftRotation[axis.key]}
                  />
                  <button
                    className="rounded-full bg-[#f4f1ff] px-3 py-2 text-sm font-semibold text-[#655d88] dark:bg-white/[0.05] dark:text-white/65"
                    onClick={() => nudgeAxis(axis.key, DEGREE_STEP)}
                    type="button"
                  >
                    +{DEGREE_STEP}&deg;
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="rounded-full bg-[#6f57f6] px-4 py-2 text-sm font-semibold text-white dark:bg-[#cabfff] dark:text-[#171127]"
              onClick={saveCurrentFace}
              type="button"
            >
              Save Face {selectedFace}
            </button>
            <button
              className="rounded-full border border-[#ddd6fb] bg-white px-4 py-2 text-sm font-semibold text-[#5c6684] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70"
              onClick={resetCurrentFace}
              type="button"
            >
              Reset Face {selectedFace}
            </button>
            <button
              className="rounded-full border border-[#ddd6fb] bg-white px-4 py-2 text-sm font-semibold text-[#5c6684] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70"
              onClick={resetAllFaces}
              type="button"
            >
              Reset All
            </button>
          </div>

          <div className="mt-5 rounded-[1.25rem] bg-[#f7f4ff] p-4 dark:bg-white/[0.05]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f87b4] dark:text-white/35">
              Export Mapping
            </p>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#4a416d] dark:text-white/75">
              {exportText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

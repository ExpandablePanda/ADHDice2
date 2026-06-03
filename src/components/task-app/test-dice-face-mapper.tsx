"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import { ErrorBoundary } from "../error-boundary";
import { D6_FACE_ROTATION_PRESETS } from "../dice-3d";

const D6CalibrationCanvas = lazy(() => import("../dice-3d").then((module) => ({ default: module.D6CalibrationCanvas })));

type RotationTuple = [number, number, number];

const FACE_VALUES = [1, 2, 3, 4, 5, 6] as const;
const AXES: Array<{ key: keyof AxisValues; label: string }> = [
  { key: "x", label: "Rotate X" },
  { key: "y", label: "Rotate Y" },
  { key: "z", label: "Rotate Z" },
];
const DEGREE_STEP = 5;

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

function buildExportText(rotations: Record<number, RotationTuple>) {
  return `const D6_FACE_ROTATIONS: Record<number, [number, number, number]> = ${JSON.stringify(
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

export function TestDiceFaceMapper({
  dark,
}: {
  dark: boolean;
}) {
  const [selectedFace, setSelectedFace] = useState<number>(1);
  const [savedRotations, setSavedRotations] = useState<Record<number, RotationTuple>>(
    () => ({ ...D6_FACE_ROTATION_PRESETS }),
  );
  const [draftRotation, setDraftRotation] = useState<AxisValues>(
    () => tupleToDegrees(D6_FACE_ROTATION_PRESETS[1]),
  );

  const activeRotation = useMemo(() => degreesToTuple(draftRotation), [draftRotation]);
  const exportText = useMemo(() => buildExportText(savedRotations), [savedRotations]);

  function loadFace(face: number) {
    setSelectedFace(face);
    setDraftRotation(tupleToDegrees(savedRotations[face] ?? D6_FACE_ROTATION_PRESETS[face] ?? [0, 0, 0]));
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
  }

  function resetCurrentFace() {
    const preset = D6_FACE_ROTATION_PRESETS[selectedFace] ?? [0, 0, 0];
    setSavedRotations((current) => ({ ...current, [selectedFace]: preset }));
    setDraftRotation(tupleToDegrees(preset));
  }

  function resetAllFaces() {
    setSavedRotations({ ...D6_FACE_ROTATION_PRESETS });
    setSelectedFace(1);
    setDraftRotation(tupleToDegrees(D6_FACE_ROTATION_PRESETS[1]));
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-6xl rounded-[2rem] border border-[#eee7ff] bg-[linear-gradient(180deg,#fcfbff_0%,#f8f4ff_100%)] p-6 text-left shadow-[0_28px_80px_rgba(116,88,255,0.12)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(35,28,58,0.95)_0%,rgba(25,20,43,0.98)_100%)]">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9b92be] dark:text-white/35">
          D6 Face Mapper
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#342d56] dark:text-white">
          Spin the reward die and map each face
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#726a96] dark:text-white/60">
          Use this Test-page sandbox to rotate the D6 until the selected face is correctly up and camera-facing, then save that face.
          Once all six look right, send me the exported mapping and I can wire it into the landing behavior.
        </p>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.56fr)_minmax(20rem,0.44fr)]">
        <div className="overflow-hidden rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-4 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <ErrorBoundary fallback={<div className="h-[280px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
            <Suspense fallback={<div className="h-[280px] w-full rounded-2xl bg-[#f0ecff] dark:bg-[#130e24]" />}>
              <D6CalibrationCanvas dark={dark} height={280} rotation={activeRotation} />
            </Suspense>
          </ErrorBoundary>
          <div className="mt-4 rounded-[1.25rem] bg-[#f7f4ff] px-4 py-3 text-sm text-[#675f8d] dark:bg-white/[0.05] dark:text-white/60">
            Current preview face: <span className="font-semibold text-[#3c345d] dark:text-white">#{selectedFace}</span>
            {" "}· Save when that number is on top and oriented the way you want it to face the camera.
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-[#ede6ff] bg-white/82 p-5 shadow-[0_18px_40px_rgba(121,93,255,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-wrap gap-2">
            {FACE_VALUES.map((face) => (
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectedFace === face
                    ? "bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#171127]"
                    : "bg-[#f4f1ff] text-[#655d88] dark:bg-white/[0.05] dark:text-white/65"
                }`}
                key={face}
                onClick={() => loadFace(face)}
                type="button"
              >
                Face {face}
              </button>
            ))}
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

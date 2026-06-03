import type {
  HealthMetricEntryInsert,
  HealthMetricType,
  HealthWeightEntryInsert,
} from "@/lib/database.types";

type RawAppleMetricSample = {
  date: string;
  endAt: string;
  fingerprint: string;
  metricType: HealthMetricType;
  value: number;
};

export type AppleHealthImportPreview = {
  endDate: string | null;
  fileName: string;
  malformedCount: number;
  metricEntries: Omit<HealthMetricEntryInsert, "user_id">[];
  sampleCount: number;
  skippedCount: number;
  startDate: string | null;
  unsupportedCount: number;
  weightEntries: Omit<HealthWeightEntryInsert, "user_id">[];
};

export type AppleHealthImportParseProgress = {
  message: string;
  stage: "extracting" | "parsing";
};

const SLEEP_VALUES = new Set([
  "HKCategoryValueSleepAnalysisAsleep",
  "HKCategoryValueSleepAnalysisAsleepCore",
  "HKCategoryValueSleepAnalysisAsleepDeep",
  "HKCategoryValueSleepAnalysisAsleepREM",
  "HKCategoryValueSleepAnalysisAsleepUnspecified",
  "1",
  "3",
  "4",
  "5",
  "6",
  "7",
]);

export async function parseAppleHealthFile(
  file: File,
  options?: { onProgress?: (progress: AppleHealthImportParseProgress) => void },
) {
  const buffer = await file.arrayBuffer();
  return parseAppleHealthBuffer(buffer, file.name, options);
}

export async function parseAppleHealthBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  options?: { onProgress?: (progress: AppleHealthImportParseProgress) => void },
) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".zip")) {
    options?.onProgress?.({ message: "Extracting Apple Health export...", stage: "extracting" });
  }
  const xmlText = lowerName.endsWith(".zip")
    ? await extractAppleHealthXmlFromZip(buffer)
    : new TextDecoder().decode(buffer);
  options?.onProgress?.({ message: "Parsing supported Apple Health records...", stage: "parsing" });
  return parseAppleHealthXml(xmlText, fileName);
}

export function parseAppleHealthXml(xmlText: string, fileName = "export.xml"): AppleHealthImportPreview {
  const rawSamples: RawAppleMetricSample[] = [];
  const weightEntries: Omit<HealthWeightEntryInsert, "user_id">[] = [];
  let malformedCount = 0;
  let skippedCount = 0;
  let unsupportedCount = 0;

  const selfClosingTags = xmlText.match(/<(Record|Workout)\b[^>]*\/>/g) ?? [];
  for (const tag of selfClosingTags) {
    try {
      if (tag.startsWith("<Record")) {
        const attrs = parseTagAttributes(tag);
        const result = parseAppleRecord(attrs);
        if (result.kind === "unsupported") {
          unsupportedCount += 1;
          continue;
        }
        if (result.kind === "skipped") {
          skippedCount += 1;
          continue;
        }
        rawSamples.push(result.sample);
        if (result.weightEntry) {
          weightEntries.push(result.weightEntry);
        }
        continue;
      }

      const attrs = parseTagAttributes(tag);
      const result = parseAppleWorkout(attrs);
      if (result.kind === "unsupported") {
        unsupportedCount += 1;
        continue;
      }
      if (result.kind === "skipped") {
        skippedCount += 1;
        continue;
      }
      rawSamples.push(result.sample);
    } catch {
      malformedCount += 1;
    }
  }

  const aggregatedMetrics = aggregateMetricSamples(rawSamples);
  const sortedDates = aggregatedMetrics.map((entry) => entry.metric_date).sort();

  return {
    endDate: sortedDates.at(-1) ?? null,
    fileName,
    malformedCount,
    metricEntries: aggregatedMetrics,
    sampleCount: rawSamples.length,
    skippedCount,
    startDate: sortedDates[0] ?? null,
    unsupportedCount,
    weightEntries,
  };
}

function parseAppleRecord(attrs: Record<string, string>) {
  const type = attrs.type;
  const startDate = normalizeAppleDate(attrs.startDate);
  const endDate = normalizeAppleDate(attrs.endDate ?? attrs.creationDate ?? attrs.startDate);

  if (!type || !startDate || !endDate) {
    return { kind: "skipped" as const };
  }

  switch (type) {
    case "HKQuantityTypeIdentifierStepCount": {
      const value = parseFiniteNumber(attrs.value);
      if (value === null) {
        return { kind: "skipped" as const };
      }
      return { kind: "sample" as const, sample: buildSample("steps", startDate, endDate, value) };
    }
    case "HKQuantityTypeIdentifierActiveEnergyBurned": {
      const value = parseFiniteNumber(attrs.value);
      if (value === null) {
        return { kind: "skipped" as const };
      }
      return { kind: "sample" as const, sample: buildSample("active_energy_kcal", startDate, endDate, value) };
    }
    case "HKCategoryTypeIdentifierSleepAnalysis": {
      const sleepValue = attrs.value ?? "";
      if (!SLEEP_VALUES.has(sleepValue)) {
        return { kind: "skipped" as const };
      }
      const minutes = diffMinutes(startDate, endDate);
      if (minutes <= 0) {
        return { kind: "skipped" as const };
      }
      return { kind: "sample" as const, sample: buildSample("sleep_minutes", startDate, endDate, minutes) };
    }
    case "HKQuantityTypeIdentifierBodyMass": {
      const value = parseFiniteNumber(attrs.value);
      if (value === null) {
        return { kind: "skipped" as const };
      }
      const weightKg = normalizeWeightKilograms(value, attrs.unit ?? "");
      if (weightKg === null) {
        return { kind: "skipped" as const };
      }
      return {
        kind: "sample" as const,
        sample: buildSample("body_mass_kg", startDate, endDate, weightKg),
        weightEntry: {
          entry_date: startDate.slice(0, 10),
          logged_at: endDate,
          note: "Imported from Apple Health",
          source: "apple_health_import",
          weight_kg: Number(weightKg.toFixed(2)),
        } satisfies Omit<HealthWeightEntryInsert, "user_id">,
      };
    }
    default:
      return { kind: "unsupported" as const };
  }
}

function parseAppleWorkout(attrs: Record<string, string>) {
  const startDate = normalizeAppleDate(attrs.startDate);
  const endDate = normalizeAppleDate(attrs.endDate ?? attrs.startDate);
  if (!startDate || !endDate) {
    return { kind: "skipped" as const };
  }

  const duration = parseFiniteNumber(attrs.duration);
  const durationUnit = attrs.durationUnit ?? "";
  const minutes = duration === null ? diffMinutes(startDate, endDate) : normalizeWorkoutMinutes(duration, durationUnit);
  if (minutes === null || minutes <= 0) {
    return { kind: "skipped" as const };
  }

  return {
    kind: "sample" as const,
    sample: buildSample("exercise_minutes", startDate, endDate, minutes),
  };
}

function buildSample(metricType: HealthMetricType, startAt: string, endAt: string, value: number): RawAppleMetricSample {
  return {
    date: startAt.slice(0, 10),
    endAt,
    fingerprint: `${metricType}|${startAt}|${endAt}|${Number(value.toFixed(4))}`,
    metricType,
    value: Number(value.toFixed(4)),
  };
}

function aggregateMetricSamples(samples: RawAppleMetricSample[]) {
  const totals = new Map<string, Omit<HealthMetricEntryInsert, "user_id">>();
  const bodyMassLatest = new Map<string, RawAppleMetricSample>();

  for (const sample of samples) {
    if (sample.metricType === "body_mass_kg") {
      const bodyMassKey = `${sample.metricType}|${sample.date}`;
      const current = bodyMassLatest.get(bodyMassKey);
      if (!current || current.endAt < sample.endAt) {
        bodyMassLatest.set(bodyMassKey, sample);
      }
      continue;
    }

    const key = `${sample.metricType}|${sample.date}`;
    const current = totals.get(key);
    if (!current) {
      totals.set(key, {
        metric_date: sample.date,
        metric_type: sample.metricType,
        metric_value: Number(sample.value.toFixed(2)),
        source: "apple_health_import",
        source_fingerprint: sample.fingerprint,
      });
      continue;
    }

    current.metric_value = Number((current.metric_value + sample.value).toFixed(2));
    current.source_fingerprint = `${current.source_fingerprint}__${sample.fingerprint}`;
  }

  for (const sample of bodyMassLatest.values()) {
    totals.set(`${sample.metricType}|${sample.date}`, {
      metric_date: sample.date,
      metric_type: sample.metricType,
      metric_value: Number(sample.value.toFixed(2)),
      source: "apple_health_import",
      source_fingerprint: sample.fingerprint,
    });
  }

  return [...totals.values()].sort((left, right) => right.metric_date.localeCompare(left.metric_date));
}

function parseTagAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  const matches = tag.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g);
  for (const match of matches) {
    const key = match[1];
    const value = match[2];
    if (key) {
      attrs[key] = value ?? "";
    }
  }
  return attrs;
}

function normalizeAppleDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s([+-]\d{4})$/, " $1");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function parseFiniteNumber(value: string | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWorkoutMinutes(duration: number, durationUnit: string) {
  switch (durationUnit.toLowerCase()) {
    case "min":
    case "minute":
    case "minutes":
      return duration;
    case "h":
    case "hr":
    case "hour":
    case "hours":
      return duration * 60;
    case "s":
    case "sec":
    case "second":
    case "seconds":
      return duration / 60;
    default:
      return duration;
  }
}

function normalizeWeightKilograms(value: number, unit: string) {
  switch (unit.toLowerCase()) {
    case "kg":
      return value;
    case "lb":
    case "lbs":
      return value / 2.2046226218;
    default:
      return null;
  }
}

function diffMinutes(startAt: string, endAt: string) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return (end - start) / 60000;
}

async function extractAppleHealthXmlFromZip(buffer: ArrayBuffer) {
  const archive = new Uint8Array(buffer);
  const entry = findZipEntry(archive, "export.xml");
  if (!entry) {
    throw new Error("That zip did not contain Apple Health export.xml.");
  }

  const fileBytes = archive.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  const content = entry.compressionMethod === 0
    ? fileBytes
    : entry.compressionMethod === 8
      ? await inflateRaw(fileBytes)
      : null;

  if (!content) {
    throw new Error("This Apple Health zip used an unsupported compression method.");
  }

  return new TextDecoder().decode(content);
}

function findZipEntry(archive: Uint8Array, fileNameSuffix: string) {
  const eocdOffset = findEndOfCentralDirectory(archive);
  if (eocdOffset === -1) {
    throw new Error("That file does not look like a valid zip archive.");
  }

  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      break;
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const fileName = new TextDecoder().decode(archive.slice(nameStart, nameStart + fileNameLength));

    if (fileName.toLowerCase().endsWith(fileNameSuffix.toLowerCase())) {
      const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      return {
        compressedSize,
        compressionMethod,
        dataOffset,
        fileName,
      };
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function findEndOfCentralDirectory(archive: Uint8Array) {
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65557); offset -= 1) {
    if (
      archive[offset] === 0x50
      && archive[offset + 1] === 0x4b
      && archive[offset + 2] === 0x05
      && archive[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

async function inflateRaw(bytes: Uint8Array) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Zip import needs DecompressionStream support in this browser.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const inflated = await new Response(stream).arrayBuffer();
  return new Uint8Array(inflated);
}

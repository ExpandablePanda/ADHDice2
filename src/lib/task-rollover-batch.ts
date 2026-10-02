/**
 * Keep the browser transport bound and the trusted Edge validation boundary
 * aligned. Each request still executes its children serially.
 */
export const TASK_ROLLOVER_SWEEP_BATCH_SIZE = 8;

export function chunkTaskRolloverCommands<T>(commands: readonly T[], batchSize = TASK_ROLLOVER_SWEEP_BATCH_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < commands.length; index += batchSize) {
    chunks.push(commands.slice(index, index + batchSize));
  }
  return chunks;
}

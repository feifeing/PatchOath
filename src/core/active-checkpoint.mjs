import { inspectStore, loadCheckpoint } from "./store.mjs";

export async function loadActiveCheckpointAnchor(root) {
  // Inspection stays read-only and uses the same physical store and safe-file
  // boundaries as other evidence reads.
  const inspected = await inspectStore(root);
  const checkpointId = inspected.state?.activeCheckpointId;
  if (!checkpointId) return null;
  const checkpoint = await loadCheckpoint(root, checkpointId);
  if (checkpoint.status !== "recording") {
    throw new Error(
      `Active checkpoint ${checkpointId} is not recording; repository-local state is inconsistent.`,
    );
  }

  return {
    checkpointId,
    repository: checkpoint.repository,
  };
}

/**
 * worker_threads entry for the normals pool (scripts/lib/normals-pool.ts).
 * Loaded via an eval bootstrap that registers tsx (see normals-pool.ts).
 */
import { parentPort } from "node:worker_threads";
import { computeCellNormals } from "./normals";

type Job = { id: number; lat: number; lon: number };

parentPort?.on("message", (job: Job) => {
  try {
    const result = computeCellNormals(job.lat, job.lon);
    parentPort?.postMessage({ id: job.id, ok: true, result });
  } catch (err) {
    parentPort?.postMessage({ id: job.id, ok: false, error: String(err) });
  }
});

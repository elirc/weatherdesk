import path from "node:path";
import { Worker } from "node:worker_threads";
import { computeCellNormals } from "./normals";

type Result = ReturnType<typeof computeCellNormals>;
type Reply = { id: number; ok: true; result: Result } | { id: number; ok: false; error: string };

/**
 * Small worker_threads pool for computeCellNormals (~0.3 s CPU per cell; 770
 * cells would take ~4 min on one thread). Each worker holds only the cell it
 * is computing, so memory stays bounded. Falls back to in-process
 * computation when workers cannot start (e.g. under a test runner).
 */
export class NormalsPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: { id: number; lat: number; lon: number; resolve: (r: Result) => void; reject: (e: Error) => void }[] = [];
  private pending = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void }>();
  private inline = false;

  constructor(root: string, size: number) {
    const file = path.join(root, "scripts", "lib", "normals-worker.ts");
    try {
      for (let i = 0; i < size; i++) {
        // .ts entry points are rejected by the worker loader, so bootstrap via eval:
        // register tsx (CJS hook, honours tsconfig paths) then require the file.
        const boot = `require("tsx/cjs/api").register(); require(${JSON.stringify(file)});`;
        const w = new Worker(boot, { eval: true });
        w.on("message", (msg: Reply) => this.onMessage(w, msg));
        w.on("error", (err) => this.onError(err));
        this.workers.push(w);
        this.idle.push(w);
      }
    } catch {
      this.inline = true;
    }
  }

  get threads(): number {
    return this.inline ? 0 : this.workers.length;
  }

  compute(id: number, lat: number, lon: number): Promise<Result> {
    if (this.inline) return Promise.resolve(computeCellNormals(lat, lon));
    return new Promise((resolve, reject) => {
      this.queue.push({ id, lat, lon, resolve, reject });
      this.pump();
    });
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.pending.set(job.id, { resolve: job.resolve, reject: job.reject });
      w.postMessage({ id: job.id, lat: job.lat, lon: job.lon });
    }
  }

  private onMessage(w: Worker, msg: Reply) {
    const p = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    this.idle.push(w);
    if (p) {
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    }
    this.pump();
  }

  private onError(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    for (const q of this.queue) q.reject(err);
    this.queue = [];
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idle = [];
  }
}

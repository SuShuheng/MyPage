import { createId } from "../core/ids";
import workerSource from "./worker-entry.ts?worker";
import type {
  WorkerRequest,
  WorkerResponse,
  WorkerTaskPayloads,
  WorkerTaskResults,
  WorkerTaskType,
} from "./task-types";

export interface WorkerTaskOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
}

interface QueuedTask<T extends WorkerTaskType = WorkerTaskType> {
  id: string;
  type: T;
  payload: WorkerTaskPayloads[T];
  options: WorkerTaskOptions;
  resolve: (value: WorkerTaskResults[T]) => void;
  reject: (reason: Error) => void;
}

export class WorkerCoordinator {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: QueuedTask[] = [];
  private readonly pending = new Map<
    string,
    { task: QueuedTask; slot: WorkerSlot; timeout?: number }
  >();
  private disposed = false;

  public constructor(count: number | "auto" = "auto") {
    if (typeof Worker === "undefined") return;
    const hardware = navigator.hardwareConcurrency || 2;
    const desired = count === "auto" ? Math.max(1, Math.min(4, hardware - 1)) : count;
    for (let index = 0; index < Math.max(1, desired); index += 1) {
      try {
        this.slots.push(this.createSlot());
      } catch (error) {
        console.error("[MyPage] Unable to create background worker", error);
        for (const slot of this.slots) slot.worker.terminate();
        this.slots.length = 0;
        break;
      }
    }
  }

  public run<T extends WorkerTaskType>(
    type: T,
    payload: WorkerTaskPayloads[T],
    options: WorkerTaskOptions = {},
  ): Promise<WorkerTaskResults[T]> {
    if (this.disposed) return Promise.reject(new Error("Worker coordinator is disposed."));
    if (options.signal?.aborted) {
      return Promise.reject(new DOMException("Task aborted.", "AbortError"));
    }
    if (this.slots.length === 0) {
      return Promise.reject(
        new Error(
          "后台 Worker 不可用；为避免阻塞 Obsidian 主线程，此检测任务已取消。",
        ),
      );
    }
    return new Promise<WorkerTaskResults[T]>((resolve, reject) => {
      const task: QueuedTask<T> = {
        id: createId("task"),
        type,
        payload,
        options,
        resolve,
        reject,
      };
      this.queue.push(task as unknown as QueuedTask);
      this.drain();
    });
  }

  public dispose(): void {
    this.disposed = true;
    for (const { task } of this.pending.values()) {
      task.reject(new Error("Worker coordinator was disposed."));
    }
    this.pending.clear();
    for (const task of this.queue.splice(0)) {
      task.reject(new Error("Worker coordinator was disposed."));
    }
    for (const slot of this.slots) slot.worker.terminate();
    this.slots.length = 0;
  }

  private createSlot(): WorkerSlot {
    const url = URL.createObjectURL(
      new Blob([workerSource], { type: "text/javascript" }),
    );
    const worker = new Worker(url, { name: "mypage-worker" });
    URL.revokeObjectURL(url);
    const slot: WorkerSlot = { worker, busy: false };
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      this.handleResponse(slot, event.data);
    });
    worker.addEventListener("error", (event) => {
      this.handleWorkerFailure(slot, new Error(event.message || "Worker crashed."));
    });
    return slot;
  }

  private drain(): void {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (slot.busy) continue;
      const task = this.queue.shift();
      if (!task) break;
      if (task.options.signal?.aborted) {
        task.reject(new DOMException("Task aborted.", "AbortError"));
        continue;
      }
      slot.busy = true;
      const timeoutMs = task.options.timeoutMs ?? 30_000;
      const timeout = window.setTimeout(() => {
        this.abortRunningTask(task.id, new Error(`Worker task timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.set(task.id, { task, slot, timeout });
      task.options.signal?.addEventListener(
        "abort",
        () => this.abortRunningTask(task.id, new DOMException("Task aborted.", "AbortError")),
        { once: true },
      );
      const request: WorkerRequest = {
        id: task.id,
        type: task.type,
        payload: task.payload,
      };
      slot.worker.postMessage(request);
    }
  }

  private handleResponse(slot: WorkerSlot, response: WorkerResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    if (pending.timeout !== undefined) window.clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    slot.busy = false;
    if (response.ok && response.result !== undefined) {
      pending.task.resolve(response.result);
    } else {
      pending.task.reject(new Error(response.error ?? "Worker task failed."));
    }
    this.drain();
  }

  private abortRunningTask(taskId: string, error: Error): void {
    const pending = this.pending.get(taskId);
    if (!pending) {
      const queueIndex = this.queue.findIndex((task) => task.id === taskId);
      if (queueIndex >= 0) {
        const [task] = this.queue.splice(queueIndex, 1);
        task?.reject(error);
      }
      return;
    }
    if (pending.timeout !== undefined) window.clearTimeout(pending.timeout);
    this.pending.delete(taskId);
    const slotIndex = this.slots.indexOf(pending.slot);
    pending.slot.worker.terminate();
    pending.task.reject(error);
    if (!this.disposed && slotIndex >= 0) {
      this.slots[slotIndex] = this.createSlot();
    }
    this.drain();
  }

  private handleWorkerFailure(slot: WorkerSlot, error: Error): void {
    const pending = [...this.pending.values()].find((item) => item.slot === slot);
    if (pending) this.abortRunningTask(pending.task.id, error);
  }
}

/// <reference lib="webworker" />

import { executeWorkerTask } from "./tasks";
import type {
  WorkerRequest,
  WorkerResponse,
  WorkerTaskType,
} from "./task-types";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void execute(request);
});

async function execute<T extends WorkerTaskType>(
  request: WorkerRequest<T>,
): Promise<void> {
  try {
    const result = await executeWorkerTask(request.type, request.payload);
    const response: WorkerResponse<T> = {
      id: request.id,
      type: request.type,
      ok: true,
      result,
    };
    scope.postMessage(response);
  } catch (error) {
    const response: WorkerResponse<T> = {
      id: request.id,
      type: request.type,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(response);
  }
}

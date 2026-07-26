export interface PerformanceSample {
  name: string;
  durationMs: number;
  recordedAt: number;
}

export class PerformanceMonitor {
  private readonly samples: PerformanceSample[] = [];
  private observer: PerformanceObserver | undefined;

  public start(): void {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 50) this.record(`long-task:${entry.name}`, entry.duration);
        }
      });
      this.observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // The WebView may not implement the longtask entry type.
    }
  }

  public measure<T>(name: string, operation: () => T): T {
    const started = performance.now();
    try {
      return operation();
    } finally {
      this.record(name, performance.now() - started);
    }
  }

  public async measureAsync<T>(
    name: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const started = performance.now();
    try {
      return await operation();
    } finally {
      this.record(name, performance.now() - started);
    }
  }

  public snapshot(): PerformanceSample[] {
    return structuredClone(this.samples);
  }

  public dispose(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.samples.length = 0;
  }

  private record(name: string, durationMs: number): void {
    this.samples.push({ name, durationMs, recordedAt: Date.now() });
    if (this.samples.length > 200) this.samples.splice(0, this.samples.length - 200);
  }
}

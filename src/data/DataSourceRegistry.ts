import type { DataSource } from "./data-types";

export class DataSourceRegistry {
  private readonly sources = new Map<string, DataSource>();

  public register(source: DataSource): () => void {
    if (this.sources.has(source.id)) {
      throw new Error(`Data source "${source.id}" is already registered.`);
    }
    this.sources.set(source.id, source);
    return () => {
      if (this.sources.get(source.id) === source) {
        this.sources.delete(source.id);
        void source.dispose();
      }
    };
  }

  public get(id: string): DataSource | undefined {
    return this.sources.get(id);
  }

  public list(): DataSource[] {
    return [...this.sources.values()];
  }

  public async dispose(): Promise<void> {
    const sources = this.list();
    this.sources.clear();
    await Promise.all(sources.map(async (source) => source.dispose()));
  }
}

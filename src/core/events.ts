export type Unsubscribe = () => void;

export class TypedEvent<T> {
  private readonly listeners = new Set<(event: T) => void>();

  public subscribe(listener: (event: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public emit(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

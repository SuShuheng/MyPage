export class UndoManager<T> {
  private past: T[] = [];
  private future: T[] = [];

  public constructor(
    private current: T,
    private readonly clone: (value: T) => T = structuredClone,
    private readonly limit = 50,
  ) {}

  public get value(): T {
    return this.clone(this.current);
  }

  public get canUndo(): boolean {
    return this.past.length > 0;
  }

  public get canRedo(): boolean {
    return this.future.length > 0;
  }

  public push(next: T): T {
    this.past.push(this.clone(this.current));
    if (this.past.length > this.limit) this.past.shift();
    this.current = this.clone(next);
    this.future = [];
    return this.value;
  }

  public undo(): T {
    const previous = this.past.pop();
    if (!previous) return this.value;
    this.future.push(this.clone(this.current));
    this.current = previous;
    return this.value;
  }

  public redo(): T {
    const next = this.future.pop();
    if (!next) return this.value;
    this.past.push(this.clone(this.current));
    this.current = next;
    return this.value;
  }
}

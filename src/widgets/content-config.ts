export interface DateRange {
  startDate: string;
  endDate: string;
}

export function createDateRange(days: number, now = new Date()): DateRange {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end),
  };
}

export function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function resolvePathTemplate(
  template: string,
  now = new Date(),
): string {
  const date = formatDateInput(now);
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("-");
  return template
    .replaceAll("{date}", date)
    .replaceAll("{Date}", date)
    .replaceAll("{time}", time)
    .replaceAll("{timestamp}", String(now.getTime()));
}

export function dateRangeTimestamps(
  startDate: unknown,
  endDate: unknown,
  fallbackDays = 365,
): { from: number; to: number; startDate: string; endDate: string } {
  const fallback = createDateRange(fallbackDays);
  const normalizedStart =
    typeof startDate === "string" && isDateInput(startDate)
      ? startDate
      : fallback.startDate;
  const normalizedEnd =
    typeof endDate === "string" && isDateInput(endDate)
      ? endDate
      : fallback.endDate;
  const ordered =
    normalizedStart <= normalizedEnd
      ? [normalizedStart, normalizedEnd]
      : [normalizedEnd, normalizedStart];
  return {
    from: new Date(`${ordered[0]}T00:00:00`).getTime(),
    to: new Date(`${ordered[1]}T23:59:59.999`).getTime(),
    startDate: ordered[0]!,
    endDate: ordered[1]!,
  };
}

function isDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value));
}

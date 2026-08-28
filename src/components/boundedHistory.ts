export function boundedHistoryWindow<T>(records: readonly T[], visibleCount: number): readonly T[] {
  return records.slice(0, Math.max(0, visibleCount))
}

export function nextHistoryWindowSize(current: number, total: number, pageSize: number): number {
  return Math.min(total, Math.max(0, current) + Math.max(1, pageSize))
}

/**
 * Standard competition ranking for a list already sorted best-first: equal values share a rank
 * and the next rank skips (10, 10, 7 → 1, 1, 3).
 */
export function sharedRanks<T>(rows: T[], value: (row: T) => number): number[] {
  const ranks: number[] = [];
  rows.forEach((row, index) => {
    ranks.push(index > 0 && value(row) === value(rows[index - 1]) ? ranks[index - 1] : index + 1);
  });
  return ranks;
}

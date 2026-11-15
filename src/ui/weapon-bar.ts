/**
 * Where a weapon bar of `slots` slots starts that shows `count` weapons and has to show the one `selected`: it
 * stays where it was (`first`) as long as that one is on it, and slides just far enough when it is not.
 */
export function barStart(first: number, selected: number, count: number, slots: number): number {
  const start = selected < first ? selected : selected >= first + slots ? selected - slots + 1 : first;
  return Math.max(0, Math.min(start, Math.max(0, count - slots)));
}

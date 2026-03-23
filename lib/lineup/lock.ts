export function isGameweekLocked(lockTime: Date | null): boolean {
  if (!lockTime) return false
  return new Date() >= lockTime
}

/**
 * Minimal className combiner. Joins truthy values with a space.
 * Keeps dependencies minimal (no clsx / tailwind-merge).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges class names, resolving conflicting Tailwind utilities in favor of
 * the later one (e.g. cn('p-2', condition && 'p-4') -> 'p-4' when true).
 * Standard shadcn/ui helper — every ui/ component uses this.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

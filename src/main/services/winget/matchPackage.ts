import type { WingetPackage } from '@shared/types'

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Picks the best candidate from a winget result list for a spoken app
 * name. Tries an exact name match first, then "starts with", then
 * "contains" — the same tiered approach used for launching apps — so a
 * request like "install vscode" reliably lands on "Visual Studio Code"
 * even though the wording doesn't match exactly. Falls back to the
 * first result if nothing matches closely, since winget's own search
 * ranking already put its best guess first.
 */
export function findBestMatch(
  query: string,
  candidates: WingetPackage[]
): WingetPackage | undefined {
  const target = normalize(query)
  if (!target || candidates.length === 0) return undefined

  const exact = candidates.find((c) => normalize(c.name) === target)
  if (exact) return exact

  const startsWith = candidates.find((c) => normalize(c.name).startsWith(target))
  if (startsWith) return startsWith

  const contains = candidates.find((c) => normalize(c.name).includes(target))
  if (contains) return contains

  return candidates[0]
}
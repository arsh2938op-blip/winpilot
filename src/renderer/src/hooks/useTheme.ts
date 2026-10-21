import { useEffect } from 'react'
import { useThemeStore } from '@renderer/store/useThemeStore'

/**
 * Keeps <html> in sync with both theme axes: the `.dark` class (light/
 * dark) and the `data-accent` attribute (colour theme). Every Tailwind
 * `dark:` utility and every CSS variable in globals.css keys off these.
 */
export function useTheme(): void {
  const mode = useThemeStore((s) => s.mode)
  const accent = useThemeStore((s) => s.accent)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = (): void => {
      const isDark = mode === 'dark' || (mode === 'system' && media.matches)
      root.classList.toggle('dark', isDark)
    }

    apply()
    if (mode === 'system') {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
    return undefined
  }, [mode])

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent)
  }, [accent])
}

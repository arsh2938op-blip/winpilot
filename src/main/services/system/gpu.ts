import { runCommand } from '../../utils/runCommand'

/**
 * GPU usage via Windows' built-in performance counters — same trick
 * Task Manager's GPU graph uses under the hood, works across NVIDIA/
 * AMD/Intel without any vendor-specific SDK. Sums the "3D engine"
 * counter instances (there can be several per GPU/process).
 */
export async function getGpuUsagePercent(): Promise<number> {
  const { stdout } = await runCommand('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage').CounterSamples | Measure-Object -Property CookedValue -Sum | Select-Object -ExpandProperty Sum"
  ])

  const value = parseFloat(stdout.trim())
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.round(value))
}

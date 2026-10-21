import os from 'os'

interface CpuSnapshot {
  idle: number
  total: number
}

function snapshotCpus(): CpuSnapshot {
  const cpus = os.cpus()
  let idle = 0
  let total = 0

  for (const cpu of cpus) {
    idle += cpu.times.idle
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq
  }

  return { idle, total }
}

/**
 * CPU usage isn't an instantaneous value — it's "how busy was the CPU
 * between two points in time." So we take one snapshot, wait a short
 * moment, take another, and compare the difference in idle vs. total
 * time. sampleMs controls how long we wait between the two snapshots;
 * 300ms is enough to be accurate without slowing the dashboard down.
 */
export async function getCpuUsagePercent(sampleMs = 300): Promise<number> {
  const start = snapshotCpus()
  await new Promise((resolve) => setTimeout(resolve, sampleMs))
  const end = snapshotCpus()

  const idleDelta = end.idle - start.idle
  const totalDelta = end.total - start.total

  if (totalDelta <= 0) return 0

  const usage = 1 - idleDelta / totalDelta
  return Math.round(usage * 100)
}
import os from 'os'
import type { SystemSnapshot } from '@shared/types'
import { getCpuUsagePercent } from './cpu'
import { getDiskUsage } from './disk'
import { getNetworkSpeed } from './network'
import { getGpuUsagePercent } from './gpu'

/**
 * Real system metrics for the Dashboard (Milestone 1: CPU, RAM, Disk,
 * Network, Uptime — no GPU/temperature/battery yet, no AI).
 *
 * CPU and network each take ~300ms-1s because they need two samples over
 * time to measure a rate (see cpu.ts / network.ts for why). Running them
 * together with Promise.all keeps the total wait to about 1 second
 * instead of stacking both delays.
 */
export async function getSnapshot(): Promise<SystemSnapshot> {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const ramPercent = Math.round(((totalMem - freeMem) / totalMem) * 100)

  const [cpuPercent, disk, network, gpuPercent] = await Promise.all([
    getCpuUsagePercent(),
    getDiskUsage().catch(() => ({ usedPercent: 0 })),
    getNetworkSpeed().catch(() => ({ downKbps: 0, upKbps: 0 })),
    getGpuUsagePercent().catch(() => 0)
  ])

  return {
    cpuPercent,
    ramPercent,
    diskPercent: disk.usedPercent,
    gpuPercent,
    networkDownKbps: network.downKbps,
    networkUpKbps: network.upKbps,
    uptimeSeconds: os.uptime()
  }
}

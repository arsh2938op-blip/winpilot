import { runCommand } from '../../utils/runCommand'

interface AdapterSample {
  received: number
  sent: number
}

async function sampleAdapters(): Promise<AdapterSample> {
  const { stdout } = await runCommand('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-NetAdapterStatistics | Select-Object ReceivedBytes,SentBytes | ConvertTo-Json -Compress'
  ])

  const parsed = JSON.parse(stdout.trim())
  const rows = Array.isArray(parsed) ? parsed : [parsed]

  return rows.reduce(
    (sum, row) => ({
      received: sum.received + (row.ReceivedBytes ?? 0),
      sent: sum.sent + (row.SentBytes ?? 0)
    }),
    { received: 0, sent: 0 }
  )
}

/**
 * Like CPU, network *speed* only means something as a rate over time —
 * "bytes so far" alone doesn't tell you anything. So we sample total
 * bytes transferred, wait a second, sample again, and turn the
 * difference into kilobits per second (Kbps).
 */
export async function getNetworkSpeed(
  sampleMs = 1000
): Promise<{ downKbps: number; upKbps: number }> {
  const start = await sampleAdapters()
  await new Promise((resolve) => setTimeout(resolve, sampleMs))
  const end = await sampleAdapters()

  const seconds = sampleMs / 1000
  const downBytesPerSec = Math.max(0, (end.received - start.received) / seconds)
  const upBytesPerSec = Math.max(0, (end.sent - start.sent) / seconds)

  return {
    downKbps: Math.round((downBytesPerSec * 8) / 1000),
    upKbps: Math.round((upBytesPerSec * 8) / 1000)
  }
}
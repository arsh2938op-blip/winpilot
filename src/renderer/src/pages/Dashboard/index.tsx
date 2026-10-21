import { useEffect, useState } from 'react'
import { Cpu, MemoryStick, HardDrive, Wifi, Clock, Gauge, AlertCircle } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { StatCard } from '@renderer/components/shared/StatCard'
import { Card, CardContent } from '@renderer/components/ui/card'
import { formatKbps, formatUptime } from '@renderer/lib/format'
import type { SystemSnapshot } from '@shared/types'

// How often we ask the main process for fresh numbers. Network/CPU each
// take about a second to measure (see src/main/services/system), so
// anything faster than this would just queue up requests pointlessly.
const POLL_INTERVAL_MS = 3000

export default function Dashboard(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Guard: window.api only exists inside the real Electron window.
    if (!window.api?.system) return

    let cancelled = false

    const poll = async (): Promise<void> => {
      try {
        const result = await window.api.system.getSnapshot()
        if (!cancelled) {
          setSnapshot(result)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to read system stats.')
        }
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="A live look at what your system is doing right now."
      />

      {error && (
        <Card className="mb-4 border-destructive/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard
          icon={Cpu}
          label="CPU"
          value={snapshot ? `${snapshot.cpuPercent}%` : '—'}
          percent={snapshot?.cpuPercent}
        />
        <StatCard
          icon={MemoryStick}
          label="Memory"
          value={snapshot ? `${snapshot.ramPercent}%` : '—'}
          percent={snapshot?.ramPercent}
        />
        <StatCard
          icon={HardDrive}
          label="Disk (system drive)"
          value={snapshot ? `${snapshot.diskPercent}%` : '—'}
          percent={snapshot?.diskPercent}
        />
        <StatCard
          icon={Wifi}
          label="Network"
          value={
            snapshot
              ? `↓ ${formatKbps(snapshot.networkDownKbps ?? 0)}`
              : '—'
          }
          hint={snapshot ? `↑ ${formatKbps(snapshot.networkUpKbps ?? 0)}` : undefined}
        />
        <StatCard
          icon={Clock}
          label="Uptime"
          value={snapshot ? formatUptime(snapshot.uptimeSeconds) : '—'}
        />
        <StatCard
          icon={Gauge}
          label="GPU"
          value={snapshot ? `${snapshot.gpuPercent ?? 0}%` : '—'}
          percent={snapshot?.gpuPercent}
        />
      </div>
    </div>
  )
}
import { runCommand } from '../../utils/runCommand'

interface DiskInfo {
  usedPercent: number
}

/**
 * Node has no built-in disk usage API, so we ask PowerShell (present on
 * every Windows machine) for the system drive's size and free space, as
 * JSON — much easier and safer to parse than plain text tables.
 */
export async function getDiskUsage(): Promise<DiskInfo> {
  const systemDrive = (process.env.SystemDrive || 'C:').replace(':', '')

  const { stdout } = await runCommand('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='${systemDrive}:'" | Select-Object Size,FreeSpace | ConvertTo-Json -Compress`
  ])

  const parsed = JSON.parse(stdout.trim()) as { Size: number; FreeSpace: number }
  const used = parsed.Size - parsed.FreeSpace
  const usedPercent = Math.round((used / parsed.Size) * 100)

  return { usedPercent }
}
import { Bluetooth, Wifi, Moon, Bell, Zap } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Switch } from '@renderer/components/ui/switch'
import { Separator } from '@renderer/components/ui/separator'

const CONTROLS = [
  { icon: Bluetooth, label: 'Bluetooth', description: 'Turn Bluetooth on or off' },
  { icon: Wifi, label: 'Wi-Fi', description: 'Turn Wi-Fi on or off' },
  { icon: Moon, label: 'Dark mode', description: 'Switch Windows between light and dark' },
  { icon: Bell, label: 'Notifications', description: 'Allow apps to send notifications' },
  { icon: Zap, label: 'Game Mode', description: 'Prioritize resources for games' }
]

/**
 * Windows Controls — direct toggles for common Windows settings.
 *
 * TODO: each Switch below should call window.api.windowsControls.toggle(id)
 * (channel + types already defined in shared/ipc-channels.ts and
 * shared/types.ts) and reflect real state from
 * window.api.windowsControls.getState(). Toggles are disabled here since
 * there's no real state to reflect yet.
 */
export default function WindowsControls(): React.JSX.Element {
  return (
    <div>
      <PageHeader
        title="Windows Controls"
        description="Common Windows settings, all in one place — no more digging through menus."
      />

      <Card>
        <CardContent className="p-0">
          {CONTROLS.map((control, index) => (
            <div key={control.label}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <control.icon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{control.label}</p>
                    <p className="text-xs text-muted-foreground">{control.description}</p>
                  </div>
                </div>
                <Switch disabled />
              </div>
              {index < CONTROLS.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

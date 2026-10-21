import { Link } from 'react-router-dom'
import { Puzzle, Monitor, Github, Gamepad2, Bot, Zap, ArrowRight } from 'lucide-react'
import { PageHeader } from '@renderer/components/shared/PageHeader'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'

interface PluginCard {
  name: string
  description: string
  icon: typeof Puzzle
  status: 'active' | 'not-connected'
  links?: { label: string; to: string }[]
}

const PLUGINS: PluginCard[] = [
  {
    name: 'Windows Control',
    description: 'Dashboard stats, Winget install/update/uninstall, system toggles, combos.',
    icon: Monitor,
    status: 'active',
    links: [
      { label: 'Dashboard', to: '/plugins/windows/dashboard' },
      { label: 'Winget', to: '/plugins/windows/winget' },
      { label: 'Windows Controls', to: '/plugins/windows/controls' },
      { label: 'Gaming Mode', to: '/plugins/windows/gaming' },
      { label: 'Combos', to: '/plugins/windows/combos' }
    ]
  },
  {
    name: 'Zapier',
    description: 'Trigger any Zapier-connected app (WhatsApp, Gmail, Discord, etc.) via chat.',
    icon: Zap,
    status: 'active',
    links: [{ label: 'Manage in Chat settings', to: '/' }]
  },
  { name: 'GitHub', description: 'Repository awareness and control.', icon: Github, status: 'not-connected', links: [{ label: 'Open', to: '/plugins/github' }] },
  {
    name: 'Minecraft',
    description: 'MindCraft/Mineflayer bot integration — dashboard embedded inside FlameAGI.',
    icon: Gamepad2,
    status: 'active',
    links: [{ label: 'MindCraft Dashboard', to: '/plugins/minecraft' }]
  },
  { name: 'Robot', description: 'Future physical Flame body.', icon: Bot, status: 'not-connected' }
]

export default function Plugins(): React.JSX.Element {
  return (
    <div>
      <PageHeader title="Plugins" description="Capabilities Flame can use." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PLUGINS.map((plugin) => (
          <Card key={plugin.name}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <plugin.icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{plugin.name}</p>
                    <Badge variant={plugin.status === 'active' ? 'success' : 'secondary'}>
                      {plugin.status === 'active' ? 'Active' : 'Not connected'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{plugin.description}</p>

                  {plugin.links && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {plugin.links.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs hover:bg-secondary/70"
                        >
                          {link.label} <ArrowRight className="h-3 w-3" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

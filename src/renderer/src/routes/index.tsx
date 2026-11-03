import type { ComponentType } from 'react'
import {
  MessageSquare,
  BrainCircuit,
  FolderKanban,
  Puzzle,
  Network,
  Github,
  Activity,
  Gamepad2,
  Crown,
  Settings as SettingsIcon
} from 'lucide-react'

import AIAssistant from '@renderer/pages/AIAssistant'
import Memory from '@renderer/pages/Memory'
import Projects from '@renderer/pages/Projects'
import Plugins from '@renderer/pages/Plugins'
import AiNetwork from '@renderer/pages/AiNetwork'
import GitHub from '@renderer/pages/GitHub'
import ActivityPage from '@renderer/pages/Activity'
import Settings from '@renderer/pages/Settings'

import WingetManager from '@renderer/pages/WingetManager'
import Combos from '@renderer/pages/Combos'
import Games from '@renderer/pages/Games'
import MinecraftDashboard from '@renderer/pages/MinecraftDashboard'
import ChessArena from '@renderer/pages/ChessArena'

export interface NavItem {
  path: string
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
  element: ComponentType
  status?: 'planned'
}

export const navItems: NavItem[] = [
  { path: '/', label: 'Chat', description: 'Talk to Flame', icon: MessageSquare, element: AIAssistant },
  { path: '/games', label: 'Games', description: 'Minecraft & Chess Arena', icon: Gamepad2, element: Games },
  { path: '/memory', label: 'Memory', description: "What Flame remembers", icon: BrainCircuit, element: Memory },
  { path: '/projects', label: 'Projects', description: 'Project awareness', icon: FolderKanban, element: Projects, status: 'planned' },
  { path: '/plugins', label: 'Plugins', description: 'Capabilities Flame can use', icon: Puzzle, element: Plugins },
  { path: '/ai-network', label: 'AI Network', description: 'Specialized model collaborators', icon: Network, element: AiNetwork },
  { path: '/activity', label: 'Activity', description: 'What Flame has done', icon: Activity, element: ActivityPage, status: 'planned' },
  { path: '/settings', label: 'Settings', description: 'Appearance & app info', icon: SettingsIcon, element: Settings }
]

export const pluginRoutes: NavItem[] = [
  { path: '/plugins/windows/winget', label: 'Winget', description: '', icon: MessageSquare, element: WingetManager },
  { path: '/plugins/windows/combos', label: 'Combos', description: '', icon: MessageSquare, element: Combos },
  { path: '/plugins/github', label: 'GitHub', description: '', icon: Github, element: GitHub },
  { path: '/plugins/minecraft', label: 'Minecraft', description: '', icon: Gamepad2, element: MinecraftDashboard },
  { path: '/plugins/chess', label: 'Chess Arena', description: '2-Player Human vs AI & AI vs AI Chess Director', icon: Crown, element: ChessArena }
]

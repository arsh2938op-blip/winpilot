import { Outlet, useLocation } from 'react-router-dom'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { TooltipProvider } from '@renderer/components/ui/tooltip'

export function AppShell(): React.JSX.Element {
  const isChatRoute = useLocation().pathname === '/'

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#12151a]/88 to-[#0b0d0f]/92 shadow-2xl">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            {isChatRoute ? (
              <Outlet />
            ) : (
              <div className="h-full overflow-y-auto">
                <div className="mx-auto max-w-6xl px-8 py-8">
                  <Outlet />
                </div>
              </div>
            )}
          </main>
        </div>
        <CommandPalette />
      </div>
    </TooltipProvider>
  )
}

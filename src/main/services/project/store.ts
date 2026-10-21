import { app, dialog } from 'electron'
import path from 'path'

export interface ProjectInfo {
  path: string | null
  name: string | null
}

let currentProject: ProjectInfo = {
  path: null,
  name: null
}

export async function getCurrentProject(): Promise<ProjectInfo> {
  return currentProject
}

export async function setCurrentProject(projectPath?: string | null): Promise<ProjectInfo> {
  if (!projectPath) {
    currentProject = { path: null, name: null }
    return currentProject
  }

  const resolved = path.resolve(projectPath)
  currentProject = {
    path: resolved,
    name: path.basename(resolved) || null
  }

  return currentProject
}

export async function pickProjectFolder(): Promise<{ path: string; name: string } | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose a project folder',
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const chosenPath = result.filePaths[0]
  const project = await setCurrentProject(chosenPath)

  if (!project.path || !project.name) {
    return null
  }

  return { path: project.path, name: project.name }
}

export async function openInVsCode(): Promise<{ success: boolean; message: string }> {
  const project = await getCurrentProject()

  if (!project.path) {
    return { success: false, message: 'No project has been selected yet.' }
  }

  try {
    const { spawn } = await import('child_process')
    const codeExecutable = process.platform === 'win32' ? 'code.cmd' : 'code'
    const child = spawn(codeExecutable, [project.path], {
      stdio: 'ignore',
      detached: process.platform !== 'win32',
      shell: process.platform === 'win32'
    })

    child.unref()
    return { success: true, message: `Opened ${project.name ?? project.path} in VS Code.` }
  } catch {
    return {
      success: false,
      message: 'VS Code command-line launcher is not available. Install the "code" command or add it to PATH.'
    }
  }
}

export function getDefaultProjectFolder(): string {
  return app.getPath('home')
}

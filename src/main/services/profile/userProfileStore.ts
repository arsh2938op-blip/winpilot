import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import type { UserProfile } from '@shared/types'

const DEFAULT_PROFILE: UserProfile = {
  nickname: 'Arsh',
  username: 'Arsh',
  preferred_ai_tone: 'witty'
}

function getProfilePath(): string {
  const root = fsSync.existsSync(path.join(process.cwd(), '.flame'))
    ? process.cwd()
    : fsSync.existsSync(path.resolve(process.cwd(), '..', '.flame'))
      ? path.resolve(process.cwd(), '..')
      : process.cwd()

  const stateDir = path.join(root, '.flame', 'state')
  if (!fsSync.existsSync(stateDir)) {
    try {
      fsSync.mkdirSync(stateDir, { recursive: true })
    } catch {
      // ignore
    }
  }
  return path.join(stateDir, 'user_profile.json')
}

let cachedProfile: UserProfile | null = null

export async function getUserProfile(): Promise<UserProfile> {
  if (cachedProfile) return { ...cachedProfile }

  const filePath = getProfilePath()
  try {
    if (fsSync.existsSync(filePath)) {
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<UserProfile>
      cachedProfile = {
        nickname: parsed.nickname?.trim() || DEFAULT_PROFILE.nickname,
        username: parsed.username?.trim() || DEFAULT_PROFILE.username,
        preferred_ai_tone: parsed.preferred_ai_tone || DEFAULT_PROFILE.preferred_ai_tone
      }
      return { ...cachedProfile }
    }
  } catch (err) {
    console.error('[UserProfileStore] Error reading user profile:', err)
  }

  cachedProfile = { ...DEFAULT_PROFILE }
  await saveUserProfile(cachedProfile)
  return { ...cachedProfile }
}

export async function updateUserProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  const current = await getUserProfile()
  const updated: UserProfile = {
    nickname: patch.nickname !== undefined ? patch.nickname.trim() || current.nickname : current.nickname,
    username: patch.username !== undefined ? patch.username.trim() || current.username : current.username,
    preferred_ai_tone: patch.preferred_ai_tone !== undefined ? patch.preferred_ai_tone : current.preferred_ai_tone
  }
  cachedProfile = updated
  await saveUserProfile(updated)
  return { ...updated }
}

async function saveUserProfile(profile: UserProfile): Promise<void> {
  const filePath = getProfilePath()
  try {
    await fs.writeFile(filePath, JSON.stringify(profile, null, 2), 'utf-8')
  } catch (err) {
    console.error('[UserProfileStore] Error saving user profile:', err)
  }
}


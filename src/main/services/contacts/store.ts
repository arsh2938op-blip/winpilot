import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { WhatsAppContact } from '@shared/types'

/**
 * A minimal local contacts store (name -> phone number) so requests like
 * "message mom on whatsapp" can resolve to a real number. Stored in the
 * app's own user data folder as plain JSON — not encrypted, fine for a
 * single-user local machine.
 */
function contactsPath(): string {
  return path.join(app.getPath('userData'), 'contacts.json')
}

export async function listContacts(): Promise<WhatsAppContact[]> {
  try {
    const raw = await fs.readFile(contactsPath(), 'utf8')
    return JSON.parse(raw) as WhatsAppContact[]
  } catch {
    return []
  }
}

async function saveContacts(contacts: WhatsAppContact[]): Promise<void> {
  await fs.writeFile(contactsPath(), JSON.stringify(contacts, null, 2), 'utf8')
}

export async function addContact(name: string, phoneNumber: string): Promise<WhatsAppContact[]> {
  const contacts = await listContacts()
  const normalizedName = name.trim().toLowerCase()
  const next = contacts.filter((c) => c.name !== normalizedName)
  next.push({ name: normalizedName, phoneNumber: phoneNumber.trim() })
  await saveContacts(next)
  return next
}

export async function removeContact(name: string): Promise<WhatsAppContact[]> {
  const contacts = await listContacts()
  const next = contacts.filter((c) => c.name !== name.trim().toLowerCase())
  await saveContacts(next)
  return next
}

/** Loose matching so "mom" matches a stored "mom" and vice versa with
 * minor variation, without needing an exact string match every time. */
export async function findContact(name: string): Promise<WhatsAppContact | undefined> {
  const contacts = await listContacts()
  const target = name.trim().toLowerCase()
  return contacts.find((c) => c.name === target || c.name.includes(target) || target.includes(c.name))
}
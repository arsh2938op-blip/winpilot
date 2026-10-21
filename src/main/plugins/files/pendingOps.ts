const pending = new Map<string, () => Promise<{ success: boolean; message: string }>>()

export function stageOperation(execute: () => Promise<{ success: boolean; message: string }>): string {
  const id = crypto.randomUUID()
  pending.set(id, execute)
  return id
}

export async function runStagedOperation(id: string): Promise<{ success: boolean; message: string }> {
  const operation = pending.get(id)
  pending.delete(id)
  if (!operation) return { success: false, message: 'This operation has expired.' }
  return operation()
}

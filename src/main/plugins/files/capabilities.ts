import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { getCapability, registerCapability } from '../../flameCore/capabilities'
import { emitAgentActivity } from '../../utils/broadcast'
import { stageOperation } from './pendingOps'

const MAX_LIST_ENTRIES = 200
const MAX_READ_BYTES = 50_000
const TEXT_EXTENSIONS = new Set(['.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.md', '.txt', '.yml', '.yaml', '.env', '.html', '.css'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const MAX_AUTO_VISION_IMAGES = 3

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function validateZipEntries(zip: AdmZip, destination: string): void {
  for (const entry of zip.getEntries()) {
    const target = path.resolve(destination, entry.entryName)
    if (!isWithin(destination, target)) throw new Error(`Archive contains an unsafe path: ${entry.entryName}`)
    const unixMode = (entry.header.attr >>> 16) & 0o170000
    if (unixMode === 0o120000) throw new Error(`Archive contains an unsupported symbolic link: ${entry.entryName}`)
  }
}

export function registerFileCapabilities(): void {
  registerCapability({
    id: 'files.listDirectory',
    label: 'List a directory',
    description: 'Lists files and folders at a given path (non-recursive, capped).',
    run: async (args) => {
      const dir = args.path as string | undefined
      const requestId = args.requestId as string | undefined
      if (!dir) return { success: false, message: 'Which folder?' }
      emitAgentActivity(requestId, `[File] Listing: ${dir}`)
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        const listing = entries.slice(0, MAX_LIST_ENTRIES).map((entry) => `${entry.isDirectory() ? '[dir]' : '[file]'} ${entry.name}`)
        return { success: true, message: listing.join('\n') || '(empty folder)' }
      } catch (err) {
        return { success: false, message: `Couldn't list "${dir}": ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'files.readText',
    label: 'Read a text file',
    description: 'Reads the content of a text/code file (capped at 50KB).',
    run: async (args) => {
      const filePath = args.path as string | undefined
      const requestId = args.requestId as string | undefined
      if (!filePath) return { success: false, message: 'Which file?' }
      const extension = path.extname(filePath).toLowerCase()
      if (!TEXT_EXTENSIONS.has(extension)) {
        return { success: false, message: `"${extension || 'this file type'}" isn't a supported text format for inline reading.` }
      }
      emitAgentActivity(requestId, `[File] Reading: ${path.basename(filePath)}`)
      try {
        const stat = await fs.stat(filePath)
        const buffer = Buffer.alloc(Math.min(stat.size, MAX_READ_BYTES))
        const file = await fs.open(filePath, 'r')
        try {
          await file.read(buffer, 0, buffer.length, 0)
        } finally {
          await file.close()
        }
        const truncated = stat.size > MAX_READ_BYTES ? '\n\n...(truncated)' : ''
        return { success: true, message: buffer.toString('utf8') + truncated }
      } catch (err) {
        return { success: false, message: `Couldn't read "${filePath}": ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'files.inspectZip',
    label: 'Inspect a ZIP archive',
    description: 'Lists a ZIP file contents without extracting it.',
    run: async (args) => {
      const zipPath = args.path as string | undefined
      const requestId = args.requestId as string | undefined
      if (!zipPath) return { success: false, message: 'Which ZIP file?' }
      emitAgentActivity(requestId, `[File] Inspecting archive: ${path.basename(zipPath)}`)
      try {
        const entries = new AdmZip(zipPath).getEntries().slice(0, MAX_LIST_ENTRIES).map((entry) => entry.entryName)
        return { success: true, message: entries.join('\n') || '(empty archive)' }
      } catch (err) {
        return { success: false, message: `Couldn't read ZIP: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })

  registerCapability({
    id: 'files.extractZip',
    label: 'Extract a ZIP archive',
    description: 'Stages ZIP extraction for explicit user confirmation.',
    run: async (args) => {
      const zipPath = args.path as string | undefined
      const destDir = (args.destDir as string | undefined) || (zipPath ? zipPath.replace(/\.zip$/i, '') : undefined)
      if (!zipPath || !destDir) return { success: false, message: 'Which ZIP, and where to extract it?' }
      const archivePath = zipPath
      const destination = destDir

      const operationId = stageOperation(async () => {
        try {
          const zip = new AdmZip(archivePath)
          validateZipEntries(zip, destination)
          await fs.mkdir(destination, { recursive: true })
          zip.extractAllTo(destination, true)
          return { success: true, message: `Extracted to ${destination}` }
        } catch (err) {
          return { success: false, message: `Extraction failed: ${err instanceof Error ? err.message : String(err)}` }
        }
      })
      return {
        success: true,
        message: `__PENDING_FILE_OP__${JSON.stringify({ operationId, label: `Extract ${path.basename(archivePath)} to ${destination}` })}`
      }
    }
  })

  registerCapability({
    id: 'files.searchInFiles',
    label: 'Search files for a string',
    description: 'Searches supported text files under a folder with recursion and result limits.',
    run: async (args) => {
      const dir = args.path as string | undefined
      const query = args.query as string | undefined
      const requestId = args.requestId as string | undefined
      if (!dir || !query) return { success: false, message: 'Need both a folder and a search term.' }
      const searchTerm = query
      emitAgentActivity(requestId, `[File] Searching for "${searchTerm}" in ${dir}`)
      const results: string[] = []
      async function walk(current: string, depth: number): Promise<void> {
        if (depth > 4 || results.length >= 30) return
        let entries
        try {
          entries = await fs.readdir(current, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          if (results.length >= 30) return
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
          const fullPath = path.join(current, entry.name)
          if (entry.isDirectory()) await walk(fullPath, depth + 1)
          else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            try {
              const stat = await fs.stat(fullPath)
              if (stat.size > MAX_READ_BYTES) continue
              if ((await fs.readFile(fullPath, 'utf8')).includes(searchTerm)) results.push(fullPath)
            } catch {
              // Skip unreadable files.
            }
          }
        }
      }
      await walk(dir, 0)
      return { success: true, message: results.length ? results.join('\n') : `No matches for "${searchTerm}".` }
    }
  })

  registerCapability({
    id: 'vision.inspectImage',
    label: 'Inspect an image',
    description: 'Uses the configured Gemini vision model to answer a question about an image.',
    run: async (args) => {
      const imagePath = args.path as string | undefined
      const question = (args.question as string | undefined) || 'Describe this image.'
      const requestId = args.requestId as string | undefined
      if (!imagePath) return { success: false, message: 'Which image?' }
      try {
        const { inspectImage } = await import('../../services/ai/geminiVision')
        return { success: true, message: await inspectImage(imagePath, question, requestId) }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  })

  registerCapability({
    id: 'vision.inspectFolder',
    label: 'Inspect visual assets in a folder',
    description: 'Finds image files in a folder and analyzes the most relevant ones with the vision model.',
    run: async (args) => {
      const dir = args.path as string | undefined
      const question = (args.question as string | undefined) || 'Describe what is shown.'
      const requestId = args.requestId as string | undefined
      if (!dir) return { success: false, message: 'Which folder?' }
      emitAgentActivity(requestId, `[Vision] Scanning ${dir} for images`)
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch (err) {
        return { success: false, message: `Couldn't read "${dir}": ${err instanceof Error ? err.message : String(err)}` }
      }
      const images = entries
        .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .slice(0, MAX_AUTO_VISION_IMAGES)
      if (images.length === 0) return { success: true, message: 'No image files found in this folder.' }

      const { inspectImage } = await import('../../services/ai/geminiVision')
      const results: string[] = []
      for (const img of images) {
        emitAgentActivity(requestId, `[Vision] Analyzing ${img.name}`)
        try {
          results.push(`${img.name}:\n${await inspectImage(path.join(dir, img.name), question, requestId)}`)
        } catch (err) {
          results.push(`${img.name}: failed (${err instanceof Error ? err.message : String(err)})`)
        }
      }
      return { success: true, message: results.join('\n\n') }
    }
  })

  registerCapability({
    id: 'vision.inspectZip',
    label: 'Inspect visual assets inside a ZIP',
    description: 'Extracts a ZIP to a temp folder and analyzes image files inside with the vision model.',
    run: async (args) => {
      const zipPath = args.path as string | undefined
      const question = args.question as string | undefined
      const requestId = args.requestId as string | undefined
      if (!zipPath) return { success: false, message: 'Which ZIP?' }
      emitAgentActivity(requestId, `[Vision] Extracting ${path.basename(zipPath)}`)
      const tmpDir = path.join(os.tmpdir(), `flame-vision-${Date.now()}`)
      try {
        new AdmZip(zipPath).extractAllTo(tmpDir, true)
      } catch (err) {
        return { success: false, message: `Couldn't extract ZIP: ${err instanceof Error ? err.message : String(err)}` }
      }
      const folderCap = getCapability('vision.inspectFolder')
      if (!folderCap) return { success: false, message: 'Vision inspection not available.' }
      return folderCap.run({ path: tmpDir, question, requestId })
    }
  })

  registerCapability({
    id: 'files.readPdfText',
    label: 'Read PDF text',
    description: 'Extracts text from a PDF. Text only — page-image rendering is not implemented (see note).',
    run: async (args) => {
      const filePath = args.path as string | undefined
      const requestId = args.requestId as string | undefined
      if (!filePath) return { success: false, message: 'Which PDF?' }
      emitAgentActivity(requestId, `[File] Reading PDF text: ${path.basename(filePath)}`)
      try {
        // pdf-parse v2 exports a `PDFParse` class (not a callable): it is
        // constructed with the document bytes and then asked for its text.
        const { PDFParse } = await import('pdf-parse')
        const data = new Uint8Array(await fs.readFile(filePath))
        const parser = new PDFParse({ data })
        try {
          const result = await parser.getText()
          return { success: true, message: result.text.slice(0, 50_000) || '(no extractable text — this PDF may be scanned/image-only, which this version cannot read)' }
        } finally {
          await parser.destroy()
        }
      } catch (err) {
        return { success: false, message: `Couldn't read PDF: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
  })
}

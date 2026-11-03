import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  FolderOpen,
  ExternalLink,
  FileImage
} from 'lucide-react'

export interface LightboxImage {
  src: string
  caption?: string
  filePath?: string
  fileName?: string
}

interface ImageLightboxProps {
  isOpen: boolean
  onClose: () => void
  image: LightboxImage | null
}

export function ImageLightbox({
  isOpen,
  onClose,
  image
}: ImageLightboxProps): React.JSX.Element | null {
  const [scale, setScale] = useState(1)

  // Reset zoom whenever image opens
  useEffect(() => {
    if (isOpen) {
      setScale(1)
    }
  }, [isOpen, image])

  // Keyboard navigation & zoom
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === '=' || e.key === '+') {
        setScale((s) => Math.min(s + 0.25, 3))
      } else if (e.key === '-') {
        setScale((s) => Math.max(s - 0.25, 0.5))
      } else if (e.key === '0') {
        setScale(1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleDownload = useCallback(() => {
    if (!image) return
    const a = document.createElement('a')
    a.href = image.src
    const defaultName = image.fileName || `flame-capture-${Date.now()}.jpg`
    a.download = defaultName
    a.click()
  }, [image])

  const handleOpenFile = useCallback(async () => {
    if (!image?.filePath || !window.api?.app?.openPath) return
    try {
      await window.api.app.openPath(image.filePath)
    } catch (err) {
      console.error('[ImageLightbox] Error opening file:', err)
    }
  }, [image])

  const handleShowInFolder = useCallback(async () => {
    if (!image?.filePath || !window.api?.app?.showItemInFolder) return
    try {
      await window.api.app.showItemInFolder(image.filePath)
    } catch (err) {
      console.error('[ImageLightbox] Error showing item in folder:', err)
    }
  }, [image])

  if (!isOpen || !image) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        {/* Floating Controls Bar */}
        <div
          className="absolute top-4 inset-x-4 sm:inset-x-8 z-20 flex items-center justify-between"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-black/70 backdrop-blur-md px-3 py-1.5 text-xs text-foreground shadow-lg">
            <FileImage className="h-4 w-4 text-amber-400" />
            <span className="font-medium truncate max-w-[200px] sm:max-w-xs">
              {image.caption || image.fileName || 'Image Preview'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-black/70 backdrop-blur-md p-1 shadow-lg">
            {/* Zoom Out */}
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
              title="Zoom Out (-)"
            >
              <ZoomOut className="h-4 w-4" />
            </button>

            {/* Reset Zoom */}
            <button
              type="button"
              onClick={() => setScale(1)}
              className="rounded-full px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
              title="Reset Zoom (0)"
            >
              {Math.round(scale * 100)}%
            </button>

            {/* Zoom In */}
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(s + 0.25, 3))}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
              title="Zoom In (+)"
            >
              <ZoomIn className="h-4 w-4" />
            </button>

            <span className="h-4 w-px bg-border/60 mx-0.5" />

            {/* Download */}
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-foreground bg-primary/20 hover:bg-primary/30 border border-primary/40 transition-colors"
              title="Save Image to Disk"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Save</span>
            </button>

            {/* Open File / Show in Folder (if filePath exists) */}
            {image.filePath && (
              <>
                <button
                  type="button"
                  onClick={handleOpenFile}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-foreground bg-muted/60 hover:bg-muted border border-border/60 transition-colors"
                  title="Open in Default Windows App"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Open File</span>
                </button>
                <button
                  type="button"
                  onClick={handleShowInFolder}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                  title="Show Item in Windows Explorer"
                >
                  <FolderOpen className="h-4 w-4" />
                </button>
              </>
            )}

            <span className="h-4 w-px bg-border/60 mx-0.5" />

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-red-500/20 hover:text-red-400 transition-colors"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Main Image Container */}
        <motion.div
          className="relative max-h-[85vh] max-w-[90vw] overflow-auto rounded-2xl border border-amber-500/30 bg-black/60 shadow-2xl p-2 flex items-center justify-center cursor-default"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={image.src}
            alt={image.caption || 'Captured asset'}
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
            className="max-h-[78vh] max-w-full object-contain rounded-xl transition-transform duration-150 select-none"
            draggable={false}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}


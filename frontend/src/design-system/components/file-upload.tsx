import * as React from "react"
import { AlertCircle, File, Trash2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { Label } from "@/design-system/components/label"
import { Button } from "@/design-system/components/button"

export interface FileUploadProps {
  label?: React.ReactNode
  htmlFor?: string
  /** Comma-separated MIME types and/or extensions, e.g. "image/png,image/jpeg,.pdf". */
  accept?: string
  multiple?: boolean
  maxSizeMB?: number
  value?: File | File[] | null
  onChange?: (files: File | File[] | null) => void
  error?: React.ReactNode
  hint?: React.ReactNode
  required?: boolean
  disabled?: boolean
  /** 0–100. When provided, renders an in-flight progress bar (parent-driven). */
  progress?: number | null
  uploadingLabel?: string
  dropText?: string
  className?: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Drag-and-drop file input (Part 3D). Click to browse or drop files onto the
 * zone; validates type and size, shows image thumbnails via object URLs, and
 * lets users remove or replace selections. Upload progress is driven by the
 * parent through `progress` so this stays a pure input.
 */
export function FileUpload({
  label,
  htmlFor,
  accept,
  multiple = false,
  maxSizeMB = 10,
  value,
  onChange,
  error,
  hint,
  required = false,
  disabled = false,
  progress,
  uploadingLabel = "Uploading…",
  dropText,
  className,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [internalError, setInternalError] = React.useState<string | null>(null)
  const previewUrls = React.useRef<Map<File, string>>(new Map())

  const files: File[] = React.useMemo(() => {
    if (value == null) return []
    return Array.isArray(value) ? value : [value]
  }, [value])

  React.useEffect(() => {
    const urls = previewUrls.current
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  function validateFile(file: File): string | undefined {
    if (maxSizeMB > 0 && file.size > maxSizeMB * 1024 * 1024) {
      return `"${file.name}" is larger than ${maxSizeMB} MB`
    }
    if (accept) {
      const allowed = accept.split(",").map((s) => s.trim().toLowerCase())
      const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
      const matches = allowed.some((a) => {
        if (a.startsWith(".")) return ext === a.slice(1)
        if (a.endsWith("/*")) return file.type.startsWith(a.slice(0, -1))
        return file.type.toLowerCase() === a
      })
      if (!matches) return `"${file.name}" is not an accepted file type`
    }
    return undefined
  }

  function acceptFiles(incoming: FileList | File[]) {
    const next: File[] = []
    let firstError: string | null = null
    for (const file of Array.from(incoming)) {
      const err = validateFile(file)
      if (err) {
        firstError ??= err
        continue
      }
      next.push(file)
    }
    setInternalError(firstError)
    if (next.length > 0) onChange?.(multiple ? [...files, ...next] : next[0])
  }

  function removeFile(index: number) {
    if (multiple) {
      const next = files.filter((_, i) => i !== index)
      onChange?.(next.length > 0 ? next : null)
    } else {
      onChange?.(null)
    }
  }

  function previewUrl(file: File): string | null {
    if (!file.type.startsWith("image/")) return null
    const cached = previewUrls.current.get(file)
    if (cached) return cached
    const url = URL.createObjectURL(file)
    previewUrls.current.set(file, url)
    return url
  }

  const showError = error ?? internalError

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="ml-0.5 text-[var(--ds-danger)]" aria-hidden="true">
              *
            </span>
          )}
        </Label>
      )}

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-invalid={Boolean(showError)}
        aria-describedby={htmlFor ? `${htmlFor}-help` : undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          if (disabled) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled) return
          e.preventDefault()
          setDragging(false)
          acceptFiles(e.dataTransfer.files)
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--ds-radius-xl)] border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-[var(--ds-primary)] bg-[var(--ds-primary-subtle)]"
            : showError
              ? "border-[var(--ds-danger)]/50 bg-[var(--ds-danger-subtle)]"
              : "border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] hover:border-[var(--ds-primary)]/50 hover:bg-[var(--ds-surface-hover)]",
          disabled && "pointer-events-none opacity-50",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/20",
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]">
          <Upload className="h-4 w-4" />
        </span>
        <span className="ds-body-sm text-[var(--ds-text-secondary)]">
          {dropText ?? "Drag & drop files here, or click to browse"}
        </span>
        {accept && <span className="ds-caption text-[var(--ds-text-tertiary)]">Accepted: {accept}</span>}
        <input
          ref={inputRef}
          id={htmlFor}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) acceptFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((file, index) => {
            const url = previewUrl(file)
            return (
              <li
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="flex items-center gap-3 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2"
              >
                {url ? (
                  <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-[var(--ds-radius-md)] object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ds-radius-md)] bg-[var(--ds-surface-secondary)] text-[var(--ds-text-tertiary)]">
                    <File className="h-5 w-5" />
                  </span>
                )}
                <div className="ds-min-w-0 flex-1">
                  <p className="ds-body-sm truncate font-medium text-[var(--ds-text)]">{file.name}</p>
                  <p className="ds-caption text-[var(--ds-text-tertiary)]">{formatSize(file.size)}</p>
                  {typeof progress === "number" && index === files.length - 1 && (
                    <div
                      className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--ds-border)]"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={uploadingLabel}
                    >
                      <div
                        className="h-full rounded-full bg-[var(--ds-primary)] transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      />
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeFile(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <div aria-live="polite">
        {showError ? (
          <p className="ds-error-text flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="ds-break-anywhere">{showError}</span>
          </p>
        ) : hint ? (
          <p id={htmlFor ? `${htmlFor}-help` : undefined} className="ds-helper-text">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}
FileUpload.displayName = "FileUpload"

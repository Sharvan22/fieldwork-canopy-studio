import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current!
    d.showModal()
    return () => d.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2 id="dialog-title">{title}</h2>
          <button className="icon-btn" aria-label="Close dialog" autoFocus onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

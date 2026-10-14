import { X } from 'lucide-react';
import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useLayoutEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const body = document.body;
    const root = document.documentElement;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const previousRootOverflow = root.style.overflow;

    // Android browsers can resolve a fixed child against the document after
    // `overflow: hidden` is applied to a scrolled body. Freeze the body at its
    // current coordinates so the portal remains tied to the visible viewport
    // and restore the exact board position when the dialog closes.
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';

    return () => {
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      body.style.overflow = previousBodyStyles.overflow;
      root.style.overflow = previousRootOverflow;
      window.scrollTo(scrollX, scrollY);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  };

  const modal = (
    <div className="vejoy-modal-viewport">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`vejoy-modal-dialog ${sizeClasses[size]} rounded-xl bg-white shadow-xl`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-slate-200 bg-white px-5 py-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );

  // Render outside page-level scroll containers. This prevents wide tables or
  // horizontal overflow on mobile from shifting a fixed dialog off-screen.
  return typeof document === 'undefined' ? null : createPortal(modal, document.body);
}

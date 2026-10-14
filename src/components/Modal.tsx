import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  };

  const modal = (
    <div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen items-center justify-center overflow-y-auto overflow-x-hidden p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full max-w-[calc(100vw-2rem)] ${sizeClasses[size]} max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden rounded-xl bg-white shadow-xl`}
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

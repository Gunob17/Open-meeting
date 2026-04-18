import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmModalProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const resolvedTitle = title ?? t('confirmModal.defaultTitle');
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm');

  // Focus confirm button on open
  useEffect(() => {
    confirmBtnRef.current?.focus();
  }, []);

  // Esc to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="modal-overlay confirm-modal-overlay" onClick={onCancel}>
      <div
        className="modal confirm-modal"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div className="modal-header">
          <h2 id="confirm-title">{resolvedTitle}</h2>
          <button className="modal-close" onClick={onCancel} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-body">
          <p id="confirm-message">{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            ref={confirmBtnRef}
            className={`btn btn-${variant}`}
            onClick={onConfirm}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

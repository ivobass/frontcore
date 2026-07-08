'use client';

import { useCallback, useRef, useState } from 'react';

export interface Feedback {
  type: 'success' | 'error';
  message: string;
}

export interface UseFeedbackResult {
  feedback: Feedback | null;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
  dismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

/**
 * Substitui um Toast — não existe nenhum componente de Toast no Design
 * System — por uma mensagem transitória renderizada com `Alert`
 * (`components/feedback-banner.tsx`), sem introduzir um componente novo em
 * `packages/ui`.
 */
export function useFeedback(): UseFeedbackResult {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    setFeedback(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const notify = useCallback((type: Feedback['type'], message: string) => {
    setFeedback({ type, message });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setFeedback(null), AUTO_DISMISS_MS);
  }, []);

  const notifySuccess = useCallback(
    (message: string) => notify('success', message),
    [notify],
  );
  const notifyError = useCallback(
    (message: string) => notify('error', message),
    [notify],
  );

  return { feedback, notifySuccess, notifyError, dismiss };
}

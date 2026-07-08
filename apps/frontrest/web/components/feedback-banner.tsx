import { Alert, AlertDescription } from '@frontcore/ui';
import type { Feedback } from '../lib/use-feedback';

/** Renderiza o estado de `useFeedback` como um `Alert` (ver esse ficheiro). */
export function FeedbackBanner({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <Alert variant={feedback.type === 'success' ? 'success' : 'destructive'}>
      <AlertDescription>{feedback.message}</AlertDescription>
    </Alert>
  );
}

/**
 * @frontcore/monitoring
 * Helpers genéricos de health/observabilidade reutilizáveis por qualquer app.
 */
import type {
  LivenessResult,
  ReadinessResult,
} from '@frontcore/shared';

/** Constrói uma resposta de liveness padrão. */
export function buildLiveness(service: string): LivenessResult {
  return {
    status: 'ok',
    service,
    timestamp: new Date().toISOString(),
  };
}

/** Constrói uma resposta de readiness a partir de um mapa de verificações. */
export function buildReadiness(
  checks: Record<string, 'up' | 'down'>,
): ReadinessResult {
  const allUp = Object.values(checks).every((c) => c === 'up');
  return {
    status: allUp ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  };
}

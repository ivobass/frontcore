/** Estados de saúde genéricos partilhados entre serviços. */
export type HealthState = 'ok' | 'degraded' | 'down';

export interface LivenessResult {
  status: 'ok';
  service: string;
  timestamp: string;
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  checks: Record<string, 'up' | 'down'>;
  timestamp: string;
}

/**
 * Variáveis de ambiente mínimas para os testes e2e arrancarem o `AppModule`
 * real (via `ConfigModule`/`@frontcore/config`) sem depender de um `.env`
 * local — importante para correr em CI, onde não existe `.env` commitado.
 */
process.env.JWT_ACCESS_SECRET ??= 'test-jwt-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.JWT_ACCESS_TTL ??= '900';
process.env.JWT_REFRESH_TTL ??= '1209600';
// Explícito (mesmo já sendo a omissão de `loadAiConfig()`) — testes e2e
// nunca devem chamar um provider de IA real.
process.env.AI_PROVIDER ??= 'mock';

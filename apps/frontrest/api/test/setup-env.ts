/**
 * Variáveis de ambiente mínimas para os testes e2e arrancarem o `AppModule`
 * real (via `ConfigModule`/`@frontcore/config`) sem depender de um `.env`
 * local — importante para correr em CI, onde não existe `.env` commitado.
 */
process.env.JWT_ACCESS_SECRET ??= 'test-jwt-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.JWT_ACCESS_TTL ??= '900';
process.env.JWT_REFRESH_TTL ??= '1209600';

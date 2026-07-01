/** Base URL da API, injetada em build time pelo Next. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

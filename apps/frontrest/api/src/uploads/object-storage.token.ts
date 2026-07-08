/**
 * Token de injeção NestJS para `ObjectStorage` — o resto da API nunca
 * conhece `S3ObjectStorage` diretamente, só este token e o tipo.
 */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

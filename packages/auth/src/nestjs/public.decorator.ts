import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'frontcore:isPublic';

/** Marca uma rota como pública, ignorada pelo JwtAuthGuard global. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

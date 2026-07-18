import { Injectable } from '@nestjs/common';
import { MAX_PAGE_SIZE } from '@frontcore/shared';
import { SuppliersService } from '../../suppliers/suppliers.service';
import { ExpenseCategoriesService } from '../../expense-categories/expense-categories.service';

export type EntityMentionResolution =
  | { kind: 'NONE' }
  | { kind: 'RESOLVED'; id: string; name: string }
  | { kind: 'AMBIGUOUS' };

interface NamedEntity {
  id: string;
  name: string;
}

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolução segura de menções a fornecedores/categorias nomeados na
 * mensagem do utilizador (Fase 8.4) — nunca o LLM, mesma disciplina
 * determinística de `financial-intent.resolver.ts`. Reutiliza
 * `SuppliersService`/`ExpenseCategoriesService` (já exportados pelos
 * respetivos módulos) em vez de duplicar queries Prisma — nunca uma
 * segunda fonte de verdade para nomes de fornecedor/categoria.
 *
 * Correspondência por fronteira de palavra (case/acento-insensível)
 * sobre o nome real de cada entidade da organização — nunca uma
 * pesquisa fuzzy/aproximada, que arriscaria resolver para a entidade
 * errada. Quando mais do que uma entidade distinta corresponde (nunca
 * quando uma é só um nome mais curto contido no mais longo, ex.
 * "Hetzner" dentro de "Hetzner Cloud"), o resultado é `AMBIGUOUS` —
 * nunca escolhe arbitrariamente a primeira.
 *
 * **Limitação conhecida**: fornecedores usa `SuppliersService.findAll()`
 * com o limite máximo de paginação (`MAX_PAGE_SIZE`, 100) — uma
 * organização com mais de 100 fornecedores pode ter menções a
 * fornecedores fora dessa janela nunca resolvidas (tratadas como
 * `NONE`, nunca incorretamente). Categorias não têm este limite
 * (`ExpenseCategoriesService.findAll()` devolve sempre todas).
 */
@Injectable()
export class FinancialEntityResolverService {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly expenseCategoriesService: ExpenseCategoriesService,
  ) {}

  async resolveSupplierMention(organizationId: string, message: string): Promise<EntityMentionResolution> {
    const { items } = await this.suppliersService.findAll(organizationId, { pageSize: MAX_PAGE_SIZE });
    return this.matchEntities(message, items);
  }

  async resolveCategoryMention(organizationId: string, message: string): Promise<EntityMentionResolution> {
    const items = await this.expenseCategoriesService.findAll(organizationId);
    return this.matchEntities(message, items);
  }

  private matchEntities(message: string, entities: NamedEntity[]): EntityMentionResolution {
    const normalizedMessage = normalize(message);
    const matches = entities.filter((entity) => {
      const normalizedName = normalize(entity.name).trim();
      if (normalizedName.length === 0) return false;
      return new RegExp(`\\b${escapeRegExp(normalizedName)}\\b`).test(normalizedMessage);
    });

    if (matches.length === 0) {
      return { kind: 'NONE' };
    }

    // O nome mais longo que corresponde é sempre o mais específico
    // (ex. "Hetzner Cloud" preferido a "Hetzner" quando ambos
    // correspondem). Só seguro quando todos os outros nomes
    // correspondidos são substrings do mais longo — caso contrário são
    // entidades distintas genuinamente ambíguas, nunca resolvidas por
    // adivinhação.
    const longest = matches.reduce((best, candidate) => (candidate.name.length > best.name.length ? candidate : best));
    const allContainedInLongest = matches.every((candidate) =>
      normalize(longest.name).includes(normalize(candidate.name)),
    );
    if (!allContainedInLongest) {
      return { kind: 'AMBIGUOUS' };
    }

    return { kind: 'RESOLVED', id: longest.id, name: longest.name };
  }
}

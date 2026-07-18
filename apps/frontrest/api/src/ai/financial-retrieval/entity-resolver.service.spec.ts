import { FinancialEntityResolverService } from './entity-resolver.service';
import type { SuppliersService } from '../../suppliers/suppliers.service';
import type { ExpenseCategoriesService } from '../../expense-categories/expense-categories.service';

function buildService(suppliers: Array<{ id: string; name: string }>, categories: Array<{ id: string; name: string }>) {
  const suppliersService = {
    findAll: jest.fn().mockResolvedValue({ items: suppliers, page: 1, pageSize: 100, total: suppliers.length, totalPages: 1 }),
  } as unknown as SuppliersService;
  const expenseCategoriesService = {
    findAll: jest.fn().mockResolvedValue(categories),
  } as unknown as ExpenseCategoriesService;
  return { service: new FinancialEntityResolverService(suppliersService, expenseCategoriesService), suppliersService, expenseCategoriesService };
}

describe('FinancialEntityResolverService', () => {
  describe('resolveSupplierMention', () => {
    it('sem nenhuma correspondência, devolve NONE', async () => {
      const { service } = buildService([{ id: 'sup-1', name: 'Hetzner' }], []);

      const result = await service.resolveSupplierMention('org-1', 'Quanto gastei este mês?');

      expect(result).toEqual({ kind: 'NONE' });
    });

    it('resolve o fornecedor mencionado, insensível a maiúsculas e acentos', async () => {
      const { service } = buildService([{ id: 'sup-1', name: 'Farmácia Esperança' }], []);

      const result = await service.resolveSupplierMention('org-1', 'Quanto gastei na farmacia esperanca este mês?');

      expect(result).toEqual({ kind: 'RESOLVED', id: 'sup-1', name: 'Farmácia Esperança' });
    });

    it('correspondência por fronteira de palavra — nunca uma substring solta dentro de outra palavra', async () => {
      const { service } = buildService([{ id: 'sup-1', name: 'NOS' }], []);

      const result = await service.resolveSupplierMention('org-1', 'Quanto gastei no nosso restaurante este mês?');

      expect(result).toEqual({ kind: 'NONE' });
    });

    it('nome mais longo e mais específico prevalece sobre o prefixo mais curto que também corresponde', async () => {
      const { service } = buildService(
        [
          { id: 'sup-1', name: 'Hetzner' },
          { id: 'sup-2', name: 'Hetzner Cloud' },
        ],
        [],
      );

      const result = await service.resolveSupplierMention('org-1', 'Quanto gastei na Hetzner Cloud este mês?');

      expect(result).toEqual({ kind: 'RESOLVED', id: 'sup-2', name: 'Hetzner Cloud' });
    });

    it('duas entidades distintas e não sobrepostas correspondendo à mesma mensagem devolve AMBIGUOUS', async () => {
      const { service } = buildService(
        [
          { id: 'sup-1', name: 'Hetzner' },
          { id: 'sup-2', name: 'NOS' },
        ],
        [],
      );

      const result = await service.resolveSupplierMention('org-1', 'Comparar Hetzner com NOS este mês.');

      expect(result).toEqual({ kind: 'AMBIGUOUS' });
    });

    it('isolamento: só considera fornecedores devolvidos por SuppliersService (já isolado por organização)', async () => {
      const { service, suppliersService } = buildService([{ id: 'sup-1', name: 'Hetzner' }], []);

      await service.resolveSupplierMention('org-42', 'Hetzner este mês');

      expect(suppliersService.findAll).toHaveBeenCalledWith('org-42', expect.objectContaining({ pageSize: 100 }));
    });
  });

  describe('resolveCategoryMention', () => {
    it('resolve a categoria mencionada', async () => {
      const { service } = buildService([], [{ id: 'cat-1', name: 'Hosting' }]);

      const result = await service.resolveCategoryMention('org-1', 'Quanto gastei em hosting este mês?');

      expect(result).toEqual({ kind: 'RESOLVED', id: 'cat-1', name: 'Hosting' });
    });

    it('sem correspondência, devolve NONE', async () => {
      const { service } = buildService([], [{ id: 'cat-1', name: 'Hosting' }]);

      const result = await service.resolveCategoryMention('org-1', 'Quanto gastei este mês?');

      expect(result).toEqual({ kind: 'NONE' });
    });
  });
});

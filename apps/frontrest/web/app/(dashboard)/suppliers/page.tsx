'use client';

import { useEffect, useState } from 'react';
import { PageHeader, EmptyState, Spinner } from '@frontcore/ui';
import { useSession } from '../../../lib/session-context';
import { listSuppliers, type Supplier } from '../../../lib/suppliers';

export default function SuppliersPage() {
  const { session } = useSession();
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSuppliers(session.accessToken)
      .then((result) => setSuppliers(result.items))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : 'Erro ao carregar fornecedores.',
        ),
      );
  }, [session.accessToken]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fornecedores"
        description="Fornecedores registados na organização."
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!suppliers && !error ? (
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : null}

      {suppliers && suppliers.length === 0 ? (
        <EmptyState
          title="Sem fornecedores"
          description="Ainda não existem fornecedores registados nesta organização."
        />
      ) : null}

      {suppliers && suppliers.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">Nome</th>
                <th className="px-4 py-3 text-start">Email</th>
                <th className="px-4 py-3 text-start">Telefone</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-t border-border">
                  <td className="px-4 py-3">{supplier.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {supplier.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {supplier.phone ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

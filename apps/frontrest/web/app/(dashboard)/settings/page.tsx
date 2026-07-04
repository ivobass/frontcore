import { PageHeader, EmptyState } from '@frontcore/ui';

/** Stub — fundação da rota, sem funcionalidade de configuração real ainda. */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Definições"
        description="Configurações da organização e da conta."
      />
      <EmptyState
        title="Ainda não há definições configuráveis"
        description="Esta área está preparada para futuras funcionalidades de configuração."
      />
    </div>
  );
}

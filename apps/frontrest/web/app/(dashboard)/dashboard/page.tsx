'use client';

import { Typography, Card, CardHeader, CardTitle, CardContent } from '@frontcore/ui';
import { useSession } from '../../../lib/session-context';

export default function DashboardPage() {
  const { me } = useSession();

  return (
    <div className="flex flex-col gap-6">
      <Typography variant="h2" as="h1">
        Dashboard
      </Typography>

      <Card>
        <CardHeader>
          <CardTitle>Organização</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Typography variant="muted">Organização</Typography>
            <Typography>{me.organization.name}</Typography>
          </div>
          <div>
            <Typography variant="muted">Utilizador</Typography>
            <Typography>
              {me.user.name} ({me.user.email})
            </Typography>
          </div>
          <div>
            <Typography variant="muted">Role</Typography>
            <Typography>{me.role}</Typography>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

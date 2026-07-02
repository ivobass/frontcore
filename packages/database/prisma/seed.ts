import { PrismaClient } from '../src/generated/prisma';
import { hashPassword } from '@frontcore/auth';

const prisma = new PrismaClient();

const DEMO_ORG_SLUG = 'frontrest-demo';
const DEMO_USER_EMAIL = 'owner@frontrest.dev';
const DEMO_USER_PASSWORD = 'ChangeMe123!';

async function main(): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    update: {},
    create: {
      name: 'FrontRest Demo',
      slug: DEMO_ORG_SLUG,
    },
  });

  const passwordHash = await hashPassword(DEMO_USER_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      passwordHash,
      name: 'Demo Owner',
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      organizationId: organization.id,
      role: 'OWNER',
    },
  });

  console.log('Seed concluído:');
  console.log(`  Organização: ${organization.name} (${organization.slug})`);
  console.log(`  Utilizador:  ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seed falhou:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

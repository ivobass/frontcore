import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  hashPassword,
  verifyPassword,
  loadTokenConfig,
  signAccessToken,
  generateRefreshTokenValue,
  hashRefreshTokenValue,
  type AuthenticatedIdentity,
  type TokenPair,
} from '@frontcore/auth';
import { PrismaService } from '@frontcore/database';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

export interface AuthResult extends TokenPair {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string; slug: string };
  role: string;
}

export interface MeResult {
  user: { id: string; email: string; name: string | null };
  organization: { id: string; name: string; slug: string };
  role: string;
  isSuperAdmin: boolean;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Já existe uma conta com este email.');
    }

    const passwordHash = await hashPassword(dto.password);
    const slug = await this.uniqueSlug(dto.organizationName);

    const organization = await this.prisma.organization.create({
      data: { name: dto.organizationName, slug },
    });

    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name },
    });

    const membership = await this.prisma.membership.create({
      data: { userId: user.id, organizationId: organization.id, role: 'OWNER' },
    });

    const tokens = await this.issueTokens({
      userId: user.id,
      organizationId: organization.id,
      role: membership.role,
      isSuperAdmin: user.isSuperAdmin,
    });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      role: membership.role,
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          include: { organization: true },
        },
      },
    });

    const invalidCredentials = () =>
      new UnauthorizedException('Credenciais inválidas.');

    if (!user) throw invalidCredentials();

    const validPassword = await verifyPassword(dto.password, user.passwordHash);
    if (!validPassword) throw invalidCredentials();

    const membership = user.memberships[0];
    if (!membership) throw invalidCredentials();

    const tokens = await this.issueTokens({
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role,
      isSuperAdmin: user.isSuperAdmin,
    });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
      role: membership.role,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashRefreshTokenValue(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    const invalid = () =>
      new UnauthorizedException('Refresh token inválido ou expirado.');

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw invalid();
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: stored.userId, organizationId: stored.organizationId },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!membership || !user) throw invalid();

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens({
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role,
      isSuperAdmin: user.isSuperAdmin,
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshTokenValue(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.revokedAt) return;

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
  }

  async me(identity: AuthenticatedIdentity): Promise<MeResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: identity.userId },
    });
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: identity.userId,
        organizationId: identity.organizationId,
      },
      include: { organization: true },
    });

    if (!user || !membership) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
      role: membership.role,
      isSuperAdmin: user.isSuperAdmin,
    };
  }

  private async issueTokens(
    identity: AuthenticatedIdentity,
  ): Promise<TokenPair> {
    const config = loadTokenConfig();

    const accessToken = signAccessToken(
      identity,
      config.accessSecret,
      config.accessTtlSeconds,
    );

    const refreshTokenValue = generateRefreshTokenValue();
    await this.prisma.refreshToken.create({
      data: {
        userId: identity.userId,
        organizationId: identity.organizationId,
        tokenHash: hashRefreshTokenValue(refreshTokenValue),
        expiresAt: new Date(Date.now() + config.refreshTtlSeconds * 1000),
      },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'org';

    let slug = base;
    let attempt = 0;
    while (true) {
      const existing = await this.prisma.organization.findUnique({
        where: { slug },
      });
      if (!existing) return slug;
      attempt += 1;
      slug = `${base}-${attempt}`;
    }
  }
}

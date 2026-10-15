import {
  Body,
  Controller,
  Injectable,
  INestApplication,
  Post,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { EmailTokensRepository } from '../src/modules/auth/email-tokens.repository.js';
import { RefreshTokensRepository } from '../src/modules/auth/refresh-tokens.repository.js';
import { PrismaService } from '../src/infra/database/prisma.service.js';
import { createTestApp } from './support/create-test-app.js';
import { uniqueEmail } from './support/mailpit.js';

const inOneMinute = () => new Date(Date.now() + 60_000);

interface ProbeInput {
  userId: string;
  tokenHash: string;
}

// Um service que só existe neste teste: nenhuma rota de negócio grava por dois
// repositories na mesma transação. Ele usa os repositories reais.
@Injectable()
class ProbeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTokens: EmailTokensRepository,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  async useTokenAndOpenSession({ userId, tokenHash }: ProbeInput) {
    await this.prisma.$transaction(async (tx) => {
      await this.emailTokens.use(tokenHash, 'verify_email', new Date(), tx);
      await this.refreshTokens.create(
        {
          id: uuidv7(),
          userId,
          sessionId: uuidv7(),
          tokenHash: uuidv7(),
          expiresAt: inOneMinute(),
        },
        tx,
      );
    });
  }
}

@Controller('probe')
class ProbeController {
  constructor(private readonly probe: ProbeService) {}

  @Post('transaction')
  transaction(@Body() input: ProbeInput) {
    return this.probe.useTokenAndOpenSession(input);
  }
}

describe('Transação aberta pelo service', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [ProbeController],
      providers: [ProbeService, EmailTokensRepository, RefreshTokensRepository],
    });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function userWithToken() {
    const user = await prisma.user.create({
      data: {
        id: uuidv7(),
        email: uniqueEmail(),
        passwordHash: 'hash',
        termsAcceptedAt: new Date(),
      },
    });
    const tokenHash = uuidv7();
    await prisma.emailToken.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        type: 'verify_email',
        tokenHash,
        expiresAt: inOneMinute(),
      },
    });
    return { userId: user.id, tokenHash };
  }

  it('grava pelos dois repositories quando nada falha', async () => {
    const { userId, tokenHash } = await userWithToken();

    await request(app.getHttpServer())
      .post('/v1/probe/transaction')
      .send({ userId, tokenHash })
      .expect(201);

    const token = await prisma.emailToken.findUniqueOrThrow({
      where: { tokenHash },
    });
    expect(token.usedAt).not.toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(1);
  });

  it('desfaz a primeira gravação quando a segunda falha', async () => {
    const { tokenHash } = await userWithToken();
    // Um Usuário que não existe: a chave estrangeira recusa o token de renovação.
    const absentUserId = uuidv7();

    await request(app.getHttpServer())
      .post('/v1/probe/transaction')
      .send({ userId: absentUserId, tokenHash })
      .expect(500);

    const token = await prisma.emailToken.findUniqueOrThrow({
      where: { tokenHash },
    });
    expect(token.usedAt).toBeNull();
  });
});

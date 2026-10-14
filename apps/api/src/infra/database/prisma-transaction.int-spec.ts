import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { uniqueEmail } from '../../../test/support/mailpit.js';
import { AppConfigModule } from '../../config/config.module.js';
import { DatabaseModule } from './database.module.js';
import { PrismaService } from './prisma.service.js';

describe('Transação do banco', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule.forRoot(), DatabaseModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('desfaz o que já gravou quando uma leitura que lança erro não acha o registro', async () => {
    const user = {
      id: uuidv7(),
      email: uniqueEmail(),
      passwordHash: 'hash',
      termsAcceptedAt: new Date(),
    };

    const transaction = prisma.$transaction(async (tx) => {
      await tx.user.create({ data: user });
      await tx.user.findUniqueOrThrow({ where: { id: uuidv7() } });
    });

    await expect(transaction).rejects.toMatchObject({ code: 'P2025' });
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
  });
});

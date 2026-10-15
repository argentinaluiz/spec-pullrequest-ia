-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "storage_bytes" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotas" (
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "quotas_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- AddForeignKey
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A Cota nunca fica negativa (o Prisma não expressa a restrição).
ALTER TABLE "quotas" ADD CONSTRAINT "quotas_used_bytes_check" CHECK ("used_bytes" >= 0);

-- Dado de referência, e não seed: o plano gratuito existe também em produção. 15 GiB.
INSERT INTO "plans" ("id", "code", "storage_bytes", "active")
VALUES ('0199e2a4-0000-7000-8000-000000000001', 'free', 16106127360, true);

-- Os Usuários que já existem ganham a Cota no plano gratuito, com o que já enviaram.
INSERT INTO "quotas" ("user_id", "plan_id", "used_bytes", "updated_at")
SELECT u."id",
       '0199e2a4-0000-7000-8000-000000000001',
       COALESCE((SELECT SUM(i."size_bytes") FROM "items" i WHERE i."owner_id" = u."id" AND i."type" = 'file'), 0),
       now()
FROM "users" u;

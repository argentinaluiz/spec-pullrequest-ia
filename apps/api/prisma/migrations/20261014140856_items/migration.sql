-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "parent_id" UUID,
    "type" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "mime_type" TEXT,
    "object_key" TEXT,
    "upload_session_uri" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "items_object_key_key" ON "items"("object_key");

-- CreateIndex
CREATE INDEX "items_listing_idx" ON "items"("parent_id", "type" DESC, "name", "id") WHERE (status = 'active');

-- CreateIndex
CREATE INDEX "items_pending_idx" ON "items"("status", "created_at") WHERE (status = 'pending');

-- CreateIndex
CREATE UNIQUE INDEX "items_root_key" ON "items"("owner_id") WHERE (parent_id IS NULL);

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "items"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "items_pending_idx";

-- CreateIndex
CREATE INDEX "items_pending_idx" ON "items"("status", "created_at") WHERE (status IN ('pending', 'deleting'));

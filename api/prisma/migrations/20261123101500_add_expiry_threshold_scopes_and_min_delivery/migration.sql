-- AlterTable
ALTER TABLE "expiry_thresholds"
    ADD COLUMN "scope" VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
    ADD COLUMN "product_group_id" UUID,
    ADD COLUMN "product_id" UUID,
    ADD COLUMN "min_delivery_days" INTEGER;

-- Backfill existing GLOBAL rows with default min_delivery_days = 7 (D-019)
UPDATE "expiry_thresholds"
SET "min_delivery_days" = 7
WHERE "scope" = 'GLOBAL' AND "min_delivery_days" IS NULL;

-- CreateIndex
CREATE INDEX "expiry_thresholds_scope_effective_from_effective_to_idx"
    ON "expiry_thresholds"("scope", "effective_from", "effective_to");

-- AddForeignKey
ALTER TABLE "expiry_thresholds"
    ADD CONSTRAINT "expiry_thresholds_product_group_id_fkey"
    FOREIGN KEY ("product_group_id") REFERENCES "product_groups"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiry_thresholds"
    ADD CONSTRAINT "expiry_thresholds_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Manual SQL: CHECK constraints & Partial Unique Indexes (D-019)
-- ============================================================================

ALTER TABLE "expiry_thresholds"
    ADD CONSTRAINT "chk_expiry_thresholds_scope"
    CHECK ("scope" IN ('GLOBAL', 'PRODUCT_GROUP', 'PRODUCT')),
    ADD CONSTRAINT "chk_expiry_thresholds_scope_target"
    CHECK (
        ("scope" = 'GLOBAL' AND "product_group_id" IS NULL AND "product_id" IS NULL)
        OR ("scope" = 'PRODUCT_GROUP' AND "product_group_id" IS NOT NULL AND "product_id" IS NULL AND "min_delivery_days" IS NULL)
        OR ("scope" = 'PRODUCT' AND "product_id" IS NOT NULL AND "product_group_id" IS NULL AND "min_delivery_days" IS NULL)
    ),
    ADD CONSTRAINT "chk_expiry_thresholds_min_delivery_days"
    CHECK ("min_delivery_days" IS NULL OR "min_delivery_days" >= 0);

CREATE UNIQUE INDEX "uq_expiry_thresholds_active_global"
    ON "expiry_thresholds" ((1))
    WHERE "scope" = 'GLOBAL' AND "effective_to" IS NULL;

CREATE UNIQUE INDEX "uq_expiry_thresholds_active_group"
    ON "expiry_thresholds" ("product_group_id")
    WHERE "scope" = 'PRODUCT_GROUP' AND "effective_to" IS NULL;

CREATE UNIQUE INDEX "uq_expiry_thresholds_active_product"
    ON "expiry_thresholds" ("product_id")
    WHERE "scope" = 'PRODUCT' AND "effective_to" IS NULL;

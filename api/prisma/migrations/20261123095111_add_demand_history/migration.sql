-- CreateTable
CREATE TABLE "demand_history" (
    "id" BIGSERIAL NOT NULL,
    "product_id" UUID NOT NULL,
    "history_date" DATE NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demand_history_history_date_idx" ON "demand_history"("history_date");

-- CreateIndex
CREATE UNIQUE INDEX "demand_history_product_id_history_date_source_key" ON "demand_history"("product_id", "history_date", "source");

-- AddForeignKey
ALTER TABLE "demand_history" ADD CONSTRAINT "demand_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual SQL: CHECK constraints theo D-017
ALTER TABLE "demand_history"
    ADD CONSTRAINT "chk_demand_history_qty"
    CHECK ("qty" >= 0),
    ADD CONSTRAINT "chk_demand_history_source"
    CHECK ("source" IN ('SIMULATED', 'ACTUAL'));

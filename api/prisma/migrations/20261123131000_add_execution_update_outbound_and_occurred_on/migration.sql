-- AlterTable
ALTER TABLE "treatment_execution_updates"
    ADD COLUMN "occurred_on" DATE,
    ADD COLUMN "linked_outbound_id" UUID;

-- AddForeignKey
ALTER TABLE "treatment_execution_updates"
    ADD CONSTRAINT "treatment_execution_updates_linked_outbound_id_fkey"
    FOREIGN KEY ("linked_outbound_id") REFERENCES "outbound_receipts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Manual SQL: Partial Unique Index chống liên kết lặp phiếu xuất cho cùng execution (T-015, D-013, D-028)
-- ============================================================================

CREATE UNIQUE INDEX "uq_treatment_execution_updates_execution_outbound"
    ON "treatment_execution_updates" ("execution_id", "linked_outbound_id")
    WHERE "linked_outbound_id" IS NOT NULL;

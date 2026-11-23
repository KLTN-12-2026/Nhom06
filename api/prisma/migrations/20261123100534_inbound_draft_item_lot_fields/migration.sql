/*
  Warnings:

  - Added the required column `expiry_date` to the `inbound_receipt_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lot_code` to the `inbound_receipt_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "inbound_receipt_items" ADD COLUMN     "expiry_date" DATE NOT NULL,
ADD COLUMN     "lot_code" VARCHAR(80) NOT NULL,
ADD COLUMN     "manufactured_date" DATE,
ALTER COLUMN "lot_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "inbound_receipt_items_receipt_id_idx" ON "inbound_receipt_items"("receipt_id");

-- Manual SQL: CHECK constraints (D-018)
ALTER TABLE "inbound_receipt_items"
  ADD CONSTRAINT "chk_inbound_receipt_items_expiry_after_mfg"
  CHECK ("manufactured_date" IS NULL OR "expiry_date" > "manufactured_date"),
  ADD CONSTRAINT "chk_inbound_receipt_items_unit_cost"
  CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);

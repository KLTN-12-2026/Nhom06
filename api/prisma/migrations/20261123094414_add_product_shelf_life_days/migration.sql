-- AlterTable
ALTER TABLE "products" ADD COLUMN     "shelf_life_days" INTEGER;

ALTER TABLE "products" ADD CONSTRAINT "products_shelf_life_days_check" CHECK ("shelf_life_days" IS NULL OR "shelf_life_days" > 0);

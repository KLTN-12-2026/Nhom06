import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

const SYNTHETIC_SALES_CSV_PATH = path.join(__dirname, 'data', 'synthetic_sales.csv');
const BATCH_SIZE = 2000;
const SIMULATED_SOURCE = 'SIMULATED';

interface CsvDemandRow {
  date: string;
  productCode: string;
  qty: string;
}

function parseSyntheticSalesCsv(content: string): CsvDemandRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error('File synthetic_sales.csv rỗng');
  }

  const header = lines[0];
  if (header !== 'date,product_code,qty') {
    throw new Error(`Header file synthetic_sales.csv không đúng chuẩn: ${header}`);
  }

  const rows: CsvDemandRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',');
    if (parts.length !== 3) {
      throw new Error(`Dòng ${i + 1} trong synthetic_sales.csv không hợp lệ: ${lines[i]}`);
    }
    const [date, productCode, qty] = parts.map((part) => part.trim());
    rows.push({ date, productCode, qty });
  }

  return rows;
}

export async function seedDemandHistory(prisma: PrismaClient): Promise<number> {
  const csvContent = fs.readFileSync(SYNTHETIC_SALES_CSV_PATH, 'utf-8');
  const parsedRows = parseSyntheticSalesCsv(csvContent);

  const products = await prisma.product.findMany({
    select: { id: true, code: true },
  });
  const productIdByCode = new Map(products.map((product) => [product.code, product.id]));

  const records: Prisma.DemandHistoryCreateManyInput[] = parsedRows.map((row) => {
    const productId = productIdByCode.get(row.productCode);
    if (!productId) {
      throw new Error(`Không tìm thấy sản phẩm ${row.productCode} khi seed demand_history`);
    }
    return {
      productId,
      historyDate: new Date(`${row.date}T00:00:00.000Z`),
      qty: new Prisma.Decimal(row.qty),
      source: SIMULATED_SOURCE,
    };
  });

  let insertedCount = 0;
  for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
    const batch = records.slice(offset, offset + BATCH_SIZE);
    const result = await prisma.demandHistory.createMany({
      data: batch,
      skipDuplicates: true,
    });
    insertedCount += result.count;
  }

  return insertedCount;
}

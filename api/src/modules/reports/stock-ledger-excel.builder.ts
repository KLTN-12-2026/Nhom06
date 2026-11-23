import * as ExcelJS from 'exceljs';
import { type StockLedgerResult } from './domain/stock-ledger.domain';

function formatVnDate(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

export async function buildStockLedgerWorkbookBuffer(
  ledger: StockLedgerResult,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KHO-AI';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Nhap-Xuat-Ton');

  sheet.columns = [
    { key: 'stt', width: 8 },
    { key: 'code', width: 16 },
    { key: 'name', width: 38 },
    { key: 'unit', width: 12 },
    { key: 'opening', width: 16 },
    { key: 'inbound', width: 14 },
    { key: 'outbound', width: 14 },
    { key: 'adjustment', width: 14 },
    { key: 'closing', width: 16 },
  ];

  // Dòng 1: Tiêu đề
  sheet.mergeCells('A1:I1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'BÁO CÁO NHẬP — XUẤT — TỒN';
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Dòng 2: Kỳ báo cáo
  sheet.mergeCells('A2:I2');
  const periodCell = sheet.getCell('A2');
  periodCell.value = `Kỳ ${formatVnDate(ledger.from)} đến ${formatVnDate(ledger.to)} · chỉ tính chứng từ kho đã xác nhận`;
  periodCell.font = { italic: true, size: 10 };

  // Dòng 3: Công thức
  sheet.mergeCells('A3:I3');
  const formulaCell = sheet.getCell('A3');
  formulaCell.value = 'Công thức: Tồn cuối kỳ = tồn đầu kỳ + nhập − xuất ± điều chỉnh';
  formulaCell.font = { size: 10 };

  // Dòng 4: trống
  sheet.addRow([]);

  // Dòng 5: Header bảng
  const headerRow = sheet.addRow([
    'STT',
    'Mã sản phẩm',
    'Tên sản phẩm',
    'ĐVT',
    'Tồn đầu kỳ',
    'Nhập',
    'Xuất',
    'Điều chỉnh',
    'Tồn cuối kỳ',
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF4F7F9' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFDDE3E9' } },
      bottom: { style: 'thin', color: { argb: 'FFDDE3E9' } },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNumber >= 5 ? 'right' : colNumber === 1 ? 'center' : 'left',
    };
  });

  // Dữ liệu từng sản phẩm
  ledger.items.forEach((item, index) => {
    const row = sheet.addRow([
      index + 1,
      item.product.code,
      item.product.name,
      item.product.unit,
      Number(item.opening),
      Number(item.inbound),
      Number(item.outbound),
      Number(item.adjustment),
      Number(item.closing),
    ]);
    row.getCell(1).alignment = { horizontal: 'center' };
    for (let col = 5; col <= 9; col += 1) {
      const cell = row.getCell(col);
      cell.numFmt = '#,##0.###';
      cell.alignment = { horizontal: 'right' };
    }
    row.getCell(9).font = { bold: true };
  });

  // Dòng Tổng
  const totalRow = sheet.addRow([
    '',
    'Tổng',
    'Tổng tham khảo (không dùng so sánh giữa mặt hàng khác ĐVT)',
    '',
    Number(ledger.totals.opening),
    Number(ledger.totals.inbound),
    Number(ledger.totals.outbound),
    Number(ledger.totals.adjustment),
    Number(ledger.totals.closing),
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell, colNumber) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFDDE3E9' } },
      bottom: { style: 'double', color: { argb: 'FFDDE3E9' } },
    };
    if (colNumber >= 5) {
      cell.numFmt = '#,##0.###';
      cell.alignment = { horizontal: 'right' };
    }
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

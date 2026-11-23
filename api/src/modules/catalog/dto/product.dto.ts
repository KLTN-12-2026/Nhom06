import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CATALOG_CODE_REGEX } from '../domain/catalog-policy';
import { trimString, trimUppercase } from './catalog-common.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'SP021' })
  @Transform(trimUppercase)
  @IsString({ message: 'Mã sản phẩm không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mã sản phẩm' })
  @MinLength(2, { message: 'Mã phải có từ 2 đến 50 ký tự' })
  @MaxLength(50, { message: 'Mã phải có từ 2 đến 50 ký tự' })
  @Matches(CATALOG_CODE_REGEX, {
    message: 'Mã chỉ được gồm chữ cái, chữ số, dấu _ hoặc -',
  })
  code!: string;

  @ApiProperty({ example: 'Sữa tươi tiệt trùng 1L' })
  @Transform(trimString)
  @IsString({ message: 'Tên sản phẩm không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên sản phẩm' })
  @MaxLength(200, { message: 'Tên sản phẩm không được vượt quá 200 ký tự' })
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Vui lòng chọn nhóm hàng hợp lệ' })
  groupId!: string;

  @ApiProperty({ example: 'Thùng' })
  @Transform(trimString)
  @IsString({ message: 'Đơn vị tính không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập đơn vị tính' })
  @MaxLength(30, { message: 'Đơn vị tính không được vượt quá 30 ký tự' })
  unit!: string;

  @ApiPropertyOptional({ example: 180, nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @Type(() => Number)
  @IsInt({ message: 'Hạn dùng phải là số nguyên dương (ngày)' })
  @Min(1, { message: 'Hạn dùng phải lớn hơn 0 ngày' })
  shelfLifeDays?: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Không được thay đổi sau khi tạo' })
  @IsOptional()
  @Transform(trimUppercase)
  @IsString({ message: 'Mã sản phẩm không hợp lệ' })
  code?: string;

  @ApiPropertyOptional({ example: 'Sữa tươi tiệt trùng 1L (mới)' })
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Tên sản phẩm không hợp lệ' })
  @IsNotEmpty({ message: 'Tên sản phẩm không được để trống' })
  @MaxLength(200, { message: 'Tên sản phẩm không được vượt quá 200 ký tự' })
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'Nhóm hàng không hợp lệ' })
  groupId?: string;

  @ApiPropertyOptional({ example: 'Thùng' })
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Đơn vị tính không hợp lệ' })
  @IsNotEmpty({ message: 'Đơn vị tính không được để trống' })
  @MaxLength(30, { message: 'Đơn vị tính không được vượt quá 30 ký tự' })
  unit?: string;

  @ApiPropertyOptional({ example: 180, nullable: true })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Type(() => Number)
  @IsInt({ message: 'Hạn dùng phải là số nguyên dương (ngày)' })
  @Min(1, { message: 'Hạn dùng phải lớn hơn 0 ngày' })
  shelfLifeDays?: number | null;
}

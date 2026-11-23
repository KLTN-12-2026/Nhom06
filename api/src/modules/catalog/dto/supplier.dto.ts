import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CATALOG_CODE_REGEX, CATALOG_PHONE_REGEX } from '../domain/catalog-policy';
import {
  trimOptionalToNull,
  trimOptionalToUndefined,
  trimString,
  trimUppercase,
} from './catalog-common.dto';

export class CreateSupplierDto {
  @ApiProperty({ example: 'NCC004' })
  @Transform(trimUppercase)
  @IsString({ message: 'Mã nhà cung cấp không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mã nhà cung cấp' })
  @MinLength(2, { message: 'Mã phải có từ 2 đến 50 ký tự' })
  @MaxLength(50, { message: 'Mã phải có từ 2 đến 50 ký tự' })
  @Matches(CATALOG_CODE_REGEX, {
    message: 'Mã chỉ được gồm chữ cái, chữ số, dấu _ hoặc -',
  })
  code!: string;

  @ApiProperty({ example: 'Công ty CP Sữa Việt Nam — CN Đà Nẵng' })
  @Transform(trimString)
  @IsString({ message: 'Tên nhà cung cấp không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên nhà cung cấp' })
  @MaxLength(200, { message: 'Tên nhà cung cấp không được vượt quá 200 ký tự' })
  name!: string;

  @ApiPropertyOptional({ example: '02363886688' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(CATALOG_PHONE_REGEX, {
    message: 'Số điện thoại chỉ gồm chữ số, dấu + hoặc khoảng trắng (8–15 ký tự)',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'lienhe@supplier.local' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(255, { message: 'Email không được vượt quá 255 ký tự' })
  email?: string;

  @ApiPropertyOptional({ example: '36 Nguyễn Văn Linh, Hải Châu, Đà Nẵng' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Địa chỉ không hợp lệ' })
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự' })
  address?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ description: 'Không được thay đổi sau khi tạo' })
  @IsOptional()
  @Transform(trimUppercase)
  @IsString({ message: 'Mã nhà cung cấp không hợp lệ' })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Tên nhà cung cấp không hợp lệ' })
  @IsNotEmpty({ message: 'Tên nhà cung cấp không được để trống' })
  @MaxLength(200, { message: 'Tên nhà cung cấp không được vượt quá 200 ký tự' })
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(CATALOG_PHONE_REGEX, {
    message: 'Số điện thoại chỉ gồm chữ số, dấu + hoặc khoảng trắng (8–15 ký tự)',
  })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(255, { message: 'Email không được vượt quá 255 ký tự' })
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString({ message: 'Địa chỉ không hợp lệ' })
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự' })
  address?: string | null;
}

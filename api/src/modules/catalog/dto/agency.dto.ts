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

export class CreateAgencyDto {
  @ApiProperty({ example: 'DL006' })
  @Transform(trimUppercase)
  @IsString({ message: 'Mã đại lý không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mã đại lý' })
  @MinLength(2, { message: 'Mã phải có từ 2 đến 50 ký tự' })
  @MaxLength(50, { message: 'Mã phải có từ 2 đến 50 ký tự' })
  @Matches(CATALOG_CODE_REGEX, {
    message: 'Mã chỉ được gồm chữ cái, chữ số, dấu _ hoặc -',
  })
  code!: string;

  @ApiProperty({ example: 'Đại lý Hội An Mart' })
  @Transform(trimString)
  @IsString({ message: 'Tên đại lý không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên đại lý' })
  @MaxLength(200, { message: 'Tên đại lý không được vượt quá 200 ký tự' })
  name!: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Tên người liên hệ không hợp lệ' })
  @MaxLength(150, { message: 'Tên người liên hệ không được vượt quá 150 ký tự' })
  contactName?: string;

  @ApiPropertyOptional({ example: '0905112233' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(CATALOG_PHONE_REGEX, {
    message: 'Số điện thoại chỉ gồm chữ số, dấu + hoặc khoảng trắng (8–15 ký tự)',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'lienhe@agency.local' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(255, { message: 'Email không được vượt quá 255 ký tự' })
  email?: string;

  @ApiPropertyOptional({ example: '125 Hùng Vương, Hải Châu, Đà Nẵng' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Địa chỉ không hợp lệ' })
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự' })
  address?: string;
}

export class UpdateAgencyDto {
  @ApiPropertyOptional({ description: 'Không được thay đổi sau khi tạo' })
  @IsOptional()
  @Transform(trimUppercase)
  @IsString({ message: 'Mã đại lý không hợp lệ' })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Tên đại lý không hợp lệ' })
  @IsNotEmpty({ message: 'Tên đại lý không được để trống' })
  @MaxLength(200, { message: 'Tên đại lý không được vượt quá 200 ký tự' })
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString({ message: 'Tên người liên hệ không hợp lệ' })
  @MaxLength(150, { message: 'Tên người liên hệ không được vượt quá 150 ký tự' })
  contactName?: string | null;

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

import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CATALOG_CODE_REGEX } from '../domain/catalog-policy';
import {
  trimOptionalToNull,
  trimOptionalToUndefined,
  trimString,
  trimUppercase,
} from './catalog-common.dto';

export class CreateProductGroupDto {
  @ApiProperty({ example: 'SUA' })
  @Transform(trimUppercase)
  @IsString({ message: 'Mã nhóm hàng không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mã nhóm hàng' })
  @MinLength(2, { message: 'Mã phải có từ 2 đến 50 ký tự' })
  @MaxLength(50, { message: 'Mã phải có từ 2 đến 50 ký tự' })
  @Matches(CATALOG_CODE_REGEX, {
    message: 'Mã chỉ được gồm chữ cái, chữ số, dấu _ hoặc -',
  })
  code!: string;

  @ApiProperty({ example: 'Sữa' })
  @Transform(trimString)
  @IsString({ message: 'Tên nhóm hàng không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên nhóm hàng' })
  @MaxLength(150, { message: 'Tên nhóm hàng không được vượt quá 150 ký tự' })
  name!: string;

  @ApiPropertyOptional({ example: 'Các sản phẩm sữa tiệt trùng, sữa đặc' })
  @IsOptional()
  @Transform(trimOptionalToUndefined)
  @IsString({ message: 'Mô tả không hợp lệ' })
  @MaxLength(500, { message: 'Mô tả không được vượt quá 500 ký tự' })
  description?: string;
}

export class UpdateProductGroupDto {
  @ApiPropertyOptional({ description: 'Không được thay đổi sau khi tạo' })
  @IsOptional()
  @Transform(trimUppercase)
  @IsString({ message: 'Mã nhóm hàng không hợp lệ' })
  code?: string;

  @ApiPropertyOptional({ example: 'Sữa và chế phẩm từ sữa' })
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Tên nhóm hàng không hợp lệ' })
  @IsNotEmpty({ message: 'Tên nhóm hàng không được để trống' })
  @MaxLength(150, { message: 'Tên nhóm hàng không được vượt quá 150 ký tự' })
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOptionalToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString({ message: 'Mô tả không hợp lệ' })
  @MaxLength(500, { message: 'Mô tả không được vượt quá 500 ký tự' })
  description?: string | null;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'], { message: 'Trạng thái phải là active hoặc inactive' })
  status?: 'active' | 'inactive';
}

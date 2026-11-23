import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionMatrixResult } from './domain/user-policy';
import { RolesService } from './roles.service';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('matrix')
  @Permissions('roles.read')
  @ApiOperation({ summary: 'Ma trận phân quyền đọc trực tiếp từ role_permissions' })
  getMatrix(): Promise<PermissionMatrixResult> {
    return this.rolesService.getPermissionMatrix();
  }
}

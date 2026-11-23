import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RolesService, RoleWithPermissionsResponse } from './roles.service';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('roles.read')
  @ApiOperation({ summary: 'Danh sách vai trò nội bộ kèm danh sách mã quyền' })
  findAll(): Promise<RoleWithPermissionsResponse[]> {
    return this.rolesService.findAllRoles();
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserResponse, UsersService } from './users.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('Mã tài khoản không đúng định dạng UUID'),
});

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users.read')
  @ApiOperation({ summary: 'Danh sách tài khoản nội bộ (có tìm kiếm và lọc trạng thái)' })
  findAll(@Query() query: ListUsersQueryDto): Promise<UserResponse[]> {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Permissions('users.read')
  @ApiOperation({ summary: 'Chi tiết một tài khoản nội bộ kèm vai trò' })
  findOne(@Param('id', uuidPipe) id: string): Promise<UserResponse> {
    return this.usersService.findOne(id);
  }

  @Post()
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Tạo tài khoản nội bộ mới và gán vai trò' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.create(dto, actor.id);
  }

  @Patch(':id')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Cập nhật hồ sơ tài khoản (email, họ tên, số điện thoại)' })
  updateProfile(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.updateProfile(id, dto, actor.id);
  }

  @Patch(':id/status')
  @Permissions('users.manage')
  @ApiOperation({ summary: 'Khóa hoặc mở khóa tài khoản nội bộ' })
  updateStatus(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.updateStatus(id, dto.status, actor.id);
  }

  @Put(':id/role')
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'Thay đổi vai trò của một tài khoản nội bộ' })
  updateRole(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.updateRole(id, dto.roleCode, actor.id);
  }
}

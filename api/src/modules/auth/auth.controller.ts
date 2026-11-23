import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AuthService, AuthUserResponse, LoginResponse } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng tài khoản nội bộ và nhận JWT access token' })
  @ApiOkResponse({ description: 'Đăng nhập thành công' })
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất và vô hiệu hóa toàn bộ token cũ của tài khoản' })
  @ApiNoContentResponse({ description: 'Đăng xuất thành công' })
  logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.authService.logout(user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tự đổi mật khẩu cho chính tài khoản đang đăng nhập và vô hiệu token cũ' })
  @ApiNoContentResponse({ description: 'Đổi mật khẩu thành công' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(user.id, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin người dùng hiện tại, vai trò và danh sách quyền' })
  @ApiOkResponse({ description: 'Thông tin người dùng hiện tại' })
  me(@CurrentUser() user: AuthenticatedUser): AuthUserResponse {
    return this.authService.getProfile(user);
  }
}

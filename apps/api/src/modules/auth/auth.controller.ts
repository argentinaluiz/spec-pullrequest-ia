import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblem } from '../../common/openapi/api-problem.decorator.js';
import { ClientIp } from '../../common/client-ip/client-ip.decorator.js';
import { ClientIpGuard } from '../../common/client-ip/client-ip.guard.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { TokenPairDto } from './dto/token-pair.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
import { RegistrationService } from './registration.service.js';
import { SessionsService } from './sessions.service.js';

@ApiTags('auth')
@Controller('auth')
@UseGuards(ClientIpGuard)
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly sessions: SessionsService,
    private readonly passwordRecovery: PasswordRecoveryService,
  ) {}

  @Post('register')
  @ApiCreatedResponse()
  @ApiProblem(400, 'validation_error')
  @ApiProblem(429, 'rate_limited')
  @HttpCode(201)
  async register(
    @Body() body: RegisterDto,
    @ClientIp() clientIp: string,
  ): Promise<void> {
    await this.registration.register(body.email, body.password, clientIp);
  }

  @Post('verify-email')
  @ApiNoContentResponse()
  @ApiProblem(400, 'validation_error', 'invalid_token')
  @HttpCode(204)
  async verifyEmail(@Body() body: VerifyEmailDto): Promise<void> {
    await this.registration.verifyEmail(body.token);
  }

  @Post('resend-verification')
  @ApiNoContentResponse()
  @ApiProblem(400, 'validation_error')
  @ApiProblem(429, 'rate_limited')
  @HttpCode(204)
  async resendVerification(
    @Body() body: ResendVerificationDto,
    @ClientIp() clientIp: string,
  ): Promise<void> {
    await this.registration.resendVerification(body.email, clientIp);
  }

  @Post('login')
  @ApiOkResponse({ type: TokenPairDto })
  @ApiProblem(400, 'validation_error')
  @ApiProblem(401, 'invalid_credentials')
  @ApiProblem(403, 'email_not_verified')
  @ApiProblem(429, 'rate_limited')
  @HttpCode(200)
  login(
    @Body() body: LoginDto,
    @ClientIp() clientIp: string,
  ): Promise<TokenPairDto> {
    return this.sessions.login(body.email, body.password, clientIp);
  }

  @Post('refresh')
  @ApiOkResponse({ type: TokenPairDto })
  @ApiProblem(400, 'validation_error')
  @ApiProblem(401, 'unauthenticated')
  @HttpCode(200)
  refresh(@Body() body: RefreshDto): Promise<TokenPairDto> {
    return this.sessions.refresh(body.refreshToken);
  }

  @Post('logout')
  @ApiNoContentResponse()
  @ApiProblem(400, 'validation_error')
  @HttpCode(204)
  async logout(@Body() body: LogoutDto): Promise<void> {
    await this.sessions.logout(body.refreshToken);
  }

  @Post('forgot-password')
  @ApiNoContentResponse()
  @ApiProblem(400, 'validation_error')
  @ApiProblem(429, 'rate_limited')
  @HttpCode(204)
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
    @ClientIp() clientIp: string,
  ): Promise<void> {
    await this.passwordRecovery.requestReset(body.email, clientIp);
  }

  @Post('reset-password')
  @ApiNoContentResponse()
  @ApiProblem(400, 'validation_error', 'invalid_token')
  @HttpCode(204)
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.passwordRecovery.reset(body.token, body.password);
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/auth/auth.guard.js';
import { CurrentUserId } from '../../common/auth/current-user-id.decorator.js';
import { ApiProblem } from '../../common/openapi/api-problem.decorator.js';
import { MeDto } from './me.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ type: MeDto })
  @ApiProblem(401, 'unauthenticated')
  async me(@CurrentUserId() userId: string): Promise<MeDto> {
    const user = await this.users.getAuthenticated(userId);
    return { id: user.id, email: user.email };
  }
}

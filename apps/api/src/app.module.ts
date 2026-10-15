import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter.js';
import { InputValidationPipe } from './common/validation/input-validation.pipe.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { MailModule } from './infra/mail/mail.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ItemsModule } from './modules/items/items.module.js';
import { QuotaModule } from './modules/quota/quota.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    AppConfigModule.forRoot(),
    DatabaseModule,
    MailModule,
    UsersModule,
    AuthModule,
    ItemsModule,
    QuotaModule,
    UploadsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useClass: InputValidationPipe },
  ],
})
export class AppModule {}

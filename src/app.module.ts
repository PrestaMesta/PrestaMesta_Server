import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule } from './clients/clients.module';
import { LoansModule } from './loans/loans.module';
import { CreditsModule } from './credits/credits.module';
import { GuaranteesModule } from './guarantees/guarantees.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [ClientsModule, LoansModule, CreditsModule, GuaranteesModule, AuditModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

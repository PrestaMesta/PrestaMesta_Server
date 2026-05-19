import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientController } from './infrastructure/controllers/client.controller';
import { RegisterClientUseCase } from './application/use-cases/register-client.use-case';
import { TypeOrmClientRepository } from './infrastructure/repositories/typeorm-client.repository';
import { ClientEntity } from './infrastructure/persistence/client.entity';
import { CLIENT_REPOSITORY, REGISTER_CLIENT_USE_CASE } from './clients.tokens';

@Module({
  imports: [TypeOrmModule.forFeature([ClientEntity])],
  controllers: [ClientController],
  providers: [
    TypeOrmClientRepository,
    {
      provide: CLIENT_REPOSITORY,
      useExisting: TypeOrmClientRepository,
    },
    {
      provide: REGISTER_CLIENT_USE_CASE,
      useFactory: (repo: TypeOrmClientRepository) =>
        new RegisterClientUseCase(repo),
      inject: [TypeOrmClientRepository],
    },
  ],
  exports: [CLIENT_REPOSITORY],
})
export class ClientsModule {}

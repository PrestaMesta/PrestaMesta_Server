import { Module } from '@nestjs/common';
import { GuaranteesService } from './guarantees.service';
import { GuaranteesController } from './guarantees.controller';

@Module({
  controllers: [GuaranteesController],
  providers: [GuaranteesService],
})
export class GuaranteesModule {}

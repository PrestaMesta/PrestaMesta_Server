import { Test, TestingModule } from '@nestjs/testing';
import { GuaranteesController } from './guarantees.controller';
import { GuaranteesService } from './guarantees.service';

describe('GuaranteesController', () => {
  let controller: GuaranteesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GuaranteesController],
      providers: [GuaranteesService],
    }).compile();

    controller = module.get<GuaranteesController>(GuaranteesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

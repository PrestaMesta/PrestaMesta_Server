import { Test, TestingModule } from '@nestjs/testing';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

describe('CreditsController', () => {
  let controller: CreditsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditsController],
      providers: [CreditsService],
    }).compile();

    controller = module.get<CreditsController>(CreditsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

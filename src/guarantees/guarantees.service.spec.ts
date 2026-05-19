import { Test, TestingModule } from '@nestjs/testing';
import { GuaranteesService } from './guarantees.service';

describe('GuaranteesService', () => {
  let service: GuaranteesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GuaranteesService],
    }).compile();

    service = module.get<GuaranteesService>(GuaranteesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

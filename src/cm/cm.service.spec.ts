import { Test, TestingModule } from '@nestjs/testing';
import { CmService } from './cm.service';

describe('CmService', () => {
  let service: CmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CmService],
    }).compile();

    service = module.get<CmService>(CmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

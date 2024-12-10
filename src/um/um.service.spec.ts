import { Test, TestingModule } from '@nestjs/testing';
import { UmService } from './um.service';

describe('UmService', () => {
  let service: UmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UmService],
    }).compile();

    service = module.get<UmService>(UmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

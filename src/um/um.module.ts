import { Module } from '@nestjs/common';
import { UMFuturesService } from './um.service';

@Module({
  providers: [UMFuturesService],
})
export class UmModule {}

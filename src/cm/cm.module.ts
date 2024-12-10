import { Module } from '@nestjs/common';
import { CMFuturesService } from './cm.service';

@Module({
  providers: [CMFuturesService],
})
export class CmModule {}

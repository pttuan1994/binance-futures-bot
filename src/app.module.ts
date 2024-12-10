import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UmModule } from './um/um.module';
import { CmModule } from './cm/cm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    UmModule,
    CmModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

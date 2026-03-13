import { Module } from '@nestjs/common';
import { SearchReferencePhotosController } from './search-reference-photos.controller';
import { SearchReferencePhotosService } from './search-reference-photos.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MinioModule } from '../minio/minio.module';
import { AiModule } from '../ai/ai.module';
import { SearchModule } from '../search/search.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    PrismaModule,
    MinioModule,
    AiModule,
    SearchModule,
    MetricsModule,
  ],
  controllers: [SearchReferencePhotosController],
  providers: [SearchReferencePhotosService],
  exports: [SearchReferencePhotosService],
})
export class SearchReferencePhotosModule {}

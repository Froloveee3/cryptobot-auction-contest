import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class OutboxQueryDto {
  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsIn(['pending', 'processing', 'published', 'failed'])
  status?: 'pending' | 'processing' | 'published' | 'failed';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}


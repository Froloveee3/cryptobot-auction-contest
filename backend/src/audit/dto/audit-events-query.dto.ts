import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AuditEventsQueryDto {
  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsString()
  auctionId?: string;

  @IsOptional()
  @IsString()
  roundId?: string;

  @IsOptional()
  @IsString()
  bidId?: string;

  @IsOptional()
  @IsString()
  from?: string; 

  @IsOptional()
  @IsString()
  to?: string; 

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


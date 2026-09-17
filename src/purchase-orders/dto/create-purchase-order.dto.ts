import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreatePurchaseOrderDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsInt()
  @Min(0)
  totalCents: number;
}

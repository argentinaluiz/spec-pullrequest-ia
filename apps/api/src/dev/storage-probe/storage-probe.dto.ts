import { IsNotEmpty, IsString } from 'class-validator';

export class ProbeReadUrlQueryDto {
  @IsString()
  @IsNotEmpty()
  objectName!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;
}

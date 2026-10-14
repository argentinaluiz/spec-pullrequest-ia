import { IsNotEmpty, IsString } from 'class-validator';

export class ProbeObjectQueryDto {
  @IsString()
  @IsNotEmpty()
  objectName!: string;
}

export class ProbeReadUrlQueryDto extends ProbeObjectQueryDto {
  @IsString()
  @IsNotEmpty()
  fileName!: string;
}

export class ProbeSessionBodyDto extends ProbeObjectQueryDto {
  @IsString()
  @IsNotEmpty()
  mimeType!: string;
}

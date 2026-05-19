import { PartialType } from '@nestjs/mapped-types';
import { CreateGuaranteeDto } from './create-guarantee.dto';

export class UpdateGuaranteeDto extends PartialType(CreateGuaranteeDto) {}

import { Injectable } from '@nestjs/common';
import { CreateGuaranteeDto } from './dto/create-guarantee.dto';
import { UpdateGuaranteeDto } from './dto/update-guarantee.dto';

@Injectable()
export class GuaranteesService {
  create(createGuaranteeDto: CreateGuaranteeDto) {
    return 'This action adds a new guarantee';
  }

  findAll() {
    return `This action returns all guarantees`;
  }

  findOne(id: number) {
    return `This action returns a #${id} guarantee`;
  }

  update(id: number, updateGuaranteeDto: UpdateGuaranteeDto) {
    return `This action updates a #${id} guarantee`;
  }

  remove(id: number) {
    return `This action removes a #${id} guarantee`;
  }
}

import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { GuaranteesService } from './guarantees.service';
import { CreateGuaranteeDto } from './dto/create-guarantee.dto';
import { UpdateGuaranteeDto } from './dto/update-guarantee.dto';

@Controller('guarantees')
export class GuaranteesController {
  constructor(private readonly guaranteesService: GuaranteesService) {}

  @Post()
  create(@Body() createGuaranteeDto: CreateGuaranteeDto) {
    return this.guaranteesService.create(createGuaranteeDto);
  }

  @Get()
  findAll() {
    return this.guaranteesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.guaranteesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateGuaranteeDto: UpdateGuaranteeDto) {
    return this.guaranteesService.update(+id, updateGuaranteeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.guaranteesService.remove(+id);
  }
}

import { CreateGuaranteeDto } from './dto/create-guarantee.dto';
import { UpdateGuaranteeDto } from './dto/update-guarantee.dto';
export declare class GuaranteesService {
    create(createGuaranteeDto: CreateGuaranteeDto): string;
    findAll(): string;
    findOne(id: number): string;
    update(id: number, updateGuaranteeDto: UpdateGuaranteeDto): string;
    remove(id: number): string;
}

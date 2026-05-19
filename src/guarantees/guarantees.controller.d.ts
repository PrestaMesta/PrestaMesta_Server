import { GuaranteesService } from './guarantees.service';
import { CreateGuaranteeDto } from './dto/create-guarantee.dto';
import { UpdateGuaranteeDto } from './dto/update-guarantee.dto';
export declare class GuaranteesController {
    private readonly guaranteesService;
    constructor(guaranteesService: GuaranteesService);
    create(createGuaranteeDto: CreateGuaranteeDto): string;
    findAll(): string;
    findOne(id: string): string;
    update(id: string, updateGuaranteeDto: UpdateGuaranteeDto): string;
    remove(id: string): string;
}

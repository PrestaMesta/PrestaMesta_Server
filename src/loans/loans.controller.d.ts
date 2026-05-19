import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
export declare class LoansController {
    private readonly loansService;
    constructor(loansService: LoansService);
    create(createLoanDto: CreateLoanDto): string;
    findAll(): string;
    findOne(id: string): string;
    update(id: string, updateLoanDto: UpdateLoanDto): string;
    remove(id: string): string;
}

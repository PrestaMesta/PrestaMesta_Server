import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
export declare class LoansService {
    create(createLoanDto: CreateLoanDto): string;
    findAll(): string;
    findOne(id: number): string;
    update(id: number, updateLoanDto: UpdateLoanDto): string;
    remove(id: number): string;
}

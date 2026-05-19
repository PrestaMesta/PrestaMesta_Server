import { CreateCreditDto } from './dto/create-credit.dto';
import { UpdateCreditDto } from './dto/update-credit.dto';
export declare class CreditsService {
    create(createCreditDto: CreateCreditDto): string;
    findAll(): string;
    findOne(id: number): string;
    update(id: number, updateCreditDto: UpdateCreditDto): string;
    remove(id: number): string;
}

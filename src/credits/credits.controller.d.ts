import { CreditsService } from './credits.service';
import { CreateCreditDto } from './dto/create-credit.dto';
import { UpdateCreditDto } from './dto/update-credit.dto';
export declare class CreditsController {
    private readonly creditsService;
    constructor(creditsService: CreditsService);
    create(createCreditDto: CreateCreditDto): string;
    findAll(): string;
    findOne(id: string): string;
    update(id: string, updateCreditDto: UpdateCreditDto): string;
    remove(id: string): string;
}

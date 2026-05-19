import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto } from './dto/update-audit.dto';
export declare class AuditService {
    create(createAuditDto: CreateAuditDto): string;
    findAll(): string;
    findOne(id: number): string;
    update(id: number, updateAuditDto: UpdateAuditDto): string;
    remove(id: number): string;
}

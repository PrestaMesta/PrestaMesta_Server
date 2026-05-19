import { AuditService } from './audit.service';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto } from './dto/update-audit.dto';
export declare class AuditController {
    private readonly auditService;
    constructor(auditService: AuditService);
    create(createAuditDto: CreateAuditDto): string;
    findAll(): string;
    findOne(id: string): string;
    update(id: string, updateAuditDto: UpdateAuditDto): string;
    remove(id: string): string;
}

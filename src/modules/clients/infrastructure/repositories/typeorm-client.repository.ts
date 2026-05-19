import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IClientRepository } from '../../domain/repositories/client.repository.interface';
import { Client } from '../../domain/entities/client.entity';
import { ClientEntity } from '../persistence/client.entity';

@Injectable()
export class TypeOrmClientRepository implements IClientRepository {
  constructor(
    @InjectRepository(ClientEntity)
    private readonly repository: Repository<ClientEntity>,
  ) {}

  async findById(id: number): Promise<Client | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? entity.toDomain() : null;
  }

  async findByTaxId(taxId: string): Promise<Client | null> {
    const entity = await this.repository.findOne({ where: { taxId } });
    return entity ? entity.toDomain() : null;
  }

  async save(client: Client): Promise<Client> {
    const entity = ClientEntity.fromDomain(client);
    const saved = await this.repository.save(entity);
    return saved.toDomain();
  }
}

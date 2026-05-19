import { Client } from '../entities/client.entity';

export interface IClientRepository {
  findById(id: number): Promise<Client | null>;
  findByTaxId(taxId: string): Promise<Client | null>;
  save(client: Client): Promise<Client>;
}

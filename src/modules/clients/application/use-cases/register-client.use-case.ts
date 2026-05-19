import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Client } from '../../domain/entities/client.entity';
import { IClientRepository } from '../../domain/repositories/client.repository.interface';

export class RegisterClientUseCase {
  constructor(private readonly clientRepository: IClientRepository) {}

  async execute(data: {
    name: string;
    taxId: string;
    phone: string;
    email: string;
    address: string;
    password: string;
  }): Promise<Client> {
    const existing = await this.clientRepository.findByTaxId(data.taxId);
    if (existing) {
      throw new ConflictException('Tax ID is already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const client = new Client({
      name: data.name,
      lastName: '',
      taxId: data.taxId,
      phone: data.phone,
      email: data.email,
      address: data.address,
      password: hashedPassword,
      status: 'ACTIVE',
      createdAt: new Date(),
    });

    return this.clientRepository.save(client);
  }
}

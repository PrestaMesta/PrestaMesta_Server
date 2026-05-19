import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { Client } from '../../domain/entities/client.entity';

@Entity('clients')
export class ClientEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 100 })
  name: string;

  @Column({ name: 'last_name', length: 50 })
  lastName: string;

  @Column({ name: 'second_last_name', length: 50, nullable: true })
  secondLastName: string;

  @Column({ name: 'tax_id', length: 13, unique: true })
  taxId: string;

  @Column({ name: 'phone', length: 15 })
  phone: string;

  @Column({ name: 'email', length: 100 })
  email: string;

  @Column({ name: 'address', type: 'text' })
  address: string;

  @Column({ name: 'password', select: false })
  password: string;

  @Column({ name: 'status', length: 20, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  toDomain(): Client {
    return new Client({
      id: this.id,
      name: this.name,
      lastName: this.lastName,
      secondLastName: this.secondLastName,
      taxId: this.taxId,
      phone: this.phone,
      email: this.email,
      address: this.address,
      password: this.password,
      status: this.status,
      createdAt: this.createdAt,
    });
  }

  static fromDomain(client: Client): ClientEntity {
    const entity = new ClientEntity();
    entity.id = client.id;
    entity.name = client.name;
    entity.lastName = client.lastName;
    entity.secondLastName = client.secondLastName;
    entity.taxId = client.taxId;
    entity.phone = client.phone;
    entity.email = client.email;
    entity.address = client.address;
    entity.password = client.password;
    entity.status = client.status;
    entity.createdAt = client.createdAt;
    return entity;
  }
}

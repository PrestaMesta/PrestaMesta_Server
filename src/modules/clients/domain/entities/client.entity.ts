export class Client {
  id: number;
  name: string;
  lastName: string;
  secondLastName: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  password: string;
  status: string;
  createdAt: Date;

  constructor(partial: Partial<Client>) {
    Object.assign(this, partial);
  }
}

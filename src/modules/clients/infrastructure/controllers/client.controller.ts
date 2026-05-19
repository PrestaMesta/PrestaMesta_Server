import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { RegisterClientUseCase } from '../../application/use-cases/register-client.use-case';
import { RegisterClientDto } from '../dtos/register-client.dto';
import { REGISTER_CLIENT_USE_CASE } from '../../clients.tokens';

@Controller('clients')
export class ClientController {
  constructor(
    @Inject(REGISTER_CLIENT_USE_CASE)
    private readonly registerClientUseCase: RegisterClientUseCase,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterClientDto) {
    const client = await this.registerClientUseCase.execute(dto);
    return {
      message: 'Client registered successfully',
      data: { id: client.id },
    };
  }
}

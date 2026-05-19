import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule } from './clients/clients.module';
import { LoansModule } from './loans/loans.module';
import { CreditsModule } from './credits/credits.module';
import { GuaranteesModule } from './guarantees/guarantees.module';
import { AuditModule } from './audit/audit.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ClientsModule,
    LoansModule,
    CreditsModule,
    GuaranteesModule,
    AuditModule,
    ConfigModule.forRoot({
      isGlobal: true, // variables disponibles en todo el proyecto
    }),

    // 2. Configurar la conexión asíncrona a PostgreSQL con TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        // Carga automática de entidades que vayas creando (clientes, prestamos, etc.)
        autoLoadEntities: true,
        // Sincroniza tus entidades de NestJS con las tablas automáticamente.
        // ¡PRECAUCIÓN!: En producción cámbialo a false y usa migraciones por seguridad.
        synchronize: configService.get<string>('NODE_ENV') === 'development',
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

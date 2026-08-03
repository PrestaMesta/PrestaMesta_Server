const fs = require('fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType
} = require('docx');

const boxBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
};

// Función para crear bloques de código JSON / Cajas
function createCodeBlock(text) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: boxBorder,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: 'F4F5F7' },
            margins: { top: 100, bottom: 100, left: 150, right: 150 },
            children: text.split('\n').map(line => new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  font: 'Consolas',
                  size: 18,
                  color: '333333'
                })
              ]
            }))
          })
        ]
      })
    ]
  });
}

// Función para crear encabezados de endpoints
function createEndpointHeader(method, url) {
  const methodColor = method === 'POST' ? '107C41' : method === 'GET' ? '0078D4' : 'D83B01';
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text: `[${method}] `,
        bold: true,
        size: 22,
        color: methodColor,
        font: 'Consolas'
      }),
      new TextRun({
        text: url,
        bold: true,
        size: 22,
        font: 'Consolas'
      })
    ]
  });
}

// Documento Principal
const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        // Título del documento
        new Paragraph({
          text: 'Prestamesta - Documentación de Endpoints API',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Catálogo de endpoints de Prestamesta bajo el prefijo /api/v1. Los tokens JWT de cliente y administrador usan audiencias distintas (prestamesta-client / prestamesta-admin): un token de un dominio nunca es aceptado por rutas del otro dominio. El contrato completo y verificable está en openapi.yaml (fuente de verdad, validada con npm run docs:validate).',
              italic: true,
              size: 20
            })
          ],
          spacing: { after: 300 }
        }),

        // SECCIÓN 1: AUTENTICACIÓN DE CLIENTES
        new Paragraph({ text: '1. Módulo Autenticación de Clientes', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),

        // 1.1 Registro Cliente
        createEndpointHeader('POST', '/api/v1/client/auth/register'),
        new Paragraph({ text: 'Permite registrar un nuevo cliente en el sistema (MySQL).' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "nombre": "Juan Pérez",\n  "email": "juan@example.com",\n  "password": "miPasswordSeguro123",\n  "telefono": "8711234567"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (201 Created):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Cliente registrado exitosamente",\n  "clienteId": 1\n}`),

        // 1.2 Login Cliente
        createEndpointHeader('POST', '/api/v1/client/auth/login'),
        new Paragraph({ text: 'Autentica a un cliente y devuelve su Token JWT (audiencia prestamesta-client).' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "email": "juan@example.com",\n  "password": "miPasswordSeguro123"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (200 OK):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Autenticación exitosa",\n  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",\n  "cliente": {\n    "id": 1,\n    "nombre": "Juan Pérez",\n    "email": "juan@example.com"\n  }\n}`),

        // SECCIÓN 2: AUTENTICACIÓN Y GESTIÓN DE ADMINISTRADORES
        new Paragraph({ text: '2. Módulo de Administradores', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 } }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'Solo existen los roles SUPERADMIN, ANALISTA y COBRADOR. El primer SUPERADMIN se crea únicamente con el script offline "npm run seed:superadmin" (nunca vía HTTP sin autenticar).',
              italic: true,
              size: 20
            })
          ],
          spacing: { after: 150 }
        }),

        // 2.1 Login Admin
        createEndpointHeader('POST', '/api/v1/admin/auth/login'),
        new Paragraph({ text: 'Autentica a un administrador y genera su Token JWT (audiencia prestamesta-admin), con permisos según su rol.' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "email": "admin@prestamesta.com",\n  "password": "AdminSuperSeguro123"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (200 OK):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Autenticación de administrador exitosa",\n  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",\n  "admin": {\n    "id": 1,\n    "nombre": "Admin Principal",\n    "email": "admin@prestamesta.com",\n    "rol": "SUPERADMIN"\n  }\n}`),

        // 2.2 Crear administrador
        createEndpointHeader('POST', '/api/v1/admin/administradores'),
        new Paragraph({ text: 'Crea un nuevo administrador. Requiere un token de administrador cuyo rol, releído directamente de la base de datos, sea SUPERADMIN. No es un endpoint de autenticación pública.' }),
        new Paragraph({ text: 'Headers:', bold: true }),
        new Paragraph({ text: 'Authorization: Bearer <TOKEN_SUPERADMIN>', font: 'Consolas' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "nombre": "Nuevo Analista",\n  "email": "analista@prestamesta.com",\n  "password": "AdminSuperSeguro123",\n  "rol": "ANALISTA"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (201 Created):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Administrador creado exitosamente",\n  "adminId": 2,\n  "rol": "ANALISTA"\n}`),

        // SECCIÓN 3: CRÉDITOS Y PRÉSTAMOS
        new Paragraph({ text: '3. Módulo de Créditos y Préstamos', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 } }),

        // 3.1 Crear Crédito
        createEndpointHeader('POST', '/api/v1/prestamos/creditos'),
        new Paragraph({ text: 'Crea una opción en el catálogo de productos financieros. Requiere rol SUPERADMIN o ANALISTA.' }),
        new Paragraph({ text: 'Headers:', bold: true }),
        new Paragraph({ text: 'Authorization: Bearer <TOKEN_ADMIN>', font: 'Consolas' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "nombre": "Crédito Personal Express",\n  "monto_minimo": 1000,\n  "monto_maximo": 20000,\n  "tasa_interes_anual": 24,\n  "plazo_meses": 12\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (201 Created):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Tipo de crédito creado con éxito",\n  "creditoId": 1\n}`),

        // 3.2 Listar Créditos
        createEndpointHeader('GET', '/api/v1/prestamos/creditos'),
        new Paragraph({ text: 'Obtiene el catálogo de créditos disponibles. Requiere autenticación (cliente o administrador); no es público.' }),
        new Paragraph({ text: 'Headers:', bold: true }),
        new Paragraph({ text: 'Authorization: Bearer <TOKEN_CLIENTE_O_ADMIN>', font: 'Consolas' }),
        new Paragraph({ text: 'Respuesta Exitosa (200 OK):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`[\n  {\n    "id": 1,\n    "nombre": "Crédito Personal Express",\n    "monto_minimo": "1000.00",\n    "monto_maximo": "20000.00",\n    "tasa_interes_anual": "24.00",\n    "plazo_meses": 12,\n    "creado_en": "2026-08-02T02:43:54.000Z"\n  }\n]`),

        // 3.3 Solicitar Préstamo
        createEndpointHeader('POST', '/api/v1/prestamos/solicitar'),
        new Paragraph({ text: 'El cliente solicita un préstamo agregando opcionalmente información del aval. monto_total_a_pagar, saldo_pendiente y fecha_solicitud los fija siempre el servidor/la base de datos; nunca se aceptan del cliente. Tiene un límite de solicitudes por IP propio (SOLICITUD_RATE_LIMIT_WINDOW_MS/SOLICITUD_RATE_LIMIT_MAX, 10/hora por defecto), independiente del límite de login.' }),
        new Paragraph({ text: 'Headers:', bold: true }),
        new Paragraph({ text: 'Authorization: Bearer <TOKEN_CLIENTE>', font: 'Consolas' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "credito_id": 1,\n  "monto_solicitado": 10000,\n  "aval": {\n    "nombre": "Roberto Gómez",\n    "telefono": "8711234567",\n    "direccion": "Av. Morelos #450, Centro",\n    "ingreso_mensual": 15000\n  }\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (201 Created):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Solicitud de préstamo enviada con éxito",\n  "prestamoId": 1,\n  "fechaSolicitud": "2026-08-02T20:46:06.000Z",\n  "montoSolicitado": 10000,\n  "montoTotalAPagar": "12400.00",\n  "estado": "PENDIENTE"\n}`),

        // 3.4 Aprobar / Rechazar Préstamo
        createEndpointHeader('PATCH', '/api/v1/prestamos/:id/estado'),
        new Paragraph({ text: 'El administrador (SUPERADMIN o ANALISTA) aprueba o rechaza la solicitud del cliente. Transición atómica solo desde PENDIENTE: un id inexistente responde 404, un préstamo ya procesado responde 409 (nunca 200 en ninguno de los dos casos).' }),
        new Paragraph({ text: 'Headers:', bold: true }),
        new Paragraph({ text: 'Authorization: Bearer <TOKEN_ADMIN>', font: 'Consolas' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "estado": "APROBADO",\n  "motivo": "Cumple con el perfil de riesgo"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (200 OK):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "El préstamo #1 ha sido aprobado exitosamente."\n}`),

        // SECCIÓN 4: PENDIENTE DE DECISIÓN
        new Paragraph({ text: '4. Fuera de alcance / pendiente de decisión de producto', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 } }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'No implementados todavía: registro/consulta de pagos, mora, liquidación, activación y cancelación de préstamos. El modelo Mongo HistorialPago existe pero no está conectado a ningún endpoint.',
              italic: true,
              size: 20
            })
          ]
        })
      ]
    }
  ]
});

// Guardar archivo Word
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync('Prestamesta_Documentacion_Endpoints.docx', buffer);
  console.log('¡Documento Word "Prestamesta_Documentacion_Endpoints.docx" generado con éxito!');
});

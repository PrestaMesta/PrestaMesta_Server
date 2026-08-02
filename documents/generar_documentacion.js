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

// Estilos de bordes para tablas y cajas
const noBorders = {
  top: { style: BorderStyle.NONE },
  bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE },
  right: { style: BorderStyle.NONE }
};

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
              text: 'A continuación se presenta el catálogo completo de endpoints desarrollados para el sistema financiero Prestamesta, incluyendo autenticación (clientes y administradores) y la gestión del catálogo de créditos y solicitudes de préstamos.',
              italic: true,
              size: 20
            })
          ],
          spacing: { after: 300 }
        }),

        // SECCIÓN 1: AUTENTICACIÓN DE CLIENTES
        new Paragraph({ text: '1. Módulo Autenticación de Clientes', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }),
        
        // 1.1 Registro Cliente
        createEndpointHeader('POST', '/api/client/auth/register'),
        new Paragraph({ text: 'Permite registrar un nuevo cliente en el sistema (MySQL).' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "nombre": "Juan Pérez",\n  "email": "juan@example.com",\n  "password": "miPasswordSeguro123",\n  "telefono": "8711234567"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (201 Created):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Cliente registrado exitosamente",\n  "clienteId": 1\n}`),

        // 1.2 Login Cliente
        createEndpointHeader('POST', '/api/client/auth/login'),
        new Paragraph({ text: 'Autentica a un cliente y devuelve su Token JWT.' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "email": "juan@example.com",\n  "password": "miPasswordSeguro123"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (200 OK):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Autenticación exitosa",\n  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",\n  "cliente": {\n    "id": 1,\n    "nombre": "Juan Pérez",\n    "email": "juan@example.com"\n  }\n}`),

        // SECCIÓN 2: AUTENTICACIÓN DE ADMINISTRADORES
        new Paragraph({ text: '2. Módulo Autenticación de Administradores', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 } }),

        // 2.1 Registro Admin
        createEndpointHeader('POST', '/api/admin/auth/register'),
        new Paragraph({ text: 'Permite registrar un usuario administrador con asignación de rol.' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "nombre": "Admin Principal",\n  "email": "admin@prestamesta.com",\n  "password": "AdminSuperSeguro123",\n  "rol": "SUPERADMIN"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (201 Created):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Administrador creado exitosamente",\n  "adminId": 1,\n  "rol": "SUPERADMIN"\n}`),

        // 2.2 Login Admin
        createEndpointHeader('POST', '/api/admin/auth/login'),
        new Paragraph({ text: 'Autentica a un administrador y genera su Token JWT con permisos.' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "email": "admin@prestamesta.com",\n  "password": "AdminSuperSeguro123"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (200 OK):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Autenticación de administrador exitosa",\n  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",\n  "admin": {\n    "id": 1,\n    "nombre": "Admin Principal",\n    "email": "admin@prestamesta.com",\n    "rol": "SUPERADMIN"\n  }\n}`),

        // SECCIÓN 3: CRÉDITOS Y PRÉSTAMOS
        new Paragraph({ text: '3. Módulo de Créditos y Préstamos', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 } }),

        // 3.1 Crear Crédito
        createEndpointHeader('POST', '/api/prestamos/creditos'),
        new Paragraph({ text: 'Crea una opción en el catálogo de productos financieros (Requiere Token de Admin).' }),
        new Paragraph({ text: 'Headers:', bold: true }),
        new Paragraph({ text: 'Authorization: Bearer <TOKEN_ADMIN>', font: 'Consolas' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "nombre": "Crédito Personal Express",\n  "monto_minimo": 1000,\n  "monto_maximo": 20000,\n  "tasa_interes_anual": 24,\n  "plazo_meses": 12\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (201 Created):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Tipo de crédito creado con éxito",\n  "creditoId": 1\n}`),

        // 3.2 Listar Créditos
        createEndpointHeader('GET', '/api/prestamos/creditos'),
        new Paragraph({ text: 'Obtiene el catálogo de créditos disponibles para préstamos.' }),
        new Paragraph({ text: 'Headers:', bold: true }),
        new Paragraph({ text: 'Authorization: Bearer <TOKEN_CLIENTE_O_ADMIN>', font: 'Consolas' }),
        new Paragraph({ text: 'Respuesta Exitosa (200 OK):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`[\n  {\n    "id": 1,\n    "nombre": "Crédito Personal Express",\n    "monto_minimo": "1000.00",\n    "monto_maximo": "20000.00",\n    "tasa_interes_anual": "24.00",\n    "plazo_meses": 12,\n    "creado_en": "2026-08-02T02:43:54.000Z"\n  }\n]`),

        // 3.3 Solicitar Préstamo
        createEndpointHeader('POST', '/api/prestamos/solicitar'),
        new Paragraph({ text: 'El cliente solicita un préstamo agregando opcionalmente información del aval.' }),
        new Paragraph({ text: 'Headers:', bold: true }),
        new Paragraph({ text: 'Authorization: Bearer <TOKEN_CLIENTE>', font: 'Consolas' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "credito_id": 1,\n  "monto_solicitado": 10000,\n  "aval": {\n    "nombre": "Roberto Gómez",\n    "telefono": "8711234567",\n    "direccion": "Av. Morelos #450, Centro",\n    "ingreso_mensual": 15000\n  }\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (201 Created):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "Solicitud de préstamo enviada con éxito",\n  "prestamoId": 1,\n  "montoSolicitado": 10000,\n  "montoTotalAPagar": "12400.00",\n  "estado": "PENDIENTE"\n}`),

        // 3.4 Aprobar / Rechazar Préstamo
        createEndpointHeader('PATCH', '/api/prestamos/:id/estado'),
        new Paragraph({ text: 'El administrador aprueba o rechaza la solicitud del cliente.' }),
        new Paragraph({ text: 'Headers:', bold: true }),
        new Paragraph({ text: 'Authorization: Bearer <TOKEN_ADMIN>', font: 'Consolas' }),
        new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "estado": "APROBADO"\n}`),
        new Paragraph({ text: 'Respuesta Exitosa (200 OK):', bold: true, spacing: { before: 100 } }),
        createCodeBlock(`{\n  "mensaje": "El préstamo #1 ha sido aprobado exitosamente."\n}`)
      ]
    }
  ]
});

// Guardar archivo Word
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync('Prestamesta_Documentacion_Endpoints.docx', buffer);
  console.log('¡Documento Word "Prestamesta_Documentacion_Endpoints.docx" generado con éxito!');
});
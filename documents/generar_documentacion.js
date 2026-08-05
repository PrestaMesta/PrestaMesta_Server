// Genera la documentacion Word DIRECTAMENTE desde openapi.yaml (dereferenciado con
// swagger-parser), en vez de tener contenido duplicado a mano. Objetivo: que este archivo
// nunca vuelva a divergir de lo que la API realmente expone (el problema original
// diagnosticado en este repo era exactamente eso: README y este generador describian
// rutas que ya no existian). Si agregas/cambias un endpoint, hazlo en openapi.yaml
// (fuente de verdad) y vuelve a correr `npm run docs:generate`; no edites ejemplos aqui a
// mano salvo el mapa de descripciones de codigos de error y la matriz de roles, que no
// tienen un lugar natural dentro del spec OpenAPI.

const fs = require('fs');
const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');
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
  AlignmentType,
  ShadingType
} = require('docx');

const boxBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
};

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
            children: text.split('\n').map(
              (line) =>
                new Paragraph({
                  children: [new TextRun({ text: line, font: 'Consolas', size: 18, color: '333333' })]
                })
            )
          })
        ]
      })
    ]
  });
}

function createEndpointHeader(method, url) {
  const methodColor = method === 'POST' ? '107C41' : method === 'GET' ? '0078D4' : method === 'PATCH' ? 'D83B01' : '5C2D91';
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [
      new TextRun({ text: `[${method}] `, bold: true, size: 22, color: methodColor, font: 'Consolas' }),
      new TextRun({ text: url, bold: true, size: 22, font: 'Consolas' })
    ]
  });
}

function createSimpleTable(headers, rows) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (texto) =>
        new TableCell({
          shading: { type: ShadingType.SOLID, fill: '2B2B2B' },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: texto, bold: true, color: 'FFFFFF', size: 18 })] })]
        })
    )
  });
  const dataRows = rows.map(
    (fila) =>
      new TableRow({
        children: fila.map(
          (texto) =>
            new TableCell({
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text: String(texto), size: 18 })] })]
            })
        )
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: boxBorder,
    rows: [headerRow, ...dataRows]
  });
}

// Construye un valor de ejemplo a partir de un JSON Schema (ya dereferenciado, sin $ref).
// Prioriza `example` explicito en el schema; si no hay, arma algo razonable segun el tipo.
function schemaToExample(schema) {
  if (!schema) return undefined;
  if (schema.example !== undefined) return schema.example;

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      const valor = schemaToExample(sub);
      if (valor !== undefined) return valor;
    }
  }

  if (Array.isArray(schema.enum)) return schema.enum[0];

  if (schema.type === 'array') {
    return [schemaToExample(schema.items)];
  }

  if (schema.type === 'object' || schema.properties) {
    const objeto = {};
    for (const [clave, subSchema] of Object.entries(schema.properties || {})) {
      const valor = schemaToExample(subSchema);
      if (valor !== undefined) objeto[clave] = valor;
    }
    return objeto;
  }

  if (schema.type === 'string') {
    if (schema.format === 'date-time') return '2026-01-01T00:00:00.000Z';
    if (schema.format === 'email') return 'usuario@ejemplo.com';
    return 'texto';
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof schema.minimum === 'number') {
      return schema.exclusiveMinimum ? schema.minimum + 1 : schema.minimum;
    }
    return schema.type === 'integer' ? 1 : 1000;
  }

  if (schema.type === 'boolean') return true;

  return null;
}

function jsonContent(mediaTypeObject) {
  return mediaTypeObject && mediaTypeObject.content && mediaTypeObject.content['application/json'];
}

function requestExample(operation) {
  const content = jsonContent(operation.requestBody);
  if (!content) return undefined;
  return content.example !== undefined ? content.example : schemaToExample(content.schema);
}

// Varias respuestas de error distintas reusan el mismo $ref a ErrorEnvelope (buena
// practica en el spec: no duplicar el schema), pero eso significa que el `example`
// generico del schema ("INVALID_CREDENTIALS") se repetiria igual en el 409
// EMAIL_ALREADY_EXISTS, el 403 FORBIDDEN, etc. Aqui se ajusta el ejemplo al codigo real de
// CADA respuesta, extrayendolo de su propio texto de `description` (que siempre lo
// menciona, ej. "(codigo EMAIL_ALREADY_EXISTS)"), y se quita `detalles` cuando el codigo
// no es VALIDATION_ERROR (el unico caso donde la API realmente lo llena, ver
// middleware/errorHandler.js).
function responseExample(responseObj) {
  const content = jsonContent(responseObj);
  if (!content) return undefined;

  let ejemplo = content.example !== undefined ? content.example : schemaToExample(content.schema);

  if (ejemplo && typeof ejemplo === 'object' && 'codigo' in ejemplo) {
    const match = /codigo\s+([A-Z_]+)/.exec(responseObj.description || '');
    const codigo = match ? match[1] : ejemplo.codigo;
    ejemplo = { ...ejemplo, codigo, mensaje: DESCRIPCION_CODIGO[codigo] || ejemplo.mensaje };
    if (codigo !== 'VALIDATION_ERROR') delete ejemplo.detalles;
  }

  return ejemplo;
}

function securityText(operation, api) {
  const security = operation.security !== undefined ? operation.security : api.security;
  if (!security || security.length === 0) return 'Público, no requiere autenticación.';
  return 'Requiere autenticación: header Authorization: Bearer <token>. Ver la descripción de este endpoint para el dominio/rol exacto que exige.';
}

function operationBaseUrl(operation, api) {
  const servers = operation.servers || api.servers;
  return (servers && servers[0] && servers[0].url) || '';
}

function renderOperacion(metodo, rutaPath, operation, api) {
  const nodos = [];
  const base = operationBaseUrl(operation, api).replace(/\/$/, ''); // evita "//health/live" cuando el base url es "/"
  nodos.push(createEndpointHeader(metodo.toUpperCase(), `${base}${rutaPath}`));

  if (operation.summary) {
    nodos.push(new Paragraph({ children: [new TextRun({ text: operation.summary, bold: true })], spacing: { after: 40 } }));
  }
  if (operation.description) {
    nodos.push(new Paragraph({ text: operation.description.trim().replace(/\s+/g, ' '), spacing: { after: 80 } }));
  }
  nodos.push(
    new Paragraph({
      children: [new TextRun({ text: securityText(operation, api), italic: true, size: 18 })],
      spacing: { after: 80 }
    })
  );

  if (operation.parameters && operation.parameters.length > 0) {
    nodos.push(new Paragraph({ text: 'Parámetros:', bold: true, spacing: { before: 40 } }));
    for (const parametro of operation.parameters) {
      const ejemplo = parametro.example !== undefined ? parametro.example : schemaToExample(parametro.schema);
      nodos.push(
        new Paragraph({
          text: `${parametro.name} (${parametro.in}, ${parametro.required ? 'requerido' : 'opcional'}) — ejemplo: ${JSON.stringify(ejemplo)}`
        })
      );
    }
  }

  const cuerpoEjemplo = requestExample(operation);
  if (cuerpoEjemplo !== undefined) {
    nodos.push(new Paragraph({ text: 'Body Request (JSON):', bold: true, spacing: { before: 80 } }));
    nodos.push(createCodeBlock(JSON.stringify(cuerpoEjemplo, null, 2)));
  }

  for (const [status, responseObj] of Object.entries(operation.responses || {})) {
    nodos.push(
      new Paragraph({
        text: `Respuesta ${status}${responseObj.description ? ` — ${responseObj.description}` : ''}`,
        bold: true,
        spacing: { before: 80 }
      })
    );
    const ejemploRespuesta = responseExample(responseObj);
    if (ejemploRespuesta !== undefined) {
      nodos.push(createCodeBlock(JSON.stringify(ejemploRespuesta, null, 2)));
    }
  }

  return nodos;
}

const TITULOS_POR_TAG = {
  'auth-cliente': 'Autenticación de Clientes',
  'auth-admin': 'Autenticación de Administradores',
  administradores: 'Gestión de Administradores',
  prestamos: 'Créditos y Préstamos',
  salud: 'Salud / Monitoreo'
};

// No derivable de openapi.yaml (OpenAPI no tiene un lugar natural para una matriz de
// permisos por rol). Fuente de verdad real: middleware/autorizarRoles.js +
// middleware/cargarAdministradorActual.js + cada archivo de routes/. Mantener sincronizado
// a mano con esos archivos si cambia la matriz.
const MATRIZ_ROLES = [
  ['Crear administrador', 'SUPERADMIN', '—', '—', '—'],
  ['Catálogo de créditos: crear', 'SUPERADMIN', 'ANALISTA', '—', '—'],
  ['Catálogo de créditos: leer', 'SUPERADMIN', 'ANALISTA', 'COBRADOR', 'CLIENTE'],
  ['Solicitar préstamo', '—', '—', '—', 'CLIENTE (propio)'],
  ['Aprobar/rechazar préstamo', 'SUPERADMIN', 'ANALISTA', '—', '—'],
  ['Cobros/pagos', 'sin implementar para ningún rol', '', '', '']
];

// Descripciones humanas de los codigos de error estables. La LISTA de codigos se lee de
// openapi.yaml (ErrorEnvelope.properties.codigo.enum); si se agrega un codigo nuevo ahi y
// no se agrega aqui, se muestra un texto generico en vez de fallar.
const DESCRIPCION_CODIGO = {
  INVALID_CREDENTIALS: 'Login fallido: email inexistente, password incorrecto, o (admin) cuenta desactivada. Mismo codigo/mensaje en los tres casos.',
  TOKEN_INVALID: 'Token ausente, malformado, con firma/algoritmo/audience/issuer invalidos, o sin los claims de identidad esperados.',
  TOKEN_EXPIRED: 'El token era valido pero ya expiro (ver JWT_EXPIRES_IN).',
  FORBIDDEN: 'Autenticado correctamente pero sin el rol o tipo de usuario requerido para esta accion.',
  VALIDATION_ERROR: 'El body/params no cumplen el schema: campo faltante, tipo invalido, propiedad desconocida, o fuera de rango.',
  EMAIL_ALREADY_EXISTS: 'Ya existe un cliente o administrador registrado con ese correo.',
  CREDIT_NOT_FOUND: 'El credito_id enviado no existe en el catálogo.',
  LOAN_NOT_FOUND: 'El id de préstamo enviado no existe.',
  INVALID_TRANSITION: 'El préstamo ya no está en estado PENDIENTE (ya fue aprobado o rechazado antes).',
  NOT_FOUND: 'La ruta solicitada no existe.',
  INTERNAL_ERROR: 'Error no esperado del servidor; nunca incluye detalles internos (SQL, Mongo, stack traces).',
  MFA_ENROLLMENT_REQUIRED: 'El MFA no esta activo para esta cuenta: hay que llamar a mfa/enroll + mfa/enroll/confirm antes de continuar (o mfa/verify se llamo sin haber enrolado).',
  MFA_CHALLENGE_REQUIRED: 'El MFA ya esta activo para esta cuenta: hay que llamar a mfa/verify (mfa/enroll no puede re-enrolar sin step-up, no implementado todavia).',
  MFA_ENROLLMENT_INVALID: 'El codigo TOTP enviado a mfa/enroll/confirm es incorrecto, ya expiro, o ya fue utilizado.',
  MFA_INVALID_CODE: 'El codigo TOTP o de recuperacion enviado a mfa/verify es incorrecto.',
  MFA_CODE_REUSED: 'El codigo TOTP enviado a mfa/verify ya fue aceptado antes (mismo paso de 30s); nunca se acepta dos veces.',
  RECOVERY_CODE_ALREADY_USED: 'El codigo de recuperacion enviado a mfa/verify ya fue consumido antes; cada codigo es de un solo uso.',
  MFA_RATE_LIMITED: 'Demasiados intentos contra mfa/verify o mfa/enroll/confirm desde la misma IP en la ventana configurada (MFA_RATE_LIMIT_WINDOW_MS/MFA_RATE_LIMIT_MAX).'
};

async function construirSecciones(api) {
  const secciones = [];
  let numero = 1;

  for (const tag of api.tags || []) {
    const bloques = [];
    for (const [rutaPath, metodos] of Object.entries(api.paths)) {
      for (const [metodo, operation] of Object.entries(metodos)) {
        if (metodo === 'parameters') continue; // path-level shared params, no lo usamos aqui
        if (!operation.tags || !operation.tags.includes(tag.name)) continue;
        bloques.push(...renderOperacion(metodo, rutaPath, operation, api));
      }
    }
    if (bloques.length === 0) continue;

    secciones.push(
      new Paragraph({
        text: `${numero}. ${TITULOS_POR_TAG[tag.name] || tag.name}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 }
      }),
      ...bloques
    );
    numero += 1;
  }

  // Códigos de error estables (lista real leída del spec, descripciones curadas a mano).
  const codigos = (api.components.schemas.ErrorEnvelope.properties.codigo.enum || []).map((codigo) => [
    codigo,
    DESCRIPCION_CODIGO[codigo] || 'Ver el contexto de la respuesta donde aparece.'
  ]);
  secciones.push(
    new Paragraph({
      text: `${numero}. Códigos de error estables`,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 }
    }),
    new Paragraph({
      text: 'Toda respuesta de error usa el mismo envelope: { "mensaje", "codigo", "requestId", "detalles"? }. Nunca incluye mensajes de SQL/Mongo, stack traces, ni detalles de parseo de JWT.',
      spacing: { after: 100 }
    }),
    createSimpleTable(['Código', 'Cuándo ocurre'], codigos)
  );
  numero += 1;

  // Matriz de roles.
  secciones.push(
    new Paragraph({
      text: `${numero}. Matriz de permisos por rol`,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 }
    }),
    createSimpleTable(['Acción', 'SUPERADMIN', 'ANALISTA', 'COBRADOR', 'CLIENTE'], MATRIZ_ROLES)
  );
  numero += 1;

  // Fuera de alcance, tomado de la descripción de EstadoPrestamo en el spec.
  const notaPendiente = (api.components.schemas.EstadoPrestamo.description || '').trim();
  secciones.push(
    new Paragraph({
      text: `${numero}. Fuera de alcance / pendiente de decisión de producto`,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            `${notaPendiente} El modelo Mongo HistorialPago existe pero no está conectado a ningún endpoint.`.replace(
              /\s+/g,
              ' '
            ),
          italic: true,
          size: 20
        })
      ]
    })
  );

  return secciones;
}

async function main() {
  const specPath = path.join(__dirname, '..', 'openapi.yaml');
  const api = await SwaggerParser.dereference(specPath);

  const secciones = await construirSecciones(api);

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: `${api.info.title} — Documentación de Endpoints`,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Versión ${api.info.version}. Generado automáticamente desde openapi.yaml (fuente de verdad, validada con "npm run docs:validate"). ${api.info.description || ''}`.replace(
                  /\s+/g,
                  ' '
                ),
                italic: true,
                size: 20
              })
            ],
            spacing: { after: 300 }
          }),
          ...secciones
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(__dirname, '..', 'Prestamesta_Documentacion_Endpoints.docx'), buffer);
  console.log('¡Documento Word "Prestamesta_Documentacion_Endpoints.docx" generado con éxito!');
}

main().catch((error) => {
  console.error(`Error generando la documentación: ${error.message}`);
  process.exit(1);
});

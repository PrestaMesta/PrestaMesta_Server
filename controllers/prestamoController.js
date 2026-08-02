const pool = require('../config/db.mysql');

// 1. [ADMIN] Crear un tipo de crédito en el catálogo
exports.crearCredito = async (req, res) => {
  const { nombre, monto_minimo, monto_maximo, tasa_interes_anual, plazo_meses } = req.body;

  if (!nombre || !monto_minimo || !monto_maximo || !tasa_interes_anual || !plazo_meses) {
    return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO creditos (nombre, monto_minimo, monto_maximo, tasa_interes_anual, plazo_meses) VALUES (?, ?, ?, ?, ?)',
      [nombre, monto_minimo, monto_maximo, tasa_interes_anual, plazo_meses]
    );

    res.status(201).json({ mensaje: 'Tipo de crédito creado con éxito', creditoId: result.insertId });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear el crédito', error: error.message });
  }
};

// 2. [CLIENTE / ADMIN] Listar tipos de créditos disponibles
exports.obtenerCreditos = async (req, res) => {
  try {
    const [creditos] = await pool.query('SELECT * FROM creditos');
    res.json(creditos);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al consultar créditos', error: error.message });
  }
};

// 3. [CLIENTE] Solicitar un préstamo con opción de aval
exports.solicitarPrestamo = async (req, res) => {
  const cliente_id = req.usuario.id; // Extraído del JWT
  const { credito_id, monto_solicitado, aval } = req.body;

  if (!credito_id || !monto_solicitado) {
    return res.status(400).json({ mensaje: 'El tipo de crédito y el monto son obligatorios.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Validar crédito en catálogo
    const [creditos] = await connection.query('SELECT * FROM creditos WHERE id = ?', [credito_id]);
    if (creditos.length === 0) {
      await connection.rollback();
      return res.status(404).json({ mensaje: 'Tipo de crédito no encontrado.' });
    }

    const credito = creditos[0];

    if (monto_solicitado < credito.monto_minimo || monto_solicitado > credito.monto_maximo) {
      await connection.rollback();
      return res.status(400).json({ 
        mensaje: `El monto debe estar entre $${credito.monto_minimo} y $${credito.monto_maximo}` 
      });
    }

    // Calcular el total a pagar (Interés simple)
    const tasaDecimal = credito.tasa_interes_anual / 100;
    const interesGenerado = monto_solicitado * tasaDecimal * (credito.plazo_meses / 12);
    const monto_total_a_pagar = parseFloat(monto_solicitado) + interesGenerado;

    // Registrar solicitud
    const [prestamoResult] = await connection.query(
      `INSERT INTO prestamos (cliente_id, credito_id, monto_solicitado, monto_total_a_pagar, saldo_pendiente) 
       VALUES (?, ?, ?, ?, ?)`,
      [cliente_id, credito_id, monto_solicitado, monto_total_a_pagar, monto_total_a_pagar]
    );

    const prestamoId = prestamoResult.insertId;

    // Registrar Aval si se incluyó en la petición
    if (aval && aval.nombre && aval.telefono) {
      await connection.query(
        `INSERT INTO avales (prestamo_id, nombre, telefono, direccion, ingreso_mensual) 
         VALUES (?, ?, ?, ?, ?)`,
        [prestamoId, aval.nombre, aval.telefono, aval.direccion || null, aval.ingreso_mensual || 0]
      );
    }

    await connection.commit();

    res.status(201).json({
      mensaje: 'Solicitud de préstamo enviada con éxito',
      prestamoId,
      montoSolicitado: monto_solicitado,
      montoTotalAPagar: monto_total_a_pagar.toFixed(2),
      estado: 'PENDIENTE'
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ mensaje: 'Error al procesar la solicitud', error: error.message });
  } finally {
    connection.release();
  }
};

// 4. [ADMIN] Aprobar o rechazar préstamo
exports.cambiarEstadoPrestamo = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body; // 'APROBADO' o 'RECHAZADO'

  if (!['APROBADO', 'RECHAZADO'].includes(estado)) {
    return res.status(400).json({ mensaje: 'Estado no válido. Use APROBADO o RECHAZADO.' });
  }

  try {
    const fechaAprobacion = estado === 'APROBADO' ? new Date() : null;

    const [result] = await pool.query(
      'UPDATE prestamos SET estado = ?, fecha_aprobacion = ? WHERE id = ?',
      [estado, fechaAprobacion, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Préstamo no encontrado.' });
    }

    res.json({ mensaje: `El préstamo #${id} ha sido ${estado.toLowerCase()} exitosamente.` });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar el estado del préstamo', error: error.message });
  }
};
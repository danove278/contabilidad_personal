/**
 * Aplicación Web de Registro de Gastos Personales
 * Backend - Google Apps Script
 *
 * CONFIGURACIÓN INICIAL:
 * El ID del Google Sheet NO se guarda en el código por seguridad.
 * Debes configurarlo una sola vez ejecutando la función:
 *
 *     configurarSpreadsheetId()
 *
 * O manualmente desde: Configuración del proyecto > Propiedades del script
 * con la clave: SPREADSHEET_ID
 */

/**
 * Obtiene el ID del Google Sheet desde las propiedades del script
 */
function getSpreadsheetId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error(
      'SPREADSHEET_ID no configurado. Ejecuta configurarSpreadsheetId() una vez ' +
      'o agrégalo manualmente en Configuración del proyecto > Propiedades del script.'
    );
  }
  return id;
}

/**
 * Configura el SPREADSHEET_ID en las propiedades del script.
 * Ejecuta esta función UNA SOLA VEZ para guardar el ID de tu Google Sheet.
 *
 * PASOS:
 * 1. Edita la variable SPREADSHEET_ID_A_CONFIGURAR abajo con tu ID real
 * 2. Selecciona esta función en el dropdown y haz clic en Ejecutar
 * 3. Después puedes volver a poner el placeholder en la variable (el ID ya queda guardado)
 */
function configurarSpreadsheetId() {
  var SPREADSHEET_ID_A_CONFIGURAR = 'PON_AQUI_TU_ID_DE_SPREADSHEET';

  if (SPREADSHEET_ID_A_CONFIGURAR === 'PON_AQUI_TU_ID_DE_SPREADSHEET') {
    throw new Error('Edita la variable SPREADSHEET_ID_A_CONFIGURAR con tu ID real antes de ejecutar esta función.');
  }

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', SPREADSHEET_ID_A_CONFIGURAR);
  Logger.log('SPREADSHEET_ID configurado correctamente.');
}

var MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

var HEADERS = [
  'Timestamp', 'Fecha', 'Categoría', 'Subcategoría',
  'Monto', 'Descripción', 'Método de Pago', 'Notas'
];

var HEADERS_TARJETAS = ['Últimos4', 'Tipo', 'Alias'];
var HEADERS_ELEMENTOS = ['Elemento', 'Categoría', 'Subcategoría'];

var CATEGORIAS = ['Ingresos', 'Ahorro', 'Deudas', 'Gastos Fijos', 'Gastos Variables'];

// Categorías donde tiene sentido tener elementos (comercios/detalles).
// Los emails del banco solo autoregistran movimientos en estas.
var CATEGORIAS_CON_ELEMENTOS = ['Gastos Fijos', 'Gastos Variables'];

var TIPOS_TARJETA = ['Débito', 'Crédito'];

var HEADERS_PENDIENTES = ['Fecha', 'Monto', 'Elemento (raw)', 'Últimos4', 'Motivo', 'EmailID', 'Thread URL'];

var HEADERS_DEUDAS = ['Descripción', 'Monto original', 'Pagado', 'Restante', 'Pago mensual', 'Día del mes', 'Activa', 'Último pago', 'Destinatario'];

// Destino automático de los pagos mensuales de deudas
var CATEGORIA_PAGO_DEUDA = 'Gastos Fijos';
var SUBCAT_PAGO_DEUDA = 'Pago Deuda';

var HEADERS_4PAGOS = ['Número plan', 'Fecha detectada', 'Monto total', 'Comercio', 'Cuenta origen', 'Cuota', 'Primer pago', 'Estado', 'Cuotas pagadas', 'EmailID', 'Categoría', 'Subcategoría', 'Elemento', 'Próximo pago'];

var HEADERS_RECURRENTES = ['Descripción', 'Categoría', 'Subcategoría', 'Monto', 'Día del mes', 'Método pago', 'Activo', 'Último pago'];

// Destino de depósitos directos autoregistrados
var CATEGORIA_DEPOSITO = 'Ingresos';
var SUBCAT_DEPOSITO = 'Depósito directo';

// Meses en español completos (para "primer pago de $X agosto 16, 2026")
var MESES_ES_LARGO = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

/* ============================================================
   CONFIGURACIÓN DEL AUTOREGISTRO POR EMAIL
   ============================================================

   El script SOLO lee los emails que matchean GMAIL_QUERY.
   Cualquier email fuera de ese query es invisible para el script.

   Para que funcione, DEBES crear en Gmail:
     1. Un label llamado exactamente "Banco/Alertas"
     2. Un filtro con "De: no.reply.alerts@chase.com" que aplique
        ese label automáticamente

   Ver INSTRUCCIONES.md para los pasos exactos.
   ============================================================ */

// El bot procesa cualquier email en Banco/Alertas que NO tenga el label
// Banco/Procesado. Abrir un email en Gmail ya no lo saca del pipeline —
// solo el bot puede marcarlo como procesado (aplica LABEL_PROCESADO al final).
var GMAIL_QUERY = 'label:Banco/Alertas -label:Banco/Procesado newer_than:7d';
var LABEL_PROCESADO = 'Banco/Procesado';

// Verificación defensiva del remitente real antes de parsear
var REMITENTES_PERMITIDOS = ['chase.com', 'apple.com', 'google.com', 'chevron'];

// Método de pago cuando el recibo de Chevron no trae tarjeta mapeada
var CHEVRON_METODO_DEFAULT = 'Tarjeta Crédito';

// Dedup: totales Apple recientes para saltar el cargo consolidado de Chase (APPLE.COM/BILL)
var APPLE_CHARGES_KEY = 'APPLE_CHARGES';
var APPLE_CHARGES_MAX = 30;

// Dedup: totales Google Play recientes para saltar el cargo consolidado de Chase (GOOGLE *X)
var GOOGLE_CHARGES_KEY = 'GOOGLE_CHARGES';
var GOOGLE_CHARGES_MAX = 30;

// Diccionario para parsear meses abreviados en español (Chase manda en español)
var MESES_ES_ABR = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11
};

// Subcategorías POR DEFECTO (solo se usan la primera vez para inicializar la hoja Config)
var SUBCATEGORIAS_DEFAULT = {
  'Ingresos': ['Salario', 'Freelance', 'Inversiones', 'Otros'],
  'Ahorro': ['Fondo emergencia', 'Inversión', 'Meta específica'],
  'Deudas': ['Préstamo', 'Tarjeta crédito', 'Hipoteca'],
  'Gastos Fijos': ['Alquiler', 'Servicios', 'Seguro', 'Suscripciones', 'Transporte'],
  'Gastos Variables': ['Comida', 'Entretenimiento', 'Ropa', 'Salud', 'Educación']
};

var COLORES = {
  'Ingresos': '#27ae60',
  'Ahorro': '#2980b9',
  'Deudas': '#e74c3c',
  'Gastos Fijos': '#f39c12',
  'Gastos Variables': '#e67e22'
};

/**
 * Sirve la página HTML cuando se accede a la Web App
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Registro de Gastos')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Obtiene o crea la hoja del mes correspondiente a una fecha
 */
function obtenerHojaMes(ss, fechaStr) {
  var partes = fechaStr.split('-');
  var anio = parseInt(partes[0]);
  var mes = parseInt(partes[1]) - 1;
  var nombreHoja = MESES[mes] + ' ' + anio;

  var sheet = ss.getSheetByName(nombreHoja);
  if (!sheet) {
    sheet = ss.insertSheet(nombreHoja);
    formatearHoja(sheet);
  }
  return sheet;
}

/**
 * Obtiene o crea la hoja maestra "Movimientos"
 */
function obtenerHojaMovimientos(ss) {
  var sheet = ss.getSheetByName('Movimientos');
  if (!sheet) {
    sheet = ss.insertSheet('Movimientos');
    formatearHoja(sheet);
  }
  return sheet;
}

/**
 * Obtiene o crea la hoja "Config" donde se guardan las subcategorías
 */
function obtenerHojaConfig(ss) {
  var sheet = ss.getSheetByName('Config');
  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange(1, 1, 1, 2).setValues([['Categoría', 'Subcategoría']]);
    var headerRange = sheet.getRange(1, 1, 1, 2);
    headerRange.setFontWeight('bold').setBackground('#4a90d9').setFontColor('white')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 200);

    // Poblar con los valores por defecto
    var filas = [];
    CATEGORIAS.forEach(function(cat) {
      (SUBCATEGORIAS_DEFAULT[cat] || []).forEach(function(sub) {
        filas.push([cat, sub]);
      });
    });
    if (filas.length > 0) {
      sheet.getRange(2, 1, filas.length, 2).setValues(filas);
    }
  }
  return sheet;
}

/**
 * Retorna las subcategorías actuales desde la hoja Config
 */
function obtenerSubcategorias() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaConfig(ss);
  var resultado = {};
  CATEGORIAS.forEach(function(cat) { resultado[cat] = []; });

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return resultado;

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  data.forEach(function(fila) {
    var cat = String(fila[0]).trim();
    var sub = String(fila[1]).trim();
    if (cat && sub && resultado[cat] !== undefined) {
      resultado[cat].push(sub);
    }
  });
  return resultado;
}

/**
 * Agrega una subcategoría a una categoría
 */
function agregarSubcategoria(categoria, subcategoria) {
  try {
    categoria = String(categoria || '').trim();
    subcategoria = String(subcategoria || '').trim();

    if (!categoria || !subcategoria) {
      return { success: false, message: 'Faltan datos' };
    }
    if (CATEGORIAS.indexOf(categoria) === -1) {
      return { success: false, message: 'Categoría no válida' };
    }

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaConfig(ss);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === categoria &&
          String(data[i][1]).trim().toLowerCase() === subcategoria.toLowerCase()) {
        return { success: false, message: 'Esa subcategoría ya existe' };
      }
    }

    sheet.appendRow([categoria, subcategoria]);
    _refreshDashboardSilencioso();
    return { success: true, message: 'Subcategoría agregada', subcategorias: obtenerSubcategorias() };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

/**
 * Intenta regenerar el Dashboard. Si falla, no propaga el error
 * (la operación principal ya se hizo, no queremos perder el trabajo).
 */
function _refreshDashboardSilencioso() {
  try { crearDashboard(); } catch (e) { Logger.log('Dashboard refresh falló: ' + e.message); }
}

/**
 * Regenera el Dashboard bajo demanda (llamado desde el frontend).
 */
function regenerarDashboard() {
  try {
    crearDashboard();
    return { success: true, message: 'Dashboard regenerado' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

/**
 * Elimina una subcategoría de una categoría
 */
function eliminarSubcategoria(categoria, subcategoria) {
  try {
    categoria = String(categoria || '').trim();
    subcategoria = String(subcategoria || '').trim();

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaConfig(ss);
    var data = sheet.getDataRange().getValues();

    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === categoria &&
          String(data[i][1]).trim() === subcategoria) {
        sheet.deleteRow(i + 1);
        _refreshDashboardSilencioso();
        return { success: true, message: 'Subcategoría eliminada', subcategorias: obtenerSubcategorias() };
      }
    }

    return { success: false, message: 'Subcategoría no encontrada' };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

/**
 * Renombra una subcategoría en Config, Elementos y todos los Movimientos históricos.
 * Actualiza el Dashboard al final.
 */
function renombrarSubcategoria(categoria, subOld, subNew) {
  try {
    categoria = String(categoria || '').trim();
    subOld = String(subOld || '').trim();
    subNew = String(subNew || '').trim();

    if (!categoria || !subOld || !subNew) return { success: false, message: 'Faltan datos' };
    if (subOld === subNew) return { success: false, message: 'El nombre no cambió' };
    if (CATEGORIAS.indexOf(categoria) === -1) return { success: false, message: 'Categoría no válida' };

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var config = obtenerHojaConfig(ss);
    var data = config.getDataRange().getValues();

    var filaOld = -1;
    for (var i = 1; i < data.length; i++) {
      var c = String(data[i][0]).trim();
      var s = String(data[i][1]).trim();
      if (c === categoria && s === subOld) filaOld = i;
      if (c === categoria && s.toLowerCase() === subNew.toLowerCase() && s !== subOld) {
        return { success: false, message: 'Ya existe una subcategoría con ese nombre' };
      }
    }
    if (filaOld === -1) return { success: false, message: 'Subcategoría no encontrada' };

    // Actualizar Config
    config.getRange(filaOld + 1, 2).setValue(subNew);

    // Actualizar Elementos (columna Subcategoría = índice 2)
    var elem = obtenerHojaElementos(ss);
    var eLast = elem.getLastRow();
    if (eLast >= 2) {
      var eData = elem.getRange(2, 1, eLast - 1, HEADERS_ELEMENTOS.length).getValues();
      var eChanges = 0;
      eData.forEach(function(fila) {
        if (String(fila[1]).trim() === categoria && String(fila[2]).trim() === subOld) {
          fila[2] = subNew;
          eChanges++;
        }
      });
      if (eChanges > 0) elem.getRange(2, 1, eLast - 1, HEADERS_ELEMENTOS.length).setValues(eData);
    }

    // Actualizar Movimientos + hojas mensuales
    var actualizadosMov = _actualizarSubcategoriaEnMovimientos(categoria, subOld, subNew);

    _refreshDashboardSilencioso();
    return {
      success: true,
      message: 'Renombrada — ' + actualizadosMov + ' movimiento(s) actualizado(s)',
      subcategorias: obtenerSubcategorias()
    };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

/**
 * Actualiza la columna Subcategoría en Movimientos y en cada hoja mensual.
 * Retorna el total de filas modificadas.
 */
function _actualizarSubcategoriaEnMovimientos(categoria, subOld, subNew) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheets = ss.getSheets();
  var total = 0;
  sheets.forEach(function(sh) {
    var nombre = sh.getName();
    var esMovOMes = nombre === 'Movimientos' ||
      MESES.some(function(m) { return nombre.indexOf(m + ' ') === 0; });
    if (!esMovOMes) return;
    var last = sh.getLastRow();
    if (last < 2) return;
    // Columnas C=Categoría (3), D=Subcategoría (4)
    var rng = sh.getRange(2, 3, last - 1, 2);
    var data = rng.getValues();
    var changes = 0;
    data.forEach(function(fila) {
      if (String(fila[0]).trim() === categoria && String(fila[1]).trim() === subOld) {
        fila[1] = subNew;
        changes++;
      }
    });
    if (changes > 0) {
      rng.setValues(data);
      total += changes;
    }
  });
  return total;
}

/* ============================================================
   HOJA "Tarjetas" — últimos 4 dígitos y tipo (Débito/Crédito)
   ============================================================ */

function obtenerHojaTarjetas(ss) {
  var sheet = ss.getSheetByName('Tarjetas');
  if (!sheet) {
    sheet = ss.insertSheet('Tarjetas');
    sheet.getRange(1, 1, 1, HEADERS_TARJETAS.length).setValues([HEADERS_TARJETAS]);
    sheet.getRange(1, 1, 1, HEADERS_TARJETAS.length)
      .setFontWeight('bold').setBackground('#4a90d9').setFontColor('white')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 200);
  }
  return sheet;
}

function obtenerTarjetas() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaTarjetas(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_TARJETAS.length).getValues();
  return data.filter(function(f) { return String(f[0]).trim() !== ''; }).map(function(f) {
    return {
      ultimos4: String(f[0]).trim(),
      tipo: String(f[1]).trim(),
      alias: String(f[2] || '').trim()
    };
  });
}

function agregarTarjeta(ultimos4, tipo, alias) {
  try {
    ultimos4 = String(ultimos4 || '').trim();
    tipo = String(tipo || '').trim();
    alias = String(alias || '').trim();

    if (!/^\d{4}$/.test(ultimos4)) {
      return { success: false, message: 'Los últimos 4 dígitos deben ser exactamente 4 números' };
    }
    if (TIPOS_TARJETA.indexOf(tipo) === -1) {
      return { success: false, message: 'Tipo inválido (usa Débito o Crédito)' };
    }

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaTarjetas(ss);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === ultimos4) {
        return { success: false, message: 'Ya existe una tarjeta con esos últimos 4 dígitos' };
      }
    }

    sheet.appendRow([ultimos4, tipo, alias]);

    // Reprocesar pendientes: quizás esta tarjeta desbloquea algunos
    var pend = { procesados: 0 };
    try { pend = procesarPendientes(); } catch (e) { /* silencioso */ }
    var msg = 'Tarjeta agregada';
    if (pend.procesados > 0) msg += ' — ' + pend.procesados + ' pendiente(s) registrado(s)';

    return { success: true, message: msg, tarjetas: obtenerTarjetas() };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

function eliminarTarjeta(ultimos4) {
  try {
    ultimos4 = String(ultimos4 || '').trim();

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaTarjetas(ss);
    var data = sheet.getDataRange().getValues();

    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === ultimos4) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Tarjeta eliminada', tarjetas: obtenerTarjetas() };
      }
    }

    return { success: false, message: 'Tarjeta no encontrada' };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

/**
 * Actualiza tipo y alias de una tarjeta (identificada por últimos4).
 * No toca Movimientos históricos (el alias en Notas es informativo).
 */
function renombrarTarjeta(ultimos4, tipoNuevo, aliasNuevo) {
  try {
    ultimos4 = String(ultimos4 || '').trim();
    tipoNuevo = String(tipoNuevo || '').trim();
    aliasNuevo = String(aliasNuevo || '').trim();

    if (!ultimos4) return { success: false, message: 'Faltan datos' };
    if (TIPOS_TARJETA.indexOf(tipoNuevo) === -1) return { success: false, message: 'Tipo no válido' };

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaTarjetas(ss);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === ultimos4) {
        sheet.getRange(i + 1, 2).setValue(tipoNuevo);
        sheet.getRange(i + 1, 3).setValue(aliasNuevo);
        return { success: true, message: 'Tarjeta actualizada', tarjetas: obtenerTarjetas() };
      }
    }
    return { success: false, message: 'Tarjeta no encontrada' };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

/* ============================================================
   HOJA "Elementos" — sub-items debajo de una subcategoría
   (ej: Crunchyroll bajo Gastos Fijos > Suscripciones)
   ============================================================ */

function obtenerHojaElementos(ss) {
  var sheet = ss.getSheetByName('Elementos');
  if (!sheet) {
    sheet = ss.insertSheet('Elementos');
    sheet.getRange(1, 1, 1, HEADERS_ELEMENTOS.length).setValues([HEADERS_ELEMENTOS]);
    sheet.getRange(1, 1, 1, HEADERS_ELEMENTOS.length)
      .setFontWeight('bold').setBackground('#4a90d9').setFontColor('white')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 200);
  }
  return sheet;
}

/**
 * Retorna elementos agrupados: { categoria: { subcategoria: [elemento, ...] } }
 */
function obtenerElementos() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaElementos(ss);
  var resultado = {};
  CATEGORIAS_CON_ELEMENTOS.forEach(function(cat) { resultado[cat] = {}; });

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return resultado;

  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_ELEMENTOS.length).getValues();
  data.forEach(function(fila) {
    var elemento = String(fila[0]).trim();
    var cat = String(fila[1]).trim();
    var sub = String(fila[2]).trim();
    if (!elemento || !cat || !sub) return;
    if (!resultado[cat]) resultado[cat] = {};
    if (!resultado[cat][sub]) resultado[cat][sub] = [];
    resultado[cat][sub].push(elemento);
  });
  return resultado;
}

function agregarElemento(categoria, subcategoria, elemento, recurrenteConfig) {
  try {
    categoria = String(categoria || '').trim();
    subcategoria = String(subcategoria || '').trim();
    elemento = String(elemento || '').trim();

    if (!categoria || !subcategoria || !elemento) {
      return { success: false, message: 'Faltan datos' };
    }
    if (CATEGORIAS_CON_ELEMENTOS.indexOf(categoria) === -1) {
      return { success: false, message: 'Solo se pueden agregar elementos en Gastos Fijos o Variables' };
    }

    // Validar que la subcategoría exista en la hoja Config
    var subs = obtenerSubcategorias();
    if (!subs[categoria] || subs[categoria].indexOf(subcategoria) === -1) {
      return { success: false, message: 'La subcategoría no existe' };
    }

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaElementos(ss);
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === elemento.toLowerCase() &&
          String(data[i][1]).trim() === categoria &&
          String(data[i][2]).trim() === subcategoria) {
        return { success: false, message: 'Ese elemento ya existe en esa subcategoría' };
      }
    }

    sheet.appendRow([elemento, categoria, subcategoria]);

    // Si viene config de recurrente, crear el pago recurrente vinculado
    var recResp = null;
    if (recurrenteConfig && recurrenteConfig.esRecurrente) {
      recResp = agregarRecurrente(
        elemento, categoria, subcategoria,
        recurrenteConfig.monto,
        recurrenteConfig.diaMes,
        recurrenteConfig.metodoPago || 'Transferencia'
      );
    }

    // Reprocesar pendientes: quizás este elemento desbloquea algunos
    var pend = { procesados: 0 };
    try { pend = procesarPendientes(); } catch (e) { /* silencioso */ }
    var msg = 'Elemento agregado';
    if (recResp && recResp.success) msg += ' + recurrente';
    else if (recResp && !recResp.success) msg += ' (error creando recurrente: ' + recResp.message + ')';
    if (pend.procesados > 0) msg += ' — ' + pend.procesados + ' pendiente(s) registrado(s)';

    return {
      success: true,
      message: msg,
      elementos: obtenerElementos(),
      recurrentes: recResp ? recResp.recurrentes : undefined
    };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

function eliminarElemento(categoria, subcategoria, elemento) {
  try {
    categoria = String(categoria || '').trim();
    subcategoria = String(subcategoria || '').trim();
    elemento = String(elemento || '').trim();

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaElementos(ss);
    var data = sheet.getDataRange().getValues();

    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === elemento &&
          String(data[i][1]).trim() === categoria &&
          String(data[i][2]).trim() === subcategoria) {
        sheet.deleteRow(i + 1);

        // Auto-cleanup: si existe un recurrente con la misma descripción, borrarlo también
        var recBorrado = false;
        try {
          var recResp = eliminarRecurrente(elemento);
          if (recResp && recResp.success) recBorrado = true;
        } catch (e) { /* silencioso */ }

        return {
          success: true,
          message: 'Elemento eliminado' + (recBorrado ? ' (y su recurrente)' : ''),
          elementos: obtenerElementos(),
          recurrentes: recBorrado ? obtenerRecurrentes() : undefined
        };
      }
    }

    return { success: false, message: 'Elemento no encontrado' };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

/**
 * Renombra un elemento en la hoja Elementos y en los Movimientos históricos
 * (solo aquellos donde la descripción coincide exactamente con el nombre viejo).
 */
function renombrarElemento(categoria, subcategoria, elemOld, elemNew) {
  try {
    categoria = String(categoria || '').trim();
    subcategoria = String(subcategoria || '').trim();
    elemOld = String(elemOld || '').trim();
    elemNew = String(elemNew || '').trim();

    if (!categoria || !subcategoria || !elemOld || !elemNew) {
      return { success: false, message: 'Faltan datos' };
    }
    if (elemOld === elemNew) return { success: false, message: 'El nombre no cambió' };

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaElementos(ss);
    var data = sheet.getDataRange().getValues();

    var filaOld = -1;
    for (var i = 1; i < data.length; i++) {
      var e = String(data[i][0]).trim();
      var c = String(data[i][1]).trim();
      var s = String(data[i][2]).trim();
      if (c === categoria && s === subcategoria && e === elemOld) filaOld = i;
      if (c === categoria && s === subcategoria &&
          e.toLowerCase() === elemNew.toLowerCase() && e !== elemOld) {
        return { success: false, message: 'Ya existe un elemento con ese nombre' };
      }
    }
    if (filaOld === -1) return { success: false, message: 'Elemento no encontrado' };

    sheet.getRange(filaOld + 1, 1).setValue(elemNew);

    var actualizados = _actualizarDescripcionEnMovimientos(categoria, subcategoria, elemOld, elemNew);

    // Si hay un recurrente vinculado, renombrarlo también
    var recRenombrado = false;
    try {
      var ssR = SpreadsheetApp.openById(getSpreadsheetId());
      var recSheet = obtenerHojaRecurrentes(ssR);
      var recData = recSheet.getDataRange().getValues();
      for (var j = 1; j < recData.length; j++) {
        if (String(recData[j][0]).trim() === elemOld) {
          recSheet.getRange(j + 1, 1).setValue(elemNew);
          recRenombrado = true;
          break;
        }
      }
    } catch (e) { /* silencioso */ }

    return {
      success: true,
      message: 'Renombrado — ' + actualizados + ' movimiento(s) actualizado(s)' + (recRenombrado ? ' + recurrente' : ''),
      elementos: obtenerElementos(),
      recurrentes: recRenombrado ? obtenerRecurrentes() : undefined
    };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

/**
 * Actualiza Movimientos.Descripción para las filas que matchean cat + sub + descripcion=elemOld.
 * Match case-insensitive en descripción para tolerar variaciones.
 */
function _actualizarDescripcionEnMovimientos(categoria, subcategoria, elemOld, elemNew) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheets = ss.getSheets();
  var elemOldLower = elemOld.toLowerCase();
  var total = 0;
  sheets.forEach(function(sh) {
    var nombre = sh.getName();
    var esMovOMes = nombre === 'Movimientos' ||
      MESES.some(function(m) { return nombre.indexOf(m + ' ') === 0; });
    if (!esMovOMes) return;
    var last = sh.getLastRow();
    if (last < 2) return;
    // C=Categoría (3), D=Subcategoría (4), F=Descripción (6). Leemos C..F.
    var rng = sh.getRange(2, 3, last - 1, 4);
    var data = rng.getValues();
    var changes = 0;
    data.forEach(function(fila) {
      if (String(fila[0]).trim() === categoria &&
          String(fila[1]).trim() === subcategoria &&
          String(fila[3]).trim().toLowerCase() === elemOldLower) {
        fila[3] = elemNew;
        changes++;
      }
    });
    if (changes > 0) {
      rng.setValues(data);
      total += changes;
    }
  });
  return total;
}

/* ============================================================
   HOJA "Pendientes" — emails que no se pudieron autoregistrar
   ============================================================ */

function obtenerHojaPendientes(ss) {
  var sheet = ss.getSheetByName('Pendientes');
  if (!sheet) {
    sheet = ss.insertSheet('Pendientes');
    sheet.getRange(1, 1, 1, HEADERS_PENDIENTES.length).setValues([HEADERS_PENDIENTES]);
    sheet.getRange(1, 1, 1, HEADERS_PENDIENTES.length)
      .setFontWeight('bold').setBackground('#e67e22').setFontColor('white')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 90);
    sheet.setColumnWidth(3, 220);
    sheet.setColumnWidth(4, 90);
    sheet.setColumnWidth(5, 260);
    sheet.setColumnWidth(6, 200);
    sheet.setColumnWidth(7, 200);
  }
  return sheet;
}

function contarPendientes() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaPendientes(ss);
  return Math.max(0, sheet.getLastRow() - 1);
}

/**
 * Aplica formato a una hoja nueva
 */
function formatearHoja(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a90d9');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 200);
  sheet.setColumnWidth(7, 140);
  sheet.setColumnWidth(8, 200);
}

/**
 * Registra un nuevo movimiento (en hoja del mes + hoja Movimientos)
 */
function registrarMovimiento(datos) {
  try {
    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var hojaMes = obtenerHojaMes(ss, datos.fecha);
    var hojaMov = obtenerHojaMovimientos(ss);

    var timestamp = new Date();
    var fechaDate = new Date(datos.fecha + 'T00:00:00');
    var fila = [
      timestamp,
      fechaDate,
      datos.categoria,
      datos.subcategoria || '',
      parseFloat(datos.monto),
      datos.descripcion || '',
      datos.metodoPago || '',
      datos.notas || ''
    ];

    [hojaMes, hojaMov].forEach(function(sheet) {
      sheet.appendRow(fila);
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
      sheet.getRange(lastRow, 2).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(lastRow, 5).setNumberFormat('$#,##0.00');
    });

    return { success: true, message: 'Registro guardado correctamente' };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
}

/**
 * Retorna las categorías disponibles
 */
function obtenerCategorias() {
  return [
    { valor: 'Ingresos', label: 'Ingresos', color: '#27ae60' },
    { valor: 'Ahorro', label: 'Ahorro', color: '#2980b9' },
    { valor: 'Deudas', label: 'Deudas', color: '#e74c3c' },
    { valor: 'Gastos Fijos', label: 'Gastos Fijos', color: '#f39c12' },
    { valor: 'Gastos Variables', label: 'Gastos Variables', color: '#e67e22' }
  ];
}

/**
 * Retorna los métodos de pago disponibles
 */
function obtenerMetodosPago() {
  return [
    'Efectivo',
    'Tarjeta Débito',
    'Tarjeta Crédito',
    'Transferencia',
    'Otro'
  ];
}

/**
 * Configuración inicial: crea la hoja del mes actual
 */
function configurarHoja() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var hoy = new Date();
  var fechaStr = Utilities.formatDate(hoy, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  obtenerHojaMes(ss, fechaStr);
  obtenerHojaMovimientos(ss);
  obtenerHojaConfig(ss);
  obtenerHojaTarjetas(ss);
  obtenerHojaElementos(ss);
  obtenerHojaPendientes(ss);
  obtenerHojaDeudas(ss);
  obtenerHoja4Pagos(ss);
  obtenerHojaRecurrentes(ss);
  Logger.log('Hojas configuradas correctamente.');
}

/**
 * Migra registros existentes de las hojas mensuales a la hoja Movimientos.
 * Útil si ya tienes datos antes de crear la hoja Movimientos.
 */
function migrarAHojaMovimientos() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var hojaMov = obtenerHojaMovimientos(ss);

  // Limpiar Movimientos (mantener encabezados)
  if (hojaMov.getLastRow() > 1) {
    hojaMov.getRange(2, 1, hojaMov.getLastRow() - 1, HEADERS.length).clearContent();
  }

  var hojas = ss.getSheets();
  var totalMigrado = 0;

  hojas.forEach(function(sheet) {
    var nombre = sheet.getName();
    // Identificar hojas de mes (ej: "Marzo 2026")
    var esMes = MESES.some(function(m) { return nombre.indexOf(m + ' ') === 0; });
    if (!esMes) return;

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var datos = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    datos.forEach(function(fila) {
      if (fila[1]) { // tiene fecha
        hojaMov.appendRow(fila);
        var nr = hojaMov.getLastRow();
        hojaMov.getRange(nr, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
        hojaMov.getRange(nr, 2).setNumberFormat('dd/MM/yyyy');
        hojaMov.getRange(nr, 5).setNumberFormat('$#,##0.00');
        totalMigrado++;
      }
    });
  });

  Logger.log('Migración completada. Registros copiados: ' + totalMigrado);
}

/**
 * Crea o reemplaza la hoja Dashboard con resumen por mes/año.
 */
function crearDashboard() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());

  // Asegurar que existe Movimientos
  obtenerHojaMovimientos(ss);

  // Eliminar Dashboard existente
  var existente = ss.getSheetByName('Dashboard');
  if (existente) ss.deleteSheet(existente);

  var dash = ss.insertSheet('Dashboard', 0);
  var mesesLista = '{"Enero";"Febrero";"Marzo";"Abril";"Mayo";"Junio";"Julio";"Agosto";"Septiembre";"Octubre";"Noviembre";"Diciembre"}';

  // Título
  dash.getRange('A1:D1').merge()
    .setValue('DASHBOARD - Registro de Gastos')
    .setBackground('#4a90d9').setFontColor('white')
    .setFontWeight('bold').setFontSize(14)
    .setHorizontalAlignment('center');
  dash.setRowHeight(1, 36);

  // Filtros Mes y Año
  dash.getRange('A3').setValue('Mes seleccionado:').setFontWeight('bold');
  dash.getRange('B3').setValue(MESES[new Date().getMonth()]);
  dash.getRange('B3').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(MESES, true).build()
  );
  dash.getRange('B3').setBackground('#eaf3fb').setFontWeight('bold');

  dash.getRange('A4').setValue('Año:').setFontWeight('bold');
  dash.getRange('B4').setValue(new Date().getFullYear());
  dash.getRange('B4').setBackground('#eaf3fb').setFontWeight('bold');

  // Totales del mes
  var filaMes = 'MATCH($B$3,' + mesesLista + ',0)';
  var rangoCat = 'Movimientos!C2:C10000';
  var rangoFecha = 'Movimientos!B2:B10000';
  var rangoMonto = 'Movimientos!E2:E10000';
  var rangoSub = 'Movimientos!D2:D10000';

  var filtroMesAnio = '(MONTH(' + rangoFecha + ')=' + filaMes + ')*(YEAR(' + rangoFecha + ')=$B$4)';
  var filtroAnio = '(YEAR(' + rangoFecha + ')=$B$4)';

  // Bloque de resumen (fila 6-10)
  var resumen = [
    ['Total Ingresos (mes)',
      '=IFERROR(SUMPRODUCT((' + rangoCat + '="Ingresos")*' + filtroMesAnio + '*' + rangoMonto + '),0)',
      '#27ae60'],
    ['Total Gastos (mes)',
      '=IFERROR(SUMPRODUCT(((' + rangoCat + '="Gastos Fijos")+(' + rangoCat + '="Gastos Variables"))*' + filtroMesAnio + '*' + rangoMonto + '),0)',
      '#e67e22'],
    ['Total Ahorro (mes)',
      '=IFERROR(SUMPRODUCT((' + rangoCat + '="Ahorro")*' + filtroMesAnio + '*' + rangoMonto + '),0)',
      '#2980b9'],
    ['Total Deudas (mes)',
      '=IFERROR(SUMPRODUCT((' + rangoCat + '="Deudas")*' + filtroMesAnio + '*' + rangoMonto + '),0)',
      '#e74c3c'],
    ['Balance (mes)', '=B6-B7', '#2c3e50']
  ];

  resumen.forEach(function(row, i) {
    var fila = 6 + i;
    dash.getRange(fila, 1).setValue(row[0]).setFontWeight('bold');
    dash.getRange(fila, 2).setFormula(row[1]).setNumberFormat('$#,##0.00')
      .setFontWeight('bold').setFontColor(row[2]);
  });

  // Tabla de categorías y subcategorías (leyendo del Config dinámico)
  var subcategoriasActuales = obtenerSubcategorias();
  var rowActual = 13;
  CATEGORIAS.forEach(function(cat) {
    var subs = subcategoriasActuales[cat] || [];
    if (subs.length === 0) return; // saltar categorías sin subcategorías

    // Encabezado de categoría
    dash.getRange(rowActual, 1, 1, 4).merge()
      .setValue(cat)
      .setBackground(COLORES[cat]).setFontColor('white')
      .setFontWeight('bold').setHorizontalAlignment('center');
    rowActual++;

    // Columnas
    dash.getRange(rowActual, 1, 1, 4).setValues([['Subcategoría', 'Mes', 'Anual', 'Total']])
      .setFontWeight('bold').setBackground('#f5f7fa').setHorizontalAlignment('center');
    dash.getRange(rowActual, 1).setHorizontalAlignment('left');
    rowActual++;

    // Subcategorías
    subs.forEach(function(sub) {
      dash.getRange(rowActual, 1).setValue(sub);

      var filtroCatSub = '(' + rangoCat + '="' + cat + '")*(' + rangoSub + '="' + sub + '")';

      dash.getRange(rowActual, 2).setFormula(
        '=IFERROR(SUMPRODUCT(' + filtroCatSub + '*' + filtroMesAnio + '*' + rangoMonto + '),0)'
      ).setNumberFormat('$#,##0.00');

      dash.getRange(rowActual, 3).setFormula(
        '=IFERROR(SUMPRODUCT(' + filtroCatSub + '*' + filtroAnio + '*' + rangoMonto + '),0)'
      ).setNumberFormat('$#,##0.00');

      dash.getRange(rowActual, 4).setFormula(
        '=IFERROR(SUMIFS(Movimientos!E:E, Movimientos!C:C, "' + cat + '", Movimientos!D:D, "' + sub + '"),0)'
      ).setNumberFormat('$#,##0.00');

      rowActual++;
    });

    // Fila de subtotal de la categoría
    var filasSub = subs.length;
    var inicio = rowActual - filasSub;
    dash.getRange(rowActual, 1).setValue('Subtotal ' + cat)
      .setFontWeight('bold').setBackground('#f5f7fa');
    dash.getRange(rowActual, 2).setFormula('=SUM(B' + inicio + ':B' + (rowActual - 1) + ')')
      .setNumberFormat('$#,##0.00').setFontWeight('bold').setBackground('#f5f7fa');
    dash.getRange(rowActual, 3).setFormula('=SUM(C' + inicio + ':C' + (rowActual - 1) + ')')
      .setNumberFormat('$#,##0.00').setFontWeight('bold').setBackground('#f5f7fa');
    dash.getRange(rowActual, 4).setFormula('=SUM(D' + inicio + ':D' + (rowActual - 1) + ')')
      .setNumberFormat('$#,##0.00').setFontWeight('bold').setBackground('#f5f7fa');
    rowActual += 2; // gap
  });

  // Lista de Meses (columna F como referencia)
  dash.getRange('F3').setValue('Meses').setFontWeight('bold')
    .setBackground('#4a90d9').setFontColor('white').setHorizontalAlignment('center');
  MESES.forEach(function(mes, i) {
    dash.getRange(4 + i, 6).setValue(mes);
  });

  // Anchos
  dash.setColumnWidth(1, 200);
  dash.setColumnWidth(2, 120);
  dash.setColumnWidth(3, 120);
  dash.setColumnWidth(4, 120);
  dash.setColumnWidth(5, 20);
  dash.setColumnWidth(6, 120);

  // Congelar filas superiores
  dash.setFrozenRows(4);

  // Activar la hoja
  ss.setActiveSheet(dash);

  Logger.log('Dashboard creado correctamente.');
}

/* ============================================================
   AUTOREGISTRO POR EMAIL — Chase
   ============================================================

   Función principal: procesarEmailsBancarios()  (llamada por trigger)
   Función manual:    sincronizarAhora()          (llamada desde el frontend)
   Reprocesar:        procesarPendientes()        (al agregar elemento/tarjeta)
   Trigger:           crearTriggerEmails() / eliminarTriggerEmails()
   Test parser:       testParserChase()
   ============================================================ */

/* --- Dedup por EmailID (defensa contra doble procesamiento) ---
   Guarda los últimos 200 IDs procesados en Propiedades del script.
   Cualquier email cuyo ID ya está en esa lista se salta. */

var PROCESSED_EMAILS_KEY = 'PROCESSED_EMAIL_IDS';
var PROCESSED_EMAILS_MAX = 200;

function _getProcessedEmailIds() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROCESSED_EMAILS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function esEmailProcesado(emailId) {
  if (!emailId) return false;
  return _getProcessedEmailIds().indexOf(emailId) !== -1;
}

function marcarEmailProcesado(emailId) {
  if (!emailId) return;
  var ids = _getProcessedEmailIds();
  if (ids.indexOf(emailId) !== -1) return;
  ids.push(emailId);
  if (ids.length > PROCESSED_EMAILS_MAX) ids = ids.slice(-PROCESSED_EMAILS_MAX);
  PropertiesService.getScriptProperties().setProperty(PROCESSED_EMAILS_KEY, JSON.stringify(ids));
}

/**
 * Normaliza un texto: mayúsculas, sin espacios ni puntuación.
 * Se usa para comparar "CRUNCHYROLL.COM" con "Crunchyroll".
 */
function normalizarTexto(t) {
  return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Extrae los campos de interés del cuerpo de un email de Chase.
 * Soporta 2 formatos:
 *   (a) Crédito: campo etiquetado "Comercio VALOR" + "Fecha ..."
 *   (b) Débito:  "...de $NN.NN con MERCHANT" en el encabezado + "Realizada el ..."
 * Devuelve { fecha, elementoRaw, ultimos4, monto } o null si falla.
 */
function parsearEmailChase(body, emailDate) {
  var text = String(body || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');

  // Rechazar emails de 4 Pagos — los manejan sus propios parsers
  if (/Configuraste un nuevo Chase 4 Pagos/i.test(text)) return null;
  if (/Tu pago de Chase 4 Pagos\s*(?:SM)?\s+vence/i.test(text)) return null;
  if (/Liquidaste tu plan/i.test(text) && /se pag[óo] en su totalidad/i.test(text)) return null;

  // Monto: primer $NNN.NN encontrado
  var mMonto = text.match(/\$\s*([\d,]+\.\d{2})/);
  if (!mMonto) return null;
  var monto = parseFloat(mMonto[1].replace(/,/g, ''));

  // Últimos 4 dígitos: (...NNNN)
  var mLast4 = text.match(/\(\s*\.{3}\s*(\d{4})\s*\)/);
  var ultimos4 = mLast4 ? mLast4[1] : '';

  // Elemento (comercio) — intenta 2 patrones:
  var elementoRaw = '';
  // (a) Crédito: campo etiquetado
  var mComercio = text.match(/Comercio\s*[:\-]?\s*([^\n]+?)(?:\n|Cantidad|$)/i);
  if (mComercio) {
    elementoRaw = mComercio[1].trim();
  } else {
    // (b) Débito: "...de $NN.NN con MERCHANT" (nombre inline en el encabezado)
    var mDebito = text.match(/de\s+\$\s*[\d,]+\.\d{2}\s+con\s+([^\n]+?)(?:\n|Cuenta|Realizada|$)/i);
    if (mDebito) elementoRaw = mDebito[1].trim();
  }

  // Fecha: "Fecha ..." (crédito) o "Realizada el ..." (débito)
  var fecha = null;
  var mFecha = text.match(/(?:Fecha|Realizada el)\s*[:\-]?\s*([a-záéíóú]{3,4})\.?\s*(\d{1,2}),?\s*(\d{4})/i);
  if (mFecha) {
    var mesStr = mFecha[1].toLowerCase().substring(0, 3);
    var dia = parseInt(mFecha[2], 10);
    var anio = parseInt(mFecha[3], 10);
    var mesNum = MESES_ES_ABR[mesStr];
    if (mesNum !== undefined && dia && anio) {
      var mm = ('0' + (mesNum + 1)).slice(-2);
      var dd = ('0' + dia).slice(-2);
      fecha = anio + '-' + mm + '-' + dd;
    }
  }
  if (!fecha && emailDate) {
    fecha = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  if (!elementoRaw || !monto || !fecha) return null;

  return {
    fecha: fecha,
    elementoRaw: elementoRaw,
    ultimos4: ultimos4,
    monto: monto
  };
}

/**
 * Parser del email de TRANSFERENCIA de Chase.
 * Formato: "Enviaste $XX.XX a DESTINATARIO"
 * Retorna { fecha, elementoRaw, ultimos4, monto, esTransferencia } o null.
 */
function parsearEmailChaseTransferencia(body, emailDate) {
  var text = String(body || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');

  // Header: "Enviaste $XX.XX a DESTINATARIO"
  var mHeader = text.match(/Enviaste\s+\$\s*([\d,]+\.\d{2})\s+a\s+([^\n]+?)(?:\n|Cuenta|$)/i);
  if (!mHeader) return null;

  var monto = parseFloat(mHeader[1].replace(/,/g, ''));
  var destinatario = mHeader[2].trim();

  // Cuenta origen "(...NNNN)"
  var mCuenta = text.match(/\(\s*\.{3}\s*(\d{4})\s*\)/);
  var ultimos4 = mCuenta ? mCuenta[1] : '';

  // Fecha: "Enviado en" mes DD, YYYY
  var fecha = null;
  var mFecha = text.match(/(?:Enviado en|Enviado el)\s*[:\-]?\s*([a-záéíóú]{3,4})\.?\s*(\d{1,2}),?\s*(\d{4})/i);
  if (mFecha) {
    var mesStr = mFecha[1].toLowerCase().substring(0, 3);
    var dia = parseInt(mFecha[2], 10);
    var anio = parseInt(mFecha[3], 10);
    var mesNum = MESES_ES_ABR[mesStr];
    if (mesNum !== undefined && dia && anio) {
      fecha = anio + '-' + ('0' + (mesNum + 1)).slice(-2) + '-' + ('0' + dia).slice(-2);
    }
  }
  if (!fecha && emailDate) {
    fecha = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  if (!monto || !destinatario || !fecha) return null;

  return {
    fecha: fecha,
    elementoRaw: destinatario,
    ultimos4: ultimos4,
    monto: monto,
    esTransferencia: true
  };
}

/**
 * Registra una transferencia. Diferencias con intentarRegistrar normal:
 *   - Método pago = "Transferencia"
 *   - No requiere match de tarjeta (una transferencia no es un cargo a tarjeta)
 *   - Después de registrar, actualiza el saldo de una deuda si el destinatario
 *     matchea el campo "Destinatario" de alguna deuda
 */
function intentarRegistrarTransferencia(parsed, emailId, threadUrl) {
  if (emailId && esEmailProcesado(emailId)) {
    return { registrado: false, yaProcesado: true };
  }

  var mapeoElem = buscarMapeoElemento(parsed.elementoRaw);
  if (!mapeoElem) {
    agregarAPendientes(parsed, emailId, threadUrl,
      'Transferencia sin mapeo: ' + parsed.elementoRaw + ' (crea un elemento con este nombre)');
    return { registrado: false };
  }

  registrarMovimiento({
    fecha: parsed.fecha,
    categoria: mapeoElem.categoria,
    subcategoria: mapeoElem.subcategoria,
    monto: parsed.monto,
    descripcion: mapeoElem.elemento,
    metodoPago: 'Transferencia',
    notas: '[Auto Transfer] Cuenta ...' + parsed.ultimos4
  });

  // Auto-actualizar saldo de deuda si aplica
  _actualizarDeudaPorDestinatario(parsed.elementoRaw, parsed.monto);

  if (emailId) marcarEmailProcesado(emailId);
  return { registrado: true };
}

/**
 * Parser del email de DEPÓSITO DIRECTO de Chase.
 * Formato: "Tienes un depósito directo de $NN.NN"
 * Retorna { fecha, monto, ultimos4, esDeposito } o null.
 */
function parsearEmailChaseDeposito(body, emailDate) {
  var text = String(body || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');

  if (!/Tienes un dep[óo]sito directo/i.test(text)) return null;

  // Monto: "Tienes un depósito directo de $NN.NN"
  var mMonto = text.match(/dep[óo]sito directo de\s+\$\s*([\d,]+\.\d{2})/i);
  if (!mMonto) return null;
  var monto = parseFloat(mMonto[1].replace(/,/g, ''));

  // Cuenta destino (...NNNN)
  var mCuenta = text.match(/\(\s*\.{3}\s*(\d{4})\s*\)/);
  var ultimos4 = mCuenta ? mCuenta[1] : '';

  // Fecha: "Registrado ago 5, 2026"
  var fecha = null;
  var mFecha = text.match(/(?:Registrado|Registrada)\s*[:\-]?\s*([a-záéíóú]{3,4})\.?\s*(\d{1,2}),?\s*(\d{4})/i);
  if (mFecha) {
    var mesStr = mFecha[1].toLowerCase().substring(0, 3);
    var dia = parseInt(mFecha[2], 10);
    var anio = parseInt(mFecha[3], 10);
    var mesNum = MESES_ES_ABR[mesStr];
    if (mesNum !== undefined && dia && anio) {
      fecha = anio + '-' + ('0' + (mesNum + 1)).slice(-2) + '-' + ('0' + dia).slice(-2);
    }
  }
  if (!fecha && emailDate) {
    fecha = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  if (!monto || !fecha) return null;

  return {
    fecha: fecha,
    monto: monto,
    ultimos4: ultimos4,
    esDeposito: true
  };
}

/**
 * Registra un depósito directo como Ingresos → Depósito directo.
 * Auto-crea la subcategoría si no existe.
 */
function intentarRegistrarDeposito(parsed, emailId) {
  if (emailId && esEmailProcesado(emailId)) {
    return { registrado: false, yaProcesado: true };
  }

  _asegurarSubcategoria(CATEGORIA_DEPOSITO, SUBCAT_DEPOSITO);

  registrarMovimiento({
    fecha: parsed.fecha,
    categoria: CATEGORIA_DEPOSITO,
    subcategoria: SUBCAT_DEPOSITO,
    monto: parsed.monto,
    descripcion: 'Depósito directo',
    metodoPago: 'Transferencia',
    notas: '[Auto Depósito] Cuenta ...' + parsed.ultimos4
  });

  if (emailId) marcarEmailProcesado(emailId);
  return { registrado: true };
}

/* --- Dedup con cargos consolidados (Apple, Google) de Chase --- */

function _getChargesGenerico(key) {
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function _registrarCargoEsperado(key, max, total, fecha) {
  var charges = _getChargesGenerico(key);
  charges.push({ total: total, fecha: fecha, ts: Date.now() });
  if (charges.length > max) charges = charges.slice(-max);
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(charges));
}

function _matcheaCargoReciente(key, total) {
  var charges = _getChargesGenerico(key);
  var tolerancia = 0.01;
  var ventanaMs = 5 * 24 * 3600 * 1000; // 5 días
  var ahora = Date.now();
  for (var i = 0; i < charges.length; i++) {
    if (Math.abs(charges[i].total - total) < tolerancia &&
        (ahora - charges[i].ts) < ventanaMs) {
      return true;
    }
  }
  return false;
}

// Wrappers específicos (compat con código existente)
function _registrarCargoAppleEsperado(total, fecha) {
  _registrarCargoEsperado(APPLE_CHARGES_KEY, APPLE_CHARGES_MAX, total, fecha);
}
function _matcheaCargoAppleReciente(total) {
  return _matcheaCargoReciente(APPLE_CHARGES_KEY, total);
}
function _registrarCargoGoogleEsperado(total, fecha) {
  _registrarCargoEsperado(GOOGLE_CHARGES_KEY, GOOGLE_CHARGES_MAX, total, fecha);
}
function _matcheaCargoGoogleReciente(total) {
  return _matcheaCargoReciente(GOOGLE_CHARGES_KEY, total);
}

/**
 * De "Microsoft OneDrive Microsoft 365 Personal" extrae "Microsoft OneDrive".
 * Busca la primera repetición (o variante) de la primera palabra: todo lo
 * anterior es el nombre del servicio.
 */
function _extraerNombreServicio(textoAntes) {
  var words = textoAntes.split(/\s+/);
  if (words.length <= 1) return textoAntes;
  var first = words[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!first) return textoAntes;
  for (var w = 1; w < words.length; w++) {
    var wLower = words[w].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (wLower && (wLower.indexOf(first) === 0 || first.indexOf(wLower) === 0)) {
      return words.slice(0, w).join(' ');
    }
  }
  return textoAntes;
}

/**
 * Parser del email de recibo de Apple (subscripciones).
 * Retorna { fecha, ultimos4, items: [{ nombre, monto }], total } o null.
 * Cada item se registra por separado (una compra Apple = N movimientos).
 */
function parsearEmailAppleRecibo(body, emailDate) {
  var text = String(body || '').replace(/\r\n/g, '\n');

  // Detectar recibo Apple
  if (!/Tu recibo de Apple|Recibo de Apple/i.test(text)) return null;

  // Tarjeta: "Visa **** NNNN" (varias posibles representaciones del separador)
  var mCard = text.match(/Visa\s*[\s•·\.\*\-]{2,}(\d{4})/i);
  var ultimos4 = mCard ? mCard[1] : '';

  // Fecha "Agosto 15, 2026" o similar (nombre completo del mes)
  var fecha = null;
  var mFecha = text.match(/([Ee]nero|[Ff]ebrero|[Mm]arzo|[Aa]bril|[Mm]ayo|[Jj]unio|[Jj]ulio|[Aa]gosto|[Ss]eptiembre|[Oo]ctubre|[Nn]oviembre|[Dd]iciembre)\s+(\d{1,2}),?\s*(\d{4})/);
  if (mFecha) {
    var mesNum = MESES_ES_LARGO[mFecha[1].toLowerCase()];
    if (mesNum !== undefined) {
      fecha = mFecha[3] + '-' + ('0' + (mesNum + 1)).slice(-2) + '-' + ('0' + parseInt(mFecha[2])).slice(-2);
    }
  }
  if (!fecha && emailDate) {
    fecha = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  // Total: "Subtotal $NN.NN"
  var mTotal = text.match(/Subtotal\s+\$\s*([\d,]+\.\d{2})/i);
  var total = mTotal ? parseFloat(mTotal[1].replace(/,/g, '')) : 0;

  // Extraer items: buscar líneas con (mensual|anual|semanal) como anchor.
  // Soporta 2 formatos:
  //   A) Tabla (Gmail API): "| | NOMBRE PLAN (mensual) ... | $MONTO |"
  //   B) Línea a línea (getPlainBody): NOMBRE\nPLAN (mensual)\n...\n$MONTO
  var items = [];
  var seen = {};
  var lines = text.split('\n');
  for (var l = 0; l < lines.length; l++) {
    var line = lines[l];
    if (!/\((?:mensual|anual|semanal)\)/i.test(line)) continue;

    // Precio: en esta línea o las siguientes 3
    var mPrecio = null;
    for (var k = l; k < Math.min(l + 4, lines.length); k++) {
      mPrecio = lines[k].match(/\$\s*([\d,]+\.\d{2})/);
      if (mPrecio) break;
    }
    if (!mPrecio) continue;
    var monto = parseFloat(mPrecio[1].replace(/,/g, ''));
    if (!monto || monto <= 0) continue;

    var nombre;
    var isTableRow = /^\s*\|/.test(line);
    if (isTableRow) {
      // Formato tabla: "| | NOMBRE PLAN (mensual) ... | $MONTO |"
      var cleanLine = line.replace(/^\s*\|?\s*\|?\s*/, '').trim();
      var textoAntes = cleanLine.split(/\s*\((?:mensual|anual|semanal)\)/i)[0].trim();
      nombre = _extraerNombreServicio(textoAntes);
    } else if (l > 0) {
      // Formato línea a línea: nombre en la línea anterior
      var prevLine = lines[l - 1].trim();
      if (prevLine && prevLine.length >= 2 && prevLine.length < 80 &&
          !/^[\|\#\-\=\s]*$/.test(prevLine) &&
          !/^(Subtotal|Total|Visa|Se renovará|\d|Facturación|Recibo|Save )/i.test(prevLine)) {
        nombre = prevLine;
      } else {
        var textoAntes2 = line.split(/\s*\((?:mensual|anual|semanal)\)/i)[0].trim();
        nombre = _extraerNombreServicio(textoAntes2);
      }
    } else {
      var textoAntes3 = line.split(/\s*\((?:mensual|anual|semanal)\)/i)[0].trim();
      nombre = _extraerNombreServicio(textoAntes3);
    }

    if (!nombre || nombre.length < 2 || nombre.length > 80) continue;
    if (/^(Subtotal|Total|Visa|Mastercard|Amex|Discover|Facturación|Se renovará)/i.test(nombre)) continue;
    var key = nombre + '::' + monto;
    if (seen[key]) continue;
    seen[key] = true;
    items.push({ nombre: nombre, monto: monto });
  }

  if (items.length === 0) return null;

  return {
    fecha: fecha,
    ultimos4: ultimos4,
    items: items,
    total: total
  };
}

/**
 * Texto de un recibo para los parsers: el asunto ("Tu recibo de Apple",
 * "El recibo de tu pedido de Google Play...") va primero porque el cuerpo
 * no siempre repite esas frases. Con aHtml=true convierte getBody() a texto
 * con una celda por línea (fallback cuando getPlainBody() no trae los items).
 */
function _textoRecibo(msg, aHtml) {
  var cuerpo;
  if (aHtml) {
    cuerpo = msg.getBody()
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(td|th|tr|p|div|h\d|li)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, function(_, n) { return String.fromCharCode(n); })
      .replace(/\n\s*\n+/g, '\n');
  } else {
    cuerpo = msg.getPlainBody();
  }
  return msg.getSubject() + '\n' + cuerpo;
}

function _diasEntre(fechaA, fechaB) {
  var a = new Date(fechaA + 'T00:00:00');
  var b = new Date(fechaB + 'T00:00:00');
  return Math.abs(a - b) / (24 * 3600 * 1000);
}

/**
 * Busca en Gmail el recibo de Apple que corresponde a un cargo consolidado
 * de Chase (APPLE.COM/BILL). No depende del label Banco/Alertas.
 * Matchea por total (±0.01) y fecha (±5 días). Prefiere recibos sin procesar.
 * Retorna { parsed, emailId, threadUrl, yaProcesado } o null.
 */
function buscarReciboApple(monto, fecha) {
  var threads = GmailApp.search(
    'from:apple.com (subject:"recibo de Apple" OR subject:"receipt from Apple") newer_than:90d', 0, 50);
  var yaProc = null;
  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    for (var m = 0; m < msgs.length; m++) {
      var msg = msgs[m];
      if (!esRemitentePermitido(msg.getFrom())) continue;
      var parsed = parsearEmailAppleRecibo(_textoRecibo(msg, false), msg.getDate()) ||
                   parsearEmailAppleRecibo(_textoRecibo(msg, true), msg.getDate());
      if (!parsed || Math.abs(parsed.total - monto) >= 0.01) continue;
      if (fecha && parsed.fecha && _diasEntre(parsed.fecha, fecha) > 5) continue;
      var r = { parsed: parsed, emailId: msg.getId(), threadUrl: threads[t].getPermalink() };
      if (esEmailProcesado(r.emailId)) {
        r.yaProcesado = true;
        yaProc = yaProc || r;
        continue;
      }
      return r;
    }
  }
  return yaProc;
}

/**
 * Resuelve un cargo APPLE.COM/BILL de Chase usando el recibo de Apple:
 * registra cada servicio por separado (o los manda a Pendientes con
 * "APPLE.COM - servicio" y su precio). Retorna el resultado de
 * procesarAppleRecibo, { yaProcesado: true } si el recibo ya estaba
 * registrado, o null si no hay recibo.
 */
function resolverCargoApple(monto, fecha, ultimos4) {
  var r = buscarReciboApple(monto, fecha);
  if (!r) return null;
  if (r.yaProcesado) return { registrado: false, yaProcesado: true };
  if (ultimos4) r.parsed.ultimos4 = ultimos4;
  return procesarAppleRecibo(r.parsed, r.emailId, r.threadUrl);
}

/**
 * Procesa un recibo Apple: registra cada item por separado.
 * También guarda el total esperado para dedupear el cargo Chase APPLE.COM/BILL.
 */
function procesarAppleRecibo(parsed, emailId, threadUrl) {
  if (emailId && esEmailProcesado(emailId)) {
    return { registrado: false, yaProcesado: true };
  }

  var registrados = 0;
  var pendientes = 0;
  parsed.items.forEach(function(item) {
    var pseudoParsed = {
      fecha: parsed.fecha,
      elementoRaw: item.nombre,
      ultimos4: parsed.ultimos4,
      monto: item.monto
    };
    var mapeoElem = buscarMapeoElemento(item.nombre);
    if (!mapeoElem) {
      // Raw descriptivo (apple.com + servicio); el monto va en su columna.
      // Sigue mapeando: el elemento del catálogo (ej. "ChatGPT") está contenido en el raw.
      pseudoParsed.elementoRaw = 'APPLE.COM - ' + item.nombre;
      agregarAPendientes(pseudoParsed, emailId + '-' + item.nombre, threadUrl,
        'Elemento no mapeado: APPLE.COM - ' + item.nombre + ' (crea un elemento con este nombre)');
      pendientes++;
      return;
    }
    var mapeoTarj = buscarMapeoTarjeta(parsed.ultimos4);
    var metodoPago = mapeoTarj ? ('Tarjeta ' + mapeoTarj.tipo) : 'Tarjeta Crédito';
    var alias = mapeoTarj && mapeoTarj.alias ? mapeoTarj.alias : 'Apple';
    registrarMovimiento({
      fecha: parsed.fecha,
      categoria: mapeoElem.categoria,
      subcategoria: mapeoElem.subcategoria,
      monto: item.monto,
      descripcion: mapeoElem.elemento,
      metodoPago: metodoPago,
      notas: '[Auto Apple] ' + alias + ' ...' + parsed.ultimos4
    });
    registrados++;
  });

  // Registrar el total esperado para dedup con Chase APPLE.COM/BILL
  if (parsed.total > 0) {
    _registrarCargoAppleEsperado(parsed.total, parsed.fecha);
  }

  if (emailId) marcarEmailProcesado(emailId);
  return { registrado: registrados > 0, registrados: registrados, pendientes: pendientes };
}

/**
 * Parser del email de recibo de Google Play.
 * Formato: "El recibo de tu pedido de Google Play..."
 * Retorna { fecha, ultimos4, items: [{ nombre, monto }], total } o null.
 */
function parsearEmailGooglePlayRecibo(body, emailDate) {
  var text = String(body || '').replace(/\r\n/g, '\n');

  // Detectar recibo Google Play
  if (!/recibo.*Google Play|Google Play.*recibo/i.test(text)) return null;

  // Tarjeta: "Visa-NNNN" (formato Google es distinto del de Apple)
  var mCard = text.match(/(?:Visa|Mastercard|Amex|Discover)[\-\s]*[•·\.\*]*\s*(\d{4})/i);
  var ultimos4 = mCard ? mCard[1] : '';

  // Fecha "23 ago 2026" o "Agosto 23, 2026" — Google usa formato corto "DD MMM YYYY"
  var fecha = null;
  var mFechaCorta = text.match(/Fecha del pedido:\s*(\d{1,2})\s+([a-záéíóú]{3,4})\.?\s*(\d{4})/i);
  if (mFechaCorta) {
    var mes3 = mFechaCorta[2].toLowerCase().substring(0, 3);
    var mesNum = MESES_ES_ABR[mes3];
    if (mesNum !== undefined) {
      fecha = mFechaCorta[3] + '-' + ('0' + (mesNum + 1)).slice(-2) + '-' + ('0' + parseInt(mFechaCorta[1])).slice(-2);
    }
  }
  if (!fecha) {
    var mFechaLarga = text.match(/([Ee]nero|[Ff]ebrero|[Mm]arzo|[Aa]bril|[Mm]ayo|[Jj]unio|[Jj]ulio|[Aa]gosto|[Ss]eptiembre|[Oo]ctubre|[Nn]oviembre|[Dd]iciembre)\s+(\d{1,2}),?\s*(\d{4})/);
    if (mFechaLarga) {
      var mesLargoNum = MESES_ES_LARGO[mFechaLarga[1].toLowerCase()];
      if (mesLargoNum !== undefined) {
        fecha = mFechaLarga[3] + '-' + ('0' + (mesLargoNum + 1)).slice(-2) + '-' + ('0' + parseInt(mFechaLarga[2])).slice(-2);
      }
    }
  }
  if (!fecha && emailDate) {
    fecha = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  // Total: "Total: $NN.NN por mes" o "Total: $NN.NN"
  var mTotal = text.match(/Total:\s*\$\s*([\d,]+\.\d{2})/i);
  var total = mTotal ? parseFloat(mTotal[1].replace(/,/g, '')) : 0;

  // Extraer items — Google Play usa tabla "Artículo ... Precio"
  // Item line: "NOMBRE ... $NN.NN por mes" (o "$NN.NN")
  var items = [];
  var seen = {};
  var itemPattern = /^([A-Z][^\n$]+?)\s+\$\s*([\d,]+\.\d{2})(?:\s+por\s+(?:mes|año|semana))?\s*$/gim;
  var match;
  while ((match = itemPattern.exec(text)) !== null) {
    var nombre = match[1].trim();
    var monto = parseFloat(match[2].replace(/,/g, ''));
    if (!nombre || nombre.length < 2 || nombre.length > 120) continue;
    if (!monto || monto <= 0) continue;
    // Skip líneas que son totales, impuestos o fees
    if (/^(Total|Subtotal|Impuesto|Total del pedido|CST|HST|GST|PST|QST|Sales Tax|State Tax|County Tax|City Tax|Local Tax|Tax\b|Fee\b)/i.test(nombre)) continue;
    var key = nombre + '::' + monto;
    if (seen[key]) continue;
    seen[key] = true;
    items.push({ nombre: nombre, monto: monto });
  }

  // Si no encontró items pero sí total, usar el total como single item con nombre genérico
  if (items.length === 0 && total > 0) {
    var mArt = text.match(/Se renovó tu suscripción a\s+([^\n]+?)\s+en Google Play/i);
    var nombreArt = mArt ? mArt[1].trim() : 'Google Play';
    items.push({ nombre: nombreArt, monto: total });
  }

  if (items.length === 0) return null;

  // Impuestos incluidos: si el total (con tax) > suma de items, repartir la
  // diferencia proporcionalmente para que la suma cuadre con el cargo de Chase.
  var sumaItems = items.reduce(function(s, i) { return s + i.monto; }, 0);
  if (total > 0 && total > sumaItems + 0.005) {
    var diff = total - sumaItems;
    items.forEach(function(it) {
      it.monto = Math.round((it.monto + diff * (it.monto / sumaItems)) * 100) / 100;
    });
  }

  return {
    fecha: fecha,
    ultimos4: ultimos4,
    items: items,
    total: total || items.reduce(function(s, i) { return s + i.monto; }, 0)
  };
}

/**
 * Busca en Gmail el recibo de Google Play que corresponde a un cargo
 * consolidado de Chase (GOOGLE *X). Mismo criterio que buscarReciboApple.
 */
function buscarReciboGooglePlay(monto, fecha) {
  var threads = GmailApp.search(
    'from:google.com "Google Play" recibo newer_than:90d', 0, 50);
  var yaProc = null;
  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    for (var m = 0; m < msgs.length; m++) {
      var msg = msgs[m];
      if (!esRemitentePermitido(msg.getFrom())) continue;
      var parsed = parsearEmailGooglePlayRecibo(_textoRecibo(msg, false), msg.getDate()) ||
                   parsearEmailGooglePlayRecibo(_textoRecibo(msg, true), msg.getDate());
      if (!parsed || Math.abs(parsed.total - monto) >= 0.01) continue;
      if (fecha && parsed.fecha && _diasEntre(parsed.fecha, fecha) > 5) continue;
      var r = { parsed: parsed, emailId: msg.getId(), threadUrl: threads[t].getPermalink() };
      if (esEmailProcesado(r.emailId)) {
        r.yaProcesado = true;
        yaProc = yaProc || r;
        continue;
      }
      return r;
    }
  }
  return yaProc;
}

/**
 * Resuelve un cargo GOOGLE de Chase con el recibo de Google Play
 * (ver resolverCargoApple). Retorna null si no hay recibo.
 */
function resolverCargoGooglePlay(monto, fecha, ultimos4) {
  var r = buscarReciboGooglePlay(monto, fecha);
  if (!r) return null;
  if (r.yaProcesado) return { registrado: false, yaProcesado: true };
  if (ultimos4) r.parsed.ultimos4 = ultimos4;
  return procesarGooglePlayRecibo(r.parsed, r.emailId, r.threadUrl);
}

/**
 * Procesa un recibo Google Play: registra cada item por separado.
 */
function procesarGooglePlayRecibo(parsed, emailId, threadUrl) {
  if (emailId && esEmailProcesado(emailId)) {
    return { registrado: false, yaProcesado: true };
  }

  var registrados = 0;
  var pendientes = 0;
  parsed.items.forEach(function(item) {
    var pseudoParsed = {
      fecha: parsed.fecha,
      elementoRaw: item.nombre,
      ultimos4: parsed.ultimos4,
      monto: item.monto
    };
    var mapeoElem = buscarMapeoElemento(item.nombre);
    if (!mapeoElem) {
      pseudoParsed.elementoRaw = 'GOOGLE PLAY - ' + item.nombre;
      agregarAPendientes(pseudoParsed, emailId + '-' + item.nombre, threadUrl,
        'Elemento no mapeado: GOOGLE PLAY - ' + item.nombre + ' (crea un elemento con este nombre)');
      pendientes++;
      return;
    }
    var mapeoTarj = buscarMapeoTarjeta(parsed.ultimos4);
    var metodoPago = mapeoTarj ? ('Tarjeta ' + mapeoTarj.tipo) : 'Tarjeta Crédito';
    var alias = mapeoTarj && mapeoTarj.alias ? mapeoTarj.alias : 'Google Play';
    registrarMovimiento({
      fecha: parsed.fecha,
      categoria: mapeoElem.categoria,
      subcategoria: mapeoElem.subcategoria,
      monto: item.monto,
      descripcion: mapeoElem.elemento,
      metodoPago: metodoPago,
      notas: '[Auto Google Play] ' + alias + ' ...' + parsed.ultimos4
    });
    registrados++;
  });

  if (parsed.total > 0) {
    _registrarCargoGoogleEsperado(parsed.total, parsed.fecha);
  }

  if (emailId) marcarEmailProcesado(emailId);
  return { registrado: registrados > 0, registrados: registrados, pendientes: pendientes };
}

/**
 * Parser del email de recibo de Chevron ("Your Chevron receipt").
 * Chase ya no manda el monto en la alerta, así que el recibo es la fuente del gasto.
 * Retorna { fecha, monto, galones, precioGalon, producto, ultimos4 } o null.
 */
function parsearEmailChevronRecibo(body, emailDate) {
  var text = String(body || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');

  if (!/Your Chevron receipt/i.test(text) && !/Chevron/i.test(text)) return null;

  var mTotal = text.match(/Total Sale\s*:?\s*\$?\s*([\d,]+\.\d{2})/i);
  if (!mTotal) return null;
  var monto = parseFloat(mTotal[1].replace(/,/g, ''));
  if (!monto) return null;

  var mGal = text.match(/Gallons\s*:?\s*([\d,]+\.?\d*)/i);
  var mPrecio = text.match(/Price\s*\/\s*G(?:al)?\s*:?\s*\$?\s*([\d.]+)/i);
  var mProd = text.match(/Product\s*:?\s*([A-Za-z0-9+ ]+?)(?:\n|Gallons|$)/i);
  // Tarjeta (si el recibo la muestra): ****1234, xxxx1234 o ...1234
  var mLast4 = text.match(/(?:\*{2,}|[xX]{2,}|\.{3})\s*(\d{4})\b/);

  var fecha = emailDate
    ? Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : null;
  if (!fecha) return null;

  return {
    fecha: fecha,
    monto: monto,
    galones: mGal ? parseFloat(mGal[1].replace(/,/g, '')) : 0,
    precioGalon: mPrecio ? parseFloat(mPrecio[1]) : 0,
    producto: mProd ? mProd[1].trim() : '',
    ultimos4: mLast4 ? mLast4[1] : ''
  };
}

/**
 * Registra un recibo de Chevron como un movimiento. Si el elemento "Chevron"
 * no existe en la hoja Elementos, NO marca el email como procesado: se
 * reintenta solo en la próxima sincronización (query de 7 días).
 */
function procesarChevronRecibo(parsed, emailId) {
  if (emailId && esEmailProcesado(emailId)) {
    return { registrado: false, yaProcesado: true };
  }

  var mapeoElem = buscarMapeoElemento('CHEVRON');
  if (!mapeoElem) return { registrado: false, pendiente: true };

  var mapeoTarj = buscarMapeoTarjeta(parsed.ultimos4);
  var metodoPago = mapeoTarj ? ('Tarjeta ' + mapeoTarj.tipo) : CHEVRON_METODO_DEFAULT;
  var alias = mapeoTarj && mapeoTarj.alias ? mapeoTarj.alias : 'Chevron';

  var detalle = [];
  if (parsed.galones) detalle.push(parsed.galones.toFixed(3) + ' gal');
  if (parsed.producto) detalle.push(parsed.producto);
  if (parsed.precioGalon) detalle.push('@ $' + parsed.precioGalon.toFixed(3));

  registrarMovimiento({
    fecha: parsed.fecha,
    categoria: mapeoElem.categoria,
    subcategoria: mapeoElem.subcategoria,
    monto: parsed.monto,
    descripcion: mapeoElem.elemento,
    metodoPago: metodoPago,
    notas: '[Auto Chevron] ' + alias + (parsed.ultimos4 ? ' ...' + parsed.ultimos4 : '') +
           (detalle.length ? ' | ' + detalle.join(' ') : '')
  });
  if (emailId) marcarEmailProcesado(emailId);
  return { registrado: true };
}

/**
 * Asegura que una subcategoría exista en Config. Si la crea, refresca el Dashboard.
 */
function _asegurarSubcategoria(categoria, subcategoria) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var config = obtenerHojaConfig(ss);
  var data = config.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === categoria &&
        String(data[i][1]).trim() === subcategoria) return;
  }
  config.appendRow([categoria, subcategoria]);
  _refreshDashboardSilencioso();
}

/**
 * Si el destinatario matchea el campo "Destinatario" de alguna deuda,
 * actualiza Pagado y Restante. Match exacto (trim + case-insensitive).
 */
function _actualizarDeudaPorDestinatario(destinatario, monto) {
  try {
    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaDeudas(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var destLower = String(destinatario || '').trim().toLowerCase();
    if (!destLower) return;

    var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_DEUDAS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      var deudaDest = String(data[i][8] || '').trim().toLowerCase();
      if (!deudaDest || deudaDest !== destLower) continue;

      var montoOriginal = parseFloat(data[i][1]) || 0;
      var pagadoActual = parseFloat(data[i][2]) || 0;
      var activa = String(data[i][6]).trim() === 'Sí';
      if (!activa) return;

      var nuevoPagado = pagadoActual + monto;
      var nuevoRestante = montoOriginal - nuevoPagado;

      sheet.getRange(i + 2, 3).setValue(nuevoPagado);
      sheet.getRange(i + 2, 4).setValue(nuevoRestante);
      sheet.getRange(i + 2, 8).setValue(new Date());
      if (nuevoRestante <= 0) sheet.getRange(i + 2, 7).setValue('No');
      return;
    }
  } catch (e) {
    Logger.log('Error actualizando deuda por destinatario: ' + e.message);
  }
}

/**
 * Busca un mapeo elemento → categoría/subcategoría.
 * Match: si el elemento del catálogo (normalizado) está incluido en el raw (normalizado).
 * Ej: catálogo "Crunchyroll" + raw "CRUNCHYROLL.COM" → match.
 */
function buscarMapeoElemento(elementoRaw) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaElementos(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_ELEMENTOS.length).getValues();
  var rawNorm = normalizarTexto(elementoRaw);
  if (!rawNorm) return null;

  for (var i = 0; i < data.length; i++) {
    var elemento = String(data[i][0]).trim();
    var elemNorm = normalizarTexto(elemento);
    if (elemNorm && rawNorm.indexOf(elemNorm) !== -1) {
      return {
        elemento: elemento,
        categoria: String(data[i][1]).trim(),
        subcategoria: String(data[i][2]).trim()
      };
    }
  }
  return null;
}

/**
 * Busca una tarjeta por sus últimos 4 dígitos.
 */
function buscarMapeoTarjeta(ultimos4) {
  if (!ultimos4) return null;
  var tarjetas = obtenerTarjetas();
  for (var i = 0; i < tarjetas.length; i++) {
    if (tarjetas[i].ultimos4 === ultimos4) return tarjetas[i];
  }
  return null;
}

/**
 * Agrega una fila a la hoja Pendientes (dedupe por EmailID).
 */
function agregarAPendientes(parsed, emailId, threadUrl, motivo) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaPendientes(ss);

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === emailId) return; // ya está
    }
  }

  var fechaDate = new Date(parsed.fecha + 'T00:00:00');
  sheet.appendRow([
    fechaDate,
    parseFloat(parsed.monto),
    parsed.elementoRaw,
    parsed.ultimos4,
    motivo,
    emailId,
    threadUrl || ''
  ]);
  var nr = sheet.getLastRow();
  sheet.getRange(nr, 1).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(nr, 2).setNumberFormat('$#,##0.00');
}

/**
 * Intenta registrar un movimiento parseado. Si falta mapeo → Pendientes.
 * Dedupe por EmailID: si el mismo ID ya se registró antes, salta.
 */
function intentarRegistrar(parsed, emailId, threadUrl) {
  if (emailId && esEmailProcesado(emailId)) {
    return { registrado: false, yaProcesado: true };
  }

  // Dedup: si es APPLE.COM/BILL y matchea un total de recibo Apple reciente, skip
  if (/APPLE\.COM\/BILL/i.test(parsed.elementoRaw) && _matcheaCargoAppleReciente(parsed.monto)) {
    if (emailId) marcarEmailProcesado(emailId);
    return { registrado: false, yaProcesado: true };
  }
  // Sin recibo Apple procesado aún: buscarlo en Gmail y desglosar por servicio
  if (/APPLE\.COM\/BILL/i.test(parsed.elementoRaw)) {
    var resApple = resolverCargoApple(parsed.monto, parsed.fecha, parsed.ultimos4);
    if (resApple) {
      if (emailId) marcarEmailProcesado(emailId);
      return resApple;
    }
  }
  // Dedup: si es GOOGLE *X y matchea un total de recibo Google Play reciente, skip
  if (/^GOOGLE\b/i.test(parsed.elementoRaw) && _matcheaCargoGoogleReciente(parsed.monto)) {
    if (emailId) marcarEmailProcesado(emailId);
    return { registrado: false, yaProcesado: true };
  }
  // Sin recibo Google Play procesado aún: buscarlo en Gmail y desglosar por servicio
  if (/^GOOGLE\b/i.test(parsed.elementoRaw)) {
    var resGoogle = resolverCargoGooglePlay(parsed.monto, parsed.fecha, parsed.ultimos4);
    if (resGoogle) {
      if (emailId) marcarEmailProcesado(emailId);
      return resGoogle;
    }
  }

  var mapeoElem = buscarMapeoElemento(parsed.elementoRaw);
  var mapeoTarj = buscarMapeoTarjeta(parsed.ultimos4);

  var motivos = [];
  if (!mapeoElem) motivos.push('Elemento no mapeado: ' + parsed.elementoRaw);
  if (!mapeoTarj) motivos.push('Tarjeta desconocida: ...' + (parsed.ultimos4 || '????'));

  if (motivos.length > 0) {
    agregarAPendientes(parsed, emailId, threadUrl, motivos.join(' | '));
    return { registrado: false };
  }

  var alias = mapeoTarj.alias || 'Chase';
  registrarMovimiento({
    fecha: parsed.fecha,
    categoria: mapeoElem.categoria,
    subcategoria: mapeoElem.subcategoria,
    monto: parsed.monto,
    descripcion: mapeoElem.elemento,
    metodoPago: 'Tarjeta ' + mapeoTarj.tipo,
    notas: '[Auto] ' + alias + ' ...' + mapeoTarj.ultimos4
  });
  if (emailId) marcarEmailProcesado(emailId);
  return { registrado: true };
}

/**
 * Verifica que el "From:" de un mensaje sea un remitente permitido.
 */
function esRemitentePermitido(from) {
  var f = String(from || '').toLowerCase();
  for (var i = 0; i < REMITENTES_PERMITIDOS.length; i++) {
    if (f.indexOf(REMITENTES_PERMITIDOS[i]) !== -1) return true;
  }
  return false;
}

function obtenerOCrearLabel(nombre) {
  var lbl = GmailApp.getUserLabelByName(nombre);
  if (!lbl) lbl = GmailApp.createLabel(nombre);
  return lbl;
}

/**
 * FUNCIÓN PRINCIPAL — llamada por trigger cada 15 min.
 * Solo procesa emails que matchean GMAIL_QUERY y vienen de REMITENTES_PERMITIDOS.
 * Protegida con LockService para evitar procesamiento concurrente.
 */
function procesarEmailsBancarios() {
  var stats = { total: 0, registrados: 0, pendientes: 0, ignorados: 0 };
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // hasta 30 s esperando el lock
  } catch (e) {
    Logger.log('procesarEmailsBancarios: no se pudo adquirir el lock, otra ejecución en curso');
    return stats;
  }
  try {
    var threads = GmailApp.search(GMAIL_QUERY, 0, 50);
    if (!threads.length) {
      stats.registrados += _procesarCuotas4Pagos();
      return stats;
    }

    var labelProcesado = obtenerOCrearLabel(LABEL_PROCESADO);

    threads.forEach(function(thread) {
      var messages = thread.getMessages();
      var procesoAlgunEnEsteThread = false;

      messages.forEach(function(msg) {
        // No filtramos por unread: la fuente de la verdad de "ya procesado"
        // es el label LABEL_PROCESADO del thread (aplicado abajo).
        if (!esRemitentePermitido(msg.getFrom())) {
          stats.ignorados++;
          return;
        }
        stats.total++;
        var body = msg.getPlainBody();

        // 1) Parser normal (crédito/débito)
        var parsed = parsearEmailChase(body, msg.getDate());
        if (parsed) {
          var res = intentarRegistrar(parsed, msg.getId(), thread.getPermalink());
          if (res.registrado) stats.registrados++;
          else if (res.yaProcesado) stats.ignorados++;
          else stats.pendientes++;
          msg.markRead();
          procesoAlgunEnEsteThread = true;
          return;
        }

        // 2) Parser transferencia ("Enviaste $X a Y")
        var transfer = parsearEmailChaseTransferencia(body, msg.getDate());
        if (transfer) {
          var resT = intentarRegistrarTransferencia(transfer, msg.getId(), thread.getPermalink());
          if (resT.registrado) stats.registrados++;
          else if (resT.yaProcesado) stats.ignorados++;
          else stats.pendientes++;
          msg.markRead();
          procesoAlgunEnEsteThread = true;
          return;
        }

        // 3) Parser depósito directo ("Tienes un depósito directo")
        var deposito = parsearEmailChaseDeposito(body, msg.getDate());
        if (deposito) {
          var resD = intentarRegistrarDeposito(deposito, msg.getId());
          if (resD.registrado) stats.registrados++;
          else stats.ignorados++;
          msg.markRead();
          procesoAlgunEnEsteThread = true;
          return;
        }

        // 4) Parser recibo Apple (multi-item)
        var appleRec = parsearEmailAppleRecibo(body, msg.getDate());
        if (appleRec) {
          var resA = procesarAppleRecibo(appleRec, msg.getId(), thread.getPermalink());
          if (resA.yaProcesado) stats.ignorados++;
          else {
            stats.registrados += resA.registrados || 0;
            stats.pendientes += resA.pendientes || 0;
          }
          msg.markRead();
          procesoAlgunEnEsteThread = true;
          return;
        }

        // 5) Parser recibo Google Play
        var gpRec = parsearEmailGooglePlayRecibo(body, msg.getDate());
        if (gpRec) {
          var resG = procesarGooglePlayRecibo(gpRec, msg.getId(), thread.getPermalink());
          if (resG.yaProcesado) stats.ignorados++;
          else {
            stats.registrados += resG.registrados || 0;
            stats.pendientes += resG.pendientes || 0;
          }
          msg.markRead();
          procesoAlgunEnEsteThread = true;
          return;
        }

        // 5b) Parser recibo Chevron (gasolina)
        var chevRec = parsearEmailChevronRecibo(body, msg.getDate());
        if (chevRec) {
          var resC = procesarChevronRecibo(chevRec, msg.getId());
          if (resC.registrado) stats.registrados++;
          else if (resC.yaProcesado) stats.ignorados++;
          else stats.pendientes++;
          if (resC.registrado || resC.yaProcesado) {
            msg.markRead();
            procesoAlgunEnEsteThread = true;
          }
          return;
        }

        // 6) Parser Chase 4 Pagos - setup (agrega a la queue)
        var setup4p = parsearEmailChase4PagosSetup(body);
        if (setup4p && setup4p.numeroPlan) {
          agregar4Pagos(setup4p, msg.getId(), msg.getDate());
          stats.registrados++;
          msg.markRead();
          procesoAlgunEnEsteThread = true;
          return;
        }

        // 7) Parser Chase 4 Pagos - recordatorio (silencioso)
        var rec4p = parsearEmailChase4PagosRecordatorio(body);
        if (rec4p) {
          actualizarProximoPago4Pagos(rec4p);
          stats.ignorados++;
          msg.markRead();
          procesoAlgunEnEsteThread = true;
          return;
        }

        // 8) Parser Chase 4 Pagos - plan liquidado
        var liq4p = parsearEmailChase4PagosLiquidado(body, msg.getDate());
        if (liq4p) {
          liquidar4Pagos(liq4p);
          stats.ignorados++;
          msg.markRead();
          procesoAlgunEnEsteThread = true;
          return;
        }

        // Ninguno matcheó — ignorar
        stats.ignorados++;
      });

      if (procesoAlgunEnEsteThread) thread.addLabel(labelProcesado);
    });

    // Cuotas 4 Pagos vencidas (no dependen de emails)
    stats.registrados += _procesarCuotas4Pagos();

    Logger.log('Emails: total=' + stats.total + ' registrados=' + stats.registrados +
               ' pendientes=' + stats.pendientes + ' ignorados=' + stats.ignorados);
    return stats;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reprocesa la hoja Pendientes: los que ahora se pueden mapear, los registra
 * y borra su fila. Los que no, se quedan.
 * Protegida con LockService — dos llamadas concurrentes se serializan (evita
 * el bug de duplicados cuando se agregan tarjeta + elemento casi al mismo
 * tiempo y ambas invocan procesarPendientes en paralelo).
 */
function procesarPendientes() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log('procesarPendientes: no se pudo adquirir el lock, otra ejecución en curso');
    return { procesados: 0, restantes: 0 };
  }
  try {
    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaPendientes(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { procesados: 0, restantes: 0 };

    var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_PENDIENTES.length).getValues();
    var registrados = 0;
    var filasABorrar = [];

    data.forEach(function(fila, i) {
      var fecha = fila[0];
      var monto = fila[1];
      var elementoRaw = String(fila[2] || '').trim();
      var ultimos4 = String(fila[3] || '').trim();
      var emailId = String(fila[5] || '').trim();

      // Defensa: si este EmailID ya fue registrado por otro path, borrar sin re-registrar
      if (emailId && esEmailProcesado(emailId)) {
        filasABorrar.push(i + 2);
        return;
      }

      var fechaStr = fecha instanceof Date
        ? Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : String(fecha);

      // Cargo consolidado de Apple: desglosar con el recibo (servicio + precio)
      if (/APPLE\.COM\/BILL/i.test(elementoRaw)) {
        var resApple = resolverCargoApple(parseFloat(monto), fechaStr, ultimos4);
        if (resApple) {
          if (emailId) marcarEmailProcesado(emailId);
          if (resApple.registrado) registrados += resApple.registrados || 1;
          filasABorrar.push(i + 2);
        }
        return;
      }

      // Cargo consolidado de Google (raw de Chase, ej: "GOOGLE"): desglosar
      if (/^GOOGLE\b/i.test(elementoRaw) && !/^GOOGLE PLAY - /i.test(elementoRaw)) {
        var resGoogle = resolverCargoGooglePlay(parseFloat(monto), fechaStr, ultimos4);
        if (resGoogle) {
          if (emailId) marcarEmailProcesado(emailId);
          if (resGoogle.registrado) registrados += resGoogle.registrados || 1;
          filasABorrar.push(i + 2);
          return;
        }
      }

      // Limpieza: filas "GOOGLE PLAY - CST/Impuesto/Tax" del código anterior → borrar
      if (/^GOOGLE PLAY - (CST|Impuesto|Tax|HST|GST|PST|Fee)\b/i.test(elementoRaw)) {
        filasABorrar.push(i + 2);
        return;
      }

      // Limpieza: filas "GOOGLE PLAY - servicio" con monto pre-tax del código anterior
      // → actualizar monto al total con impuestos leyendo el recibo original
      if (/^GOOGLE PLAY - /i.test(elementoRaw)) {
        var baseEid = emailId.replace(/-[^-]+$/, '');
        if (baseEid && baseEid !== emailId) {
          try {
            var receiptMsg = GmailApp.getMessageById(baseEid);
            if (receiptMsg) {
              var receiptParsed = parsearEmailGooglePlayRecibo(
                _textoRecibo(receiptMsg, false), receiptMsg.getDate()) ||
                parsearEmailGooglePlayRecibo(
                  _textoRecibo(receiptMsg, true), receiptMsg.getDate());
              if (receiptParsed) {
                var itemNombre = elementoRaw.replace(/^GOOGLE PLAY - /i, '');
                for (var j = 0; j < receiptParsed.items.length; j++) {
                  if (receiptParsed.items[j].nombre === itemNombre &&
                      Math.abs(receiptParsed.items[j].monto - parseFloat(monto)) > 0.005) {
                    sheet.getRange(i + 2, 2).setValue(receiptParsed.items[j].monto);
                    sheet.getRange(i + 2, 2).setNumberFormat('$#,##0.00');
                    break;
                  }
                }
              }
            }
          } catch (e) {
            Logger.log('Limpieza GP: no se pudo actualizar monto fila ' + (i+2) + ': ' + e.message);
          }
        }
        // Cae al mapeo normal (abajo) — si hay elemento en catálogo, se registra
      }

      var mapeoElem = buscarMapeoElemento(elementoRaw);
      var mapeoTarj = buscarMapeoTarjeta(ultimos4);
      if (!mapeoElem || !mapeoTarj) return;
      var alias = mapeoTarj.alias || 'Chase';

      registrarMovimiento({
        fecha: fechaStr,
        categoria: mapeoElem.categoria,
        subcategoria: mapeoElem.subcategoria,
        monto: monto,
        descripcion: mapeoElem.elemento,
        metodoPago: 'Tarjeta ' + mapeoTarj.tipo,
        notas: '[Auto] ' + alias + ' ...' + mapeoTarj.ultimos4
      });
      if (emailId) marcarEmailProcesado(emailId);
      registrados++;
      filasABorrar.push(i + 2); // +2 porque i=0 corresponde a fila 2
    });

    filasABorrar.sort(function(a, b) { return b - a; }).forEach(function(row) {
      sheet.deleteRow(row);
    });

    return { procesados: registrados, restantes: Math.max(0, sheet.getLastRow() - 1) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * DIAGNÓSTICO: corre desde el editor de Apps Script (Run > diagnosticoApple).
 * Abre Ejecuciones (Executions) para ver el log completo.
 */
function diagnosticoApple() {
  Logger.log('=== DIAGNÓSTICO APPLE ===');

  // 1. ¿Se ve la función _extraerNombreServicio?
  try {
    var test = _extraerNombreServicio('iCloud iCloud+ con 200 GB');
    Logger.log('1. _extraerNombreServicio OK: ' + test);
  } catch (e) {
    Logger.log('1. ERROR _extraerNombreServicio: ' + e.message);
  }

  // 2. Buscar recibos Apple en Gmail
  var q = 'from:apple.com (subject:"recibo de Apple" OR subject:"receipt from Apple") newer_than:90d';
  Logger.log('2. Query Gmail: ' + q);
  var threads = GmailApp.search(q, 0, 50);
  Logger.log('   Threads encontrados: ' + threads.length);

  threads.forEach(function(thread, t) {
    var msgs = thread.getMessages();
    msgs.forEach(function(msg) {
      var id = msg.getId();
      var subj = msg.getSubject();
      var from = msg.getFrom();
      var permitido = esRemitentePermitido(from);
      var procesado = esEmailProcesado(id);
      Logger.log('   [' + t + '] id=' + id + ' subj="' + subj + '" from=' + from +
                 ' permitido=' + permitido + ' yaProcesado=' + procesado);

      // 3. Parsear con texto plano
      var textoPlano = _textoRecibo(msg, false);
      var parsed = parsearEmailAppleRecibo(textoPlano, msg.getDate());
      Logger.log('   plainText parse: ' + (parsed ? JSON.stringify({
        items: parsed.items.length,
        total: parsed.total,
        nombres: parsed.items.map(function(i) { return i.nombre + '=$' + i.monto; }).join(', ')
      }) : 'NULL'));

      // 4. Parsear con HTML fallback
      if (!parsed) {
        var textoHtml = _textoRecibo(msg, true);
        parsed = parsearEmailAppleRecibo(textoHtml, msg.getDate());
        Logger.log('   htmlFallback parse: ' + (parsed ? JSON.stringify({
          items: parsed.items.length,
          total: parsed.total,
          nombres: parsed.items.map(function(i) { return i.nombre + '=$' + i.monto; }).join(', ')
        }) : 'NULL'));
      }
    });
  });

  // 5. Leer Pendientes y probar resolución
  Logger.log('');
  Logger.log('=== PENDIENTES APPLE.COM/BILL ===');
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaPendientes(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('No hay pendientes'); return; }
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  data.forEach(function(fila, i) {
    var elem = String(fila[2] || '').trim();
    if (!/APPLE\.COM\/BILL/i.test(elem)) return;
    var fecha = fila[0];
    var monto = fila[1];
    var u4 = String(fila[3] || '').trim();
    var eid = String(fila[5] || '').trim();
    var fechaStr = fecha instanceof Date
      ? Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(fecha);
    Logger.log('Fila ' + (i+2) + ': ' + elem + ' $' + monto + ' fecha=' + fechaStr +
               ' u4=' + u4 + ' eid=' + eid + ' yaProcesado=' + esEmailProcesado(eid));
    var res = resolverCargoApple(parseFloat(monto), fechaStr, u4);
    Logger.log('  resolverCargoApple -> ' + JSON.stringify(res));
  });

  Logger.log('=== FIN DIAGNÓSTICO ===');
}

/**
 * Llamada desde el frontend (botón "Sincronizar ahora").
 * Procesa emails nuevos y reintenta los pendientes existentes.
 */
function sincronizarAhora() {
  try {
    var emails = procesarEmailsBancarios();
    var pend = procesarPendientes();
    var msg = 'Emails: ' + emails.registrados + ' registrados';
    if (emails.pendientes > 0) msg += ', ' + emails.pendientes + ' pendientes';
    if (pend.procesados > 0) msg += ' | Pendientes procesados: ' + pend.procesados;
    if (emails.registrados === 0 && emails.pendientes === 0 && pend.procesados === 0) {
      msg = 'Nada nuevo por procesar';
    }
    var n4p = contar4PagosActivos();
    if (n4p > 0) msg += ' | Planes 4 Pagos activos: ' + n4p;
    return {
      success: true,
      message: msg,
      pendientesRestantes: pend.restantes,
      pagos4Pendientes: n4p
    };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

/**
 * Crea el trigger que ejecuta procesarEmailsBancarios cada 15 min.
 * Ejecuta esta función UNA VEZ desde el editor de Apps Script.
 */
function crearTriggerEmails() {
  eliminarTriggerEmails();
  ScriptApp.newTrigger('procesarEmailsBancarios')
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log('Trigger creado: procesarEmailsBancarios cada 15 min');
}

/**
 * Elimina cualquier trigger de procesarEmailsBancarios existente.
 */
function eliminarTriggerEmails() {
  var triggers = ScriptApp.getProjectTriggers();
  var count = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'procesarEmailsBancarios') {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });
  Logger.log('Triggers eliminados: ' + count);
}

/**
 * Prueba el parser con el email de ejemplo de Chase.
 * Ejecuta esta función desde el editor y revisa el Registro.
 */
function testParserChase() {
  var body = 'Alerta de transacción\n\n' +
             'Hiciste una transacción de $15.83\n\n' +
             'Estos son los detalles:\n\n' +
             'Cuenta Chase Sapphire Preferred Visa (...8598)\n' +
             'Fecha ago 15, 2026 a las 7:06 PM ET\n' +
             'Comercio CRUNCHYROLL.COM\n' +
             'Cantidad $15.83';
  var res = parsearEmailChase(body, new Date());
  Logger.log('Test parser Chase (crédito): ' + JSON.stringify(res));
  // Esperado: {"fecha":"2026-08-15","elementoRaw":"CRUNCHYROLL.COM","ultimos4":"8598","monto":15.83}
}

/**
 * Prueba el parser con el formato de email de Chase para tarjeta de débito.
 */
function testParserChaseDebito() {
  var body = 'Alerta de transacción\n\n' +
             'Realizaste una transacción con tarjeta de débito de $31.20 con MY SUNNY LAUNDRY\n\n' +
             'Cuenta que termina en (...8310)\n' +
             'Realizada el ago 15, 2026 a las 2:22 PM ET\n' +
             'Cantidad $31.20';
  var res = parsearEmailChase(body, new Date());
  Logger.log('Test parser Chase (débito): ' + JSON.stringify(res));
  // Esperado: {"fecha":"2026-08-15","elementoRaw":"MY SUNNY LAUNDRY","ultimos4":"8310","monto":31.20}
}

/**
 * Prueba el parser de transferencias de Chase.
 */
function testParserGooglePlayRecibo() {
  var body = 'El recibo de tu pedido de Google Play del 23 ago 2026\n\n' +
             'Google Play\n\nGracias\n\n' +
             'Número de pedido: SOP.3328-2989-1183-29226..18\n' +
             'Fecha del pedido: 23 ago 2026 8:04:40 a.m. EDT\n\n' +
             'Artículo Precio\n' +
             'Google AI Plus (2 TB) (Google One) (de Google LLC) $9.99 por mes\n' +
             'Suscripción con renovación automática\n\n' +
             'Impuesto: $0.00\n' +
             'Total: $9.99 por mes\n\n' +
             'Forma de pago: Visa-7349';
  var res = parsearEmailGooglePlayRecibo(body, new Date());
  Logger.log('Test parser Google Play: ' + JSON.stringify(res));
  // Esperado: 1 item con nombre y monto, ultimos4 7349
}

function testParserAppleRecibo() {
  var body = 'Tu recibo de Apple\n\n' +
             'Recibo\n\n' +
             'Agosto 15, 2026\n\n' +
             'ID del pedido: MQ5SX48L8V\n\n' +
             'Microsoft OneDrive\nMicrosoft 365 Personal (mensual)\nSe renovará el septiembre 11, 2026\n$9.99\n\n' +
             'ChatGPT\nChatGPT Plus (mensual)\nSe renovará el septiembre 12, 2026\n$19.99\n\n' +
             'Subtotal $29.98\n\n' +
             'Visa **** 3634 $29.98';
  var res = parsearEmailAppleRecibo(body, new Date());
  Logger.log('Test parser Apple recibo: ' + JSON.stringify(res));
  // Esperado: 2 items (Microsoft OneDrive $9.99, ChatGPT $19.99), total 29.98, ultimos4 3634
}

function testParserChaseDeposito() {
  var body = 'Depósito registrado\n\n' +
             'Tienes un depósito directo de $1,513.70\n\n' +
             'Cuenta que termina en (...8310)\n' +
             'Registrado ago 5, 2026 a las 3:49 AM ET\n' +
             'Cantidad $1,513.70';
  var res = parsearEmailChaseDeposito(body, new Date());
  Logger.log('Test parser Chase (depósito): ' + JSON.stringify(res));
  // Esperado: {"fecha":"2026-08-05","monto":1513.7,"ultimos4":"8310","esDeposito":true}
}

function testParserChaseTransferencia() {
  var body = 'Alerta de transferencia\n\n' +
             'Enviaste $44.00 a WF CREDIT CARD\n\n' +
             'Cuenta que termina en (...8310)\n' +
             'Destinatario WF CREDIT CARD\n' +
             'Enviado en ago 10, 2026 a las 5:03 AM ET\n' +
             'Cantidad $44.00';
  var res = parsearEmailChaseTransferencia(body, new Date());
  Logger.log('Test parser Chase (transferencia): ' + JSON.stringify(res));
  // Esperado: {"fecha":"2026-08-10","elementoRaw":"WF CREDIT CARD","ultimos4":"8310","monto":44,"esTransferencia":true}
}

/* ============================================================
   DEUDAS ROTATIVAS — pagos mensuales automáticos
   ============================================================

   Función diaria: procesarPagosDeudas()   (trigger)
   CRUD:           obtenerDeudas / agregarDeuda / actualizarDeuda / eliminarDeuda
   Trigger:        crearTriggerDeudas / eliminarTriggerDeudas

   Al agregar una deuda se asegura que exista la subcategoría
   "Pago Deuda" en Gastos Fijos (la crea si falta).
   El trigger corre 1 vez al día. Para cada deuda activa cuyo
   "día del mes" coincida con hoy y aún no se haya pagado este mes,
   registra un movimiento en Gastos Fijos → Pago Deuda con método
   Transferencia y descuenta el monto del saldo restante.
   Si el saldo llega a 0 o menos, se marca la deuda como inactiva.
   ============================================================ */

function obtenerHojaDeudas(ss) {
  var sheet = ss.getSheetByName('Deudas');
  if (!sheet) {
    sheet = ss.insertSheet('Deudas');
    sheet.getRange(1, 1, 1, HEADERS_DEUDAS.length).setValues([HEADERS_DEUDAS]);
    sheet.getRange(1, 1, 1, HEADERS_DEUDAS.length)
      .setFontWeight('bold').setBackground('#e74c3c').setFontColor('white')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200); // Descripción
    sheet.setColumnWidth(2, 130); // Monto original
    sheet.setColumnWidth(3, 110); // Pagado
    sheet.setColumnWidth(4, 110); // Restante
    sheet.setColumnWidth(5, 120); // Pago mensual
    sheet.setColumnWidth(6, 100); // Día del mes
    sheet.setColumnWidth(7, 80);  // Activa
    sheet.setColumnWidth(8, 120); // Último pago
    sheet.setColumnWidth(9, 180); // Destinatario
  } else {
    // Auto-migración: agregar columna Destinatario si falta (v1.8.0)
    var lastCol = sheet.getLastColumn();
    if (lastCol < HEADERS_DEUDAS.length) {
      sheet.getRange(1, HEADERS_DEUDAS.length).setValue('Destinatario')
        .setFontWeight('bold').setBackground('#e74c3c').setFontColor('white')
        .setHorizontalAlignment('center');
      sheet.setColumnWidth(9, 180);
    }
  }
  return sheet;
}

function obtenerDeudas() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaDeudas(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_DEUDAS.length).getValues();
  var resultado = [];
  data.forEach(function(fila) {
    var descripcion = String(fila[0]).trim();
    if (!descripcion) return;
    resultado.push({
      descripcion: descripcion,
      montoOriginal: parseFloat(fila[1]) || 0,
      pagado: parseFloat(fila[2]) || 0,
      restante: parseFloat(fila[3]) || 0,
      pagoMensual: parseFloat(fila[4]) || 0,
      diaMes: parseInt(fila[5], 10) || 1,
      activa: String(fila[6]).trim() === 'Sí',
      ultimoPago: fila[7] instanceof Date
        ? Utilities.formatDate(fila[7], Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : '',
      destinatario: String(fila[8] || '').trim()
    });
  });
  return resultado;
}

/**
 * Asegura que la subcategoría "Pago Deuda" exista en Gastos Fijos.
 */
function _asegurarSubcategoriaPagoDeuda() {
  _asegurarSubcategoria(CATEGORIA_PAGO_DEUDA, SUBCAT_PAGO_DEUDA);
}

function agregarDeuda(descripcion, montoOriginal, pagoMensual, diaMes, destinatario) {
  try {
    descripcion = String(descripcion || '').trim();
    montoOriginal = parseFloat(montoOriginal);
    pagoMensual = parseFloat(pagoMensual) || 0;
    diaMes = parseInt(diaMes, 10) || 0;
    destinatario = String(destinatario || '').trim();

    if (!descripcion) return { success: false, message: 'Falta descripción' };
    if (!montoOriginal || montoOriginal <= 0) return { success: false, message: 'Monto original inválido' };
    // Pago mensual y día solo son obligatorios cuando NO hay destinatario
    // (con destinatario, el email de Chase decide el monto y la fecha)
    if (!destinatario) {
      if (!pagoMensual || pagoMensual <= 0) return { success: false, message: 'Falta pago mensual (o configura un Destinatario para actualizar desde emails)' };
      if (!diaMes || diaMes < 1 || diaMes > 28) return { success: false, message: 'Día del mes debe estar entre 1 y 28' };
    } else if (diaMes && (diaMes < 1 || diaMes > 28)) {
      return { success: false, message: 'Día del mes debe estar entre 1 y 28' };
    }

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaDeudas(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === descripcion.toLowerCase()) {
        return { success: false, message: 'Ya existe una deuda con esa descripción' };
      }
    }

    _asegurarSubcategoriaPagoDeuda();

    sheet.appendRow([descripcion, montoOriginal, 0, montoOriginal, pagoMensual, diaMes, 'Sí', '', destinatario]);
    var nr = sheet.getLastRow();
    sheet.getRange(nr, 2).setNumberFormat('$#,##0.00');
    sheet.getRange(nr, 3).setNumberFormat('$#,##0.00');
    sheet.getRange(nr, 4).setNumberFormat('$#,##0.00');
    sheet.getRange(nr, 5).setNumberFormat('$#,##0.00');
    sheet.getRange(nr, 8).setNumberFormat('dd/MM/yyyy');

    return { success: true, message: 'Deuda agregada', deudas: obtenerDeudas() };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

function actualizarDeuda(descripcion, montoOriginal, pagoMensual, diaMes, activa, destinatario) {
  try {
    descripcion = String(descripcion || '').trim();
    montoOriginal = parseFloat(montoOriginal);
    pagoMensual = parseFloat(pagoMensual) || 0;
    diaMes = parseInt(diaMes, 10) || 0;
    destinatario = String(destinatario || '').trim();

    if (!descripcion) return { success: false, message: 'Falta descripción' };
    if (!montoOriginal || montoOriginal <= 0) return { success: false, message: 'Monto original inválido' };
    if (!destinatario) {
      if (!pagoMensual || pagoMensual <= 0) return { success: false, message: 'Falta pago mensual (o configura un Destinatario)' };
      if (!diaMes || diaMes < 1 || diaMes > 28) return { success: false, message: 'Día del mes 1-28' };
    } else if (diaMes && (diaMes < 1 || diaMes > 28)) {
      return { success: false, message: 'Día del mes 1-28' };
    }

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaDeudas(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === descripcion) {
        var pagado = parseFloat(data[i][2]) || 0;
        sheet.getRange(i + 1, 2).setValue(montoOriginal);
        sheet.getRange(i + 1, 4).setValue(montoOriginal - pagado);
        sheet.getRange(i + 1, 5).setValue(pagoMensual);
        sheet.getRange(i + 1, 6).setValue(diaMes);
        sheet.getRange(i + 1, 7).setValue(activa ? 'Sí' : 'No');
        sheet.getRange(i + 1, 9).setValue(destinatario);
        return { success: true, message: 'Deuda actualizada', deudas: obtenerDeudas() };
      }
    }
    return { success: false, message: 'Deuda no encontrada' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

function eliminarDeuda(descripcion) {
  try {
    descripcion = String(descripcion || '').trim();
    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaDeudas(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === descripcion) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Deuda eliminada', deudas: obtenerDeudas() };
      }
    }
    return { success: false, message: 'Deuda no encontrada' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

/**
 * FUNCIÓN PRINCIPAL — llamada por trigger 1 vez al día.
 * Para cada deuda activa cuyo "día del mes" coincida con hoy y aún
 * no se haya pagado este mes, registra un movimiento y descuenta.
 */
function procesarPagosDeudas() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log('procesarPagosDeudas: no se pudo adquirir el lock');
    return { procesados: 0 };
  }
  try {
    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaDeudas(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { procesados: 0 };

    _asegurarSubcategoriaPagoDeuda();

    var hoy = new Date();
    var diaHoy = hoy.getDate();
    var mesHoy = hoy.getMonth();
    var anioHoy = hoy.getFullYear();
    var fechaHoyStr = Utilities.formatDate(hoy, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_DEUDAS.length).getValues();
    var procesados = 0;

    data.forEach(function(fila, i) {
      var descripcion = String(fila[0]).trim();
      var montoOriginal = parseFloat(fila[1]) || 0;
      var pagado = parseFloat(fila[2]) || 0;
      var restante = parseFloat(fila[3]) || 0;
      var pagoMensual = parseFloat(fila[4]) || 0;
      var diaMes = parseInt(fila[5], 10) || 1;
      var activa = String(fila[6]).trim() === 'Sí';
      var ultimoPago = fila[7] instanceof Date ? fila[7] : null;
      var destinatario = String(fila[8] || '').trim();

      if (!descripcion || !activa) return;
      // Si la deuda está vinculada a un destinatario de transfer, el email
      // real es la fuente de la verdad. Este trigger no genera nada.
      if (destinatario) return;
      if (restante <= 0) {
        sheet.getRange(i + 2, 7).setValue('No');
        return;
      }
      if (diaMes !== diaHoy) return;
      // ya se pagó este mes?
      if (ultimoPago && ultimoPago.getMonth() === mesHoy && ultimoPago.getFullYear() === anioHoy) return;

      var montoPago = Math.min(pagoMensual, restante);

      registrarMovimiento({
        fecha: fechaHoyStr,
        categoria: CATEGORIA_PAGO_DEUDA,
        subcategoria: SUBCAT_PAGO_DEUDA,
        monto: montoPago,
        descripcion: descripcion,
        metodoPago: 'Transferencia',
        notas: '[Auto Deuda] ' + descripcion
      });

      var nuevoPagado = pagado + montoPago;
      var nuevoRestante = montoOriginal - nuevoPagado;
      sheet.getRange(i + 2, 3).setValue(nuevoPagado);
      sheet.getRange(i + 2, 4).setValue(nuevoRestante);
      sheet.getRange(i + 2, 8).setValue(hoy);
      if (nuevoRestante <= 0) sheet.getRange(i + 2, 7).setValue('No');
      procesados++;
    });

    Logger.log('Deudas: pagos procesados hoy = ' + procesados);
    return { procesados: procesados };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Crea el trigger diario para procesarPagosDeudas.
 * Ejecuta 1 vez desde el editor de Apps Script.
 */
function crearTriggerDeudas() {
  eliminarTriggerDeudas();
  ScriptApp.newTrigger('procesarPagosDeudas')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  Logger.log('Trigger creado: procesarPagosDeudas diario ~6am');
}

function eliminarTriggerDeudas() {
  var triggers = ScriptApp.getProjectTriggers();
  var count = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'procesarPagosDeudas') {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });
  Logger.log('Triggers de deudas eliminados: ' + count);
}

/* ============================================================
   CHASE 4 PAGOS — reembolso + cuotas automáticas
   ============================================================

   Al configurar 4 Pagos sobre una compra ya registrada, Chase:
   1. DEVUELVE el monto total a tu cuenta
   2. Cobra 4 cuotas (cada 2 semanas desde la fecha del primer pago)
   3. Manda un email "Configuraste un nuevo Chase 4 Pagos"
   Las cuotas NO generan email de transacción, solo un recordatorio
   2 días antes del vencimiento.

   Qué hace la app (todo automático):
   - Email de setup: registra el reembolso como ingreso (+total) y
     crea el plan en la hoja "4 Pagos" con su calendario de cuotas.
     La clasificación (categoría/subcategoría/elemento) se copia de
     la compra original; si no se encuentra, se usa el mapeo por comercio.
   - Cada cuota vencida se registra como gasto en esa clasificación
     (se revisa en cada sincronización de emails y en el trigger diario).
     Las primeras 3 son la cuota; la 4ª ajusta el redondeo.
   - Email recordatorio: confirma la fecha real de vencimiento del
     próximo pago (si Chase la movió, el calendario se actualiza).
   ============================================================ */

var SUBCAT_REEMBOLSO_4PAGOS = 'Reembolso 4 Pagos';
var CUOTAS_4PAGOS = 4;
var DIAS_ENTRE_CUOTAS_4PAGOS = 14;

function obtenerHoja4Pagos(ss) {
  var sheet = ss.getSheetByName('4 Pagos');
  if (!sheet) {
    sheet = ss.insertSheet('4 Pagos');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100); // Numero plan
    sheet.setColumnWidth(2, 110); // Fecha detectada
    sheet.setColumnWidth(3, 100); // Monto total
    sheet.setColumnWidth(4, 180); // Comercio
    sheet.setColumnWidth(5, 100); // Cuenta origen
    sheet.setColumnWidth(6, 100); // Cuota
    sheet.setColumnWidth(7, 110); // Primer pago
    sheet.setColumnWidth(8, 100); // Estado
    sheet.setColumnWidth(9, 110); // Cuotas pagadas
    sheet.setColumnWidth(10, 200); // EmailID
    sheet.setColumnWidth(11, 130); // Categoría
    sheet.setColumnWidth(12, 150); // Subcategoría
    sheet.setColumnWidth(13, 150); // Elemento
    sheet.setColumnWidth(14, 110); // Próximo pago
  }
  // Siempre asegurar encabezados actuales (migra hojas de versiones anteriores)
  sheet.getRange(1, 1, 1, HEADERS_4PAGOS.length).setValues([HEADERS_4PAGOS])
    .setFontWeight('bold').setBackground('#8e44ad').setFontColor('white')
    .setHorizontalAlignment('center');
  return sheet;
}

/**
 * Parser del email de SETUP de Chase 4 Pagos.
 * Retorna { numeroPlan, montoTotal, comercio, cuentaOrigen, cuota, fechaPrimerPago } o null.
 */
function parsearEmailChase4PagosSetup(body) {
  var text = String(body || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
  if (!/Configuraste un nuevo Chase 4 Pagos/i.test(text)) return null;

  // Monto total: "Pusimos $NN.NN de vuelta"
  var mMonto = text.match(/Pusimos\s+\$\s*([\d,]+\.\d{2})\s+de vuelta/i);
  if (!mMonto) return null;
  var montoTotal = parseFloat(mMonto[1].replace(/,/g, ''));

  // Cuenta origen: "en tu cuenta de cheques (...NNNN)" (acepta "..." o "…")
  var mCuenta = text.match(/en tu cuenta de cheques\s*\(\s*(?:\.{2,}|…|\*{2,})\s*(\d{4})\s*\)/i);
  var cuentaOrigen = mCuenta ? mCuenta[1] : '';

  // Comercio: "Descripción Pay in 4 Deposit - TMOBILE*AUTO PAY (...1249)"
  // o formato viejo "POS DEBIT COMERCIO (...". Se quita el prefijo "Pay in 4 Deposit -".
  var comercio = '';
  var mDesc = text.match(/Descripci[óo]n\s+(.+?)\s*(?:\(\s*(?:\.{2,}|…|\*{2,})|\n)/i);
  if (mDesc) {
    comercio = mDesc[1].replace(/^Pay in 4 Deposit\s*-\s*/i, '').replace(/^POS DEBIT\s+/i, '').trim();
  } else {
    var mMerchant = text.match(/POS DEBIT\s+([A-Z0-9][A-Z0-9\s\.\-*&\/]+?)\s*(?:\(\s*(?:\.{2,}|…|\*{2,})|\n)/i);
    if (mMerchant) comercio = mMerchant[1].trim();
  }

  // Número de plan: "Número de plan (…1249)" / "Número plan (...1249)"
  var mPlan = text.match(/N[úu]mero (?:de )?plan\s*\(\s*(?:\.{2,}|…|\*{2,})\s*(\d{4})\s*\)/i);
  var numeroPlan = mPlan ? mPlan[1] : '';
  if (!numeroPlan) {
    // Respaldo: el número entre paréntesis al final de la descripción
    var mPlan2 = text.match(/Descripci[óo]n[^\n]*?\(\s*(?:\.{2,}|…|\*{2,})\s*(\d{4})\s*\)/i);
    if (mPlan2) numeroPlan = mPlan2[1];
  }

  // Cuota: "primer pago de $NN.NN"
  var mCuota = text.match(/primer pago de\s+\$\s*([\d,]+\.\d{2})/i);
  var cuota = mCuota ? parseFloat(mCuota[1].replace(/,/g, '')) : (montoTotal / 4);

  // Fecha primer pago: "$NN.NN agosto 16, 2026"
  var fechaPrimerPago = '';
  var mFecha = text.match(/primer pago de \$[\d.,]+\s+([a-záéíóú]+)\s+(\d{1,2}),?\s*(\d{4})/i);
  if (mFecha) {
    var mesNombre = mFecha[1].toLowerCase();
    var mesNum = MESES_ES_LARGO[mesNombre];
    if (mesNum !== undefined) {
      var mm = ('0' + (mesNum + 1)).slice(-2);
      var dd = ('0' + parseInt(mFecha[2], 10)).slice(-2);
      fechaPrimerPago = mFecha[3] + '-' + mm + '-' + dd;
    }
  }

  return {
    numeroPlan: numeroPlan,
    montoTotal: montoTotal,
    comercio: comercio,
    cuentaOrigen: cuentaOrigen,
    cuota: cuota,
    fechaPrimerPago: fechaPrimerPago
  };
}

/**
 * Parser del email de RECORDATORIO de Chase 4 Pagos.
 * Retorna { numeroPlan, monto, fechaVencimiento (yyyy-MM-dd | '') } o null.
 */
function parsearEmailChase4PagosRecordatorio(body) {
  var text = String(body || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
  if (!/Tu pago de Chase 4 Pagos\s*(?:SM)?\s+vence/i.test(text)) return null;

  var mPlan = text.match(/Cuenta del plan\s*\(\s*(?:\.{2,}|…|\*{2,})\s*(\d{4})\s*\)/i);
  var mMonto = text.match(/Cantidad actual adeudada\s*\$\s*([\d,]+\.\d{2})/i);

  // "Fecha de vencimiento sep 27, 2026" (mes abreviado o largo)
  var fecha = '';
  var mFecha = text.match(/Fecha de vencimiento\s*([a-záéíóú]+)\.?\s+(\d{1,2}),?\s*(\d{4})/i);
  if (mFecha) {
    var nombre = mFecha[1].toLowerCase();
    var mesNum = MESES_ES_LARGO[nombre];
    if (mesNum === undefined) mesNum = MESES_ES_ABR[nombre];
    if (mesNum !== undefined) {
      fecha = mFecha[3] + '-' + ('0' + (mesNum + 1)).slice(-2) + '-' + ('0' + parseInt(mFecha[2], 10)).slice(-2);
    }
  }

  return {
    numeroPlan: mPlan ? mPlan[1] : '',
    monto: mMonto ? parseFloat(mMonto[1].replace(/,/g, '')) : 0,
    fechaVencimiento: fecha
  };
}

/**
 * Parser del email "Liquidaste tu plan" de Chase 4 Pagos.
 * Retorna { numeroPlan, fecha (yyyy-MM-dd | '') } o null.
 */
function parsearEmailChase4PagosLiquidado(body, emailDate) {
  var text = String(body || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
  if (!/Liquidaste tu plan/i.test(text) || !/se pag[óo] en su totalidad/i.test(text)) return null;

  var mPlan = text.match(/\(\s*(?:\.{2,}|…|\*{2,})\s*(\d{4})\s*\)\s*se pag[óo]/i);
  var fecha = '';
  var mFecha = text.match(/en su totalidad en\s+([a-záéíóú]+)\.?\s+(\d{1,2}),?\s*(\d{4})/i);
  if (mFecha) {
    var nombre = mFecha[1].toLowerCase();
    var mesNum = MESES_ES_LARGO[nombre];
    if (mesNum === undefined) mesNum = MESES_ES_ABR[nombre];
    if (mesNum !== undefined) {
      fecha = mFecha[3] + '-' + ('0' + (mesNum + 1)).slice(-2) + '-' + ('0' + parseInt(mFecha[2], 10)).slice(-2);
    }
  }
  if (!fecha && emailDate) fecha = _fmtFecha4P(emailDate);
  return { numeroPlan: mPlan ? mPlan[1] : '', fecha: fecha };
}

/**
 * Plan liquidado: si faltaban cuotas por registrar (liquidación anticipada),
 * registra el saldo restante en una sola vez y marca el plan 'completado'.
 * Debe llamarse con el lock de script ya adquirido.
 */
function liquidar4Pagos(liq) {
  if (!liq.numeroPlan) return;
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHoja4Pagos(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_4PAGOS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    var f = data[i];
    if (String(f[0]).trim() !== liq.numeroPlan || String(f[7]).trim() !== 'activo') continue;
    var total = parseFloat(f[2]) || 0;
    var cuota = parseFloat(f[5]) || (total / CUOTAS_4PAGOS);
    var pagadas = parseInt(f[8], 10) || 0;
    if (pagadas < CUOTAS_4PAGOS) {
      var yaRegistrado = Math.min(pagadas, CUOTAS_4PAGOS) * cuota;
      var restante = Math.round((total - yaRegistrado) * 100) / 100;
      if (restante > 0.005) {
        registrarMovimiento({
          fecha: liq.fecha || _fmtFecha4P(new Date()),
          categoria: String(f[10]).trim(),
          subcategoria: String(f[11]).trim(),
          monto: restante,
          descripcion: String(f[12]).trim(),
          metodoPago: 'Tarjeta Débito',
          notas: '[Auto 4 Pagos] Liquidación anticipada plan ...' + liq.numeroPlan
        });
      }
    }
    sheet.getRange(i + 2, 9).setValue(CUOTAS_4PAGOS);
    sheet.getRange(i + 2, 8).setValue('completado');
    return;
  }
}

function _fmtFecha4P(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _sumarDias4P(fechaStr, dias) {
  var d = new Date(fechaStr + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return _fmtFecha4P(d);
}

/**
 * Busca la compra original del plan (mismo monto total, últimos 45 días,
 * monto positivo, no ingreso) para copiar su clasificación.
 */
function _clasificacionCompraOriginal4P(montoTotal) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaMovimientos(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var hace45 = new Date(Date.now() - 45 * 24 * 3600 * 1000);
  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var mejor = null;
  data.forEach(function(f) {
    var ts = f[0];
    if (!(ts instanceof Date) || ts < hace45) return;
    if (String(f[2]).trim() === CATEGORIA_DEPOSITO) return;
    if (Math.abs((parseFloat(f[4]) || 0) - montoTotal) > 0.01) return;
    if (!mejor || ts > mejor.ts) {
      mejor = { ts: ts, categoria: String(f[2]).trim(), subcategoria: String(f[3]).trim(), elemento: String(f[5]).trim() };
    }
  });
  return mejor;
}

/**
 * Procesa un email de setup: registra reembolso, crea plan y calendario.
 * Debe llamarse con el lock de script ya adquirido.
 */
function agregar4Pagos(setup, emailId, fecha) {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHoja4Pagos(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var planes = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    for (var i = 0; i < planes.length; i++) {
      if (String(planes[i][0]).trim() === setup.numeroPlan &&
          (String(planes[i][7]).trim() === 'activo' || String(planes[i][9]).trim() === emailId)) return;
    }
  }

  // Clasificación: compra original → mapeo por comercio → sin clasificar
  var cat = '', sub = '', elem = '';
  var orig = _clasificacionCompraOriginal4P(setup.montoTotal);
  if (orig) {
    cat = orig.categoria; sub = orig.subcategoria; elem = orig.elemento;
  } else {
    var mapeo = buscarMapeoElemento(setup.comercio);
    if (mapeo) { cat = mapeo.categoria; sub = mapeo.subcategoria; elem = mapeo.elemento; }
  }
  if (!cat) {
    cat = 'Gastos Variables'; sub = 'Sin clasificar'; elem = setup.comercio || '4 Pagos';
    _asegurarSubcategoria(cat, sub);
  }

  var fechaSetup = _fmtFecha4P(fecha || new Date());

  // Reembolso (positivo)
  _asegurarSubcategoria(CATEGORIA_DEPOSITO, SUBCAT_REEMBOLSO_4PAGOS);
  registrarMovimiento({
    fecha: fechaSetup,
    categoria: CATEGORIA_DEPOSITO,
    subcategoria: SUBCAT_REEMBOLSO_4PAGOS,
    monto: setup.montoTotal,
    descripcion: 'Reembolso 4 Pagos ' + (setup.comercio || ''),
    metodoPago: 'Transferencia',
    notas: '[Auto 4 Pagos] Reembolso plan ...' + setup.numeroPlan
  });

  var primerPago = setup.fechaPrimerPago || _sumarDias4P(fechaSetup, DIAS_ENTRE_CUOTAS_4PAGOS);

  sheet.appendRow([
    setup.numeroPlan,
    fecha || new Date(),
    setup.montoTotal,
    setup.comercio,
    setup.cuentaOrigen,
    setup.cuota,
    new Date(primerPago + 'T00:00:00'),
    'activo',
    0,
    emailId,
    cat, sub, elem,
    new Date(primerPago + 'T00:00:00')
  ]);
  var nr = sheet.getLastRow();
  sheet.getRange(nr, 2).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(nr, 3).setNumberFormat('$#,##0.00');
  sheet.getRange(nr, 6).setNumberFormat('$#,##0.00');
  sheet.getRange(nr, 7).setNumberFormat('dd/MM/yyyy');
  sheet.getRange(nr, 14).setNumberFormat('dd/MM/yyyy');
}

/**
 * Recordatorio: actualiza la fecha del próximo pago del plan.
 * Debe llamarse con el lock de script ya adquirido.
 */
function actualizarProximoPago4Pagos(recordatorio) {
  if (!recordatorio.numeroPlan || !recordatorio.fechaVencimiento) return;
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHoja4Pagos(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_4PAGOS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === recordatorio.numeroPlan && String(data[i][7]).trim() === 'activo') {
      sheet.getRange(i + 2, 14).setValue(new Date(recordatorio.fechaVencimiento + 'T00:00:00'))
        .setNumberFormat('dd/MM/yyyy');
      return;
    }
  }
}

/**
 * Registra las cuotas vencidas (fecha <= hoy) de todos los planes activos.
 * Sin lock propio: se invoca dentro de procesarEmailsBancarios o del wrapper.
 */
function _procesarCuotas4Pagos() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHoja4Pagos(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var hoyStr = _fmtFecha4P(new Date());
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_4PAGOS.length).getValues();
  var registradas = 0;

  data.forEach(function(f, i) {
    if (String(f[7]).trim() !== 'activo') return;
    var fila = i + 2;
    var total = parseFloat(f[2]) || 0;
    var cuota = parseFloat(f[5]) || (total / CUOTAS_4PAGOS);
    var pagadas = parseInt(f[8], 10) || 0;
    var proximo = f[13] instanceof Date ? _fmtFecha4P(f[13]) : '';
    if (!proximo) return;

    while (pagadas < CUOTAS_4PAGOS && proximo <= hoyStr) {
      var monto = (pagadas === CUOTAS_4PAGOS - 1)
        ? Math.round((total - cuota * (CUOTAS_4PAGOS - 1)) * 100) / 100
        : cuota;
      var res = registrarMovimiento({
        fecha: proximo,
        categoria: String(f[10]).trim(),
        subcategoria: String(f[11]).trim(),
        monto: monto,
        descripcion: String(f[12]).trim(),
        metodoPago: 'Tarjeta Débito',
        notas: '[Auto 4 Pagos] Cuota ' + (pagadas + 1) + '/' + CUOTAS_4PAGOS + ' plan ...' + String(f[0]).trim() +
               ' cuenta ...' + String(f[4]).trim()
      });
      if (!res.success) break;
      pagadas++;
      registradas++;
      proximo = _sumarDias4P(proximo, DIAS_ENTRE_CUOTAS_4PAGOS);
      sheet.getRange(fila, 9).setValue(pagadas);
    }
    if (pagadas >= CUOTAS_4PAGOS) {
      sheet.getRange(fila, 8).setValue('completado');
    } else {
      sheet.getRange(fila, 14).setValue(new Date(proximo + 'T00:00:00')).setNumberFormat('dd/MM/yyyy');
    }
  });
  return registradas;
}

/**
 * UNA SOLA VEZ: lee emails de 4 Pagos más antiguos que la ventana normal (7 días).
 * Solo busca dentro del label Banco/Alertas y solo mensajes de 4 Pagos.
 * Idempotente: un plan ya registrado no se duplica. Ejecutar desde el editor.
 */
function importarEmails4PagosAntiguos() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { Logger.log('Lock ocupado, reintenta'); return; }
  try {
    var threads = GmailApp.search('label:' + GMAIL_QUERY.match(/label:(\S+)/)[1] + ' "4 Pagos" newer_than:90d', 0, 50);
    var msgs = [];
    threads.forEach(function(t) {
      t.getMessages().forEach(function(m) { if (esRemitentePermitido(m.getFrom())) msgs.push(m); });
    });
    msgs.sort(function(a, b) { return a.getDate() - b.getDate(); });

    var n = { setup: 0, liquidado: 0 };
    msgs.forEach(function(m) {
      var body = m.getPlainBody();
      var s4 = parsearEmailChase4PagosSetup(body);
      if (s4 && s4.numeroPlan) { agregar4Pagos(s4, m.getId(), m.getDate()); n.setup++; return; }
      var l4 = parsearEmailChase4PagosLiquidado(body, m.getDate());
      if (l4) { liquidar4Pagos(l4); n.liquidado++; }
    });
    var cuotas = _procesarCuotas4Pagos();
    Logger.log('Importación 4 Pagos: ' + JSON.stringify(n) + ' | cuotas registradas: ' + cuotas);
  } finally {
    lock.releaseLock();
  }
}

/** Wrapper con lock para el trigger diario / ejecución manual. */
function procesarCuotas4Pagos() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { registradas: 0 }; }
  try {
    var n = _procesarCuotas4Pagos();
    Logger.log('4 Pagos: cuotas registradas = ' + n);
    return { registradas: n };
  } finally {
    lock.releaseLock();
  }
}

function crearTrigger4Pagos() {
  eliminarTrigger4Pagos();
  ScriptApp.newTrigger('procesarCuotas4Pagos').timeBased().atHour(6).everyDays(1).create();
  Logger.log('Trigger creado: procesarCuotas4Pagos diario ~6am');
}

function eliminarTrigger4Pagos() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'procesarCuotas4Pagos') ScriptApp.deleteTrigger(t);
  });
}

/**
 * Retorna los planes 4 Pagos activos para el frontend.
 */
function obtener4PagosActivos() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHoja4Pagos(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var tz = Session.getScriptTimeZone();
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_4PAGOS.length).getValues();
  var resultado = [];
  data.forEach(function(f) {
    if (String(f[7]).trim() !== 'activo') return;
    var total = parseFloat(f[2]) || 0;
    var cuota = parseFloat(f[5]) || 0;
    var pagadas = parseInt(f[8], 10) || 0;
    var restante = total - (pagadas >= CUOTAS_4PAGOS ? total : Math.min(pagadas, CUOTAS_4PAGOS - 1) * cuota);
    resultado.push({
      numeroPlan: String(f[0]).trim(),
      montoTotal: total,
      comercio: String(f[3]).trim(),
      cuentaOrigen: String(f[4]).trim(),
      cuota: cuota,
      cuotasPagadas: pagadas,
      totalCuotas: CUOTAS_4PAGOS,
      restante: Math.round(restante * 100) / 100,
      proximoPago: f[13] instanceof Date ? Utilities.formatDate(f[13], tz, 'yyyy-MM-dd') : '',
      clasificacion: [f[10], f[11], f[12]].filter(String).join(' › ')
    });
  });
  return resultado;
}

function contar4PagosActivos() {
  return obtener4PagosActivos().length;
}

/**
 * Cancela un plan (detección incorrecta o liquidado antes): no se
 * registran más cuotas. No revierte el reembolso ni cuotas ya registradas.
 */
function ignorar4Pagos(numeroPlan) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    return { success: false, message: 'Otra operación en curso, reintenta' };
  }
  try {
    numeroPlan = String(numeroPlan || '').trim();
    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHoja4Pagos(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, message: 'No hay planes' };
    var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_4PAGOS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === numeroPlan && String(data[i][7]).trim() === 'activo') {
        sheet.getRange(i + 2, 8).setValue('cancelado');
        return { success: true, message: 'Plan cancelado: no se registrarán más cuotas' };
      }
    }
    return { success: false, message: 'Plan no encontrado' };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
   PAGOS RECURRENTES — gastos fijos que se auto-generan mensualmente
   ============================================================

   Similar a Deudas pero sin balance ni monto total. Solo un
   movimiento fijo que se registra cada mes en el día configurado.
   Ideal para: gym con débito automático de banco externo,
   subscripciones sin email, HOA, mensualidades sin balance.

   NO usar para pagos que ya llegan por email de Chase (rent vía
   transfer, subscripciones vía tarjeta) — esos se duplicarían.
   Para esos casos, agrega un elemento en la subcategoría destino.
   ============================================================ */

function obtenerHojaRecurrentes(ss) {
  var sheet = ss.getSheetByName('Recurrentes');
  if (!sheet) {
    sheet = ss.insertSheet('Recurrentes');
    sheet.getRange(1, 1, 1, HEADERS_RECURRENTES.length).setValues([HEADERS_RECURRENTES]);
    sheet.getRange(1, 1, 1, HEADERS_RECURRENTES.length)
      .setFontWeight('bold').setBackground('#16a085').setFontColor('white')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180); // Descripción
    sheet.setColumnWidth(2, 140); // Categoría
    sheet.setColumnWidth(3, 160); // Subcategoría
    sheet.setColumnWidth(4, 110); // Monto
    sheet.setColumnWidth(5, 90);  // Día
    sheet.setColumnWidth(6, 140); // Método pago
    sheet.setColumnWidth(7, 80);  // Activo
    sheet.setColumnWidth(8, 120); // Último pago
  }
  return sheet;
}

function obtenerRecurrentes() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaRecurrentes(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_RECURRENTES.length).getValues();
  var resultado = [];
  data.forEach(function(fila) {
    var descripcion = String(fila[0]).trim();
    if (!descripcion) return;
    resultado.push({
      descripcion: descripcion,
      categoria: String(fila[1]).trim(),
      subcategoria: String(fila[2]).trim(),
      monto: parseFloat(fila[3]) || 0,
      diaMes: parseInt(fila[4], 10) || 1,
      metodoPago: String(fila[5]).trim() || 'Transferencia',
      activo: String(fila[6]).trim() === 'Sí',
      ultimoPago: fila[7] instanceof Date
        ? Utilities.formatDate(fila[7], Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : ''
    });
  });
  return resultado;
}

function agregarRecurrente(descripcion, categoria, subcategoria, monto, diaMes, metodoPago) {
  try {
    descripcion = String(descripcion || '').trim();
    categoria = String(categoria || '').trim();
    subcategoria = String(subcategoria || '').trim();
    monto = parseFloat(monto);
    diaMes = parseInt(diaMes, 10);
    metodoPago = String(metodoPago || 'Transferencia').trim();

    if (!descripcion) return { success: false, message: 'Falta descripción' };
    if (CATEGORIAS.indexOf(categoria) === -1) return { success: false, message: 'Categoría no válida' };
    if (!subcategoria) return { success: false, message: 'Falta subcategoría' };
    if (!monto || monto <= 0) return { success: false, message: 'Monto inválido' };
    if (!diaMes || diaMes < 1 || diaMes > 28) return { success: false, message: 'Día del mes debe estar entre 1 y 28' };

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaRecurrentes(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === descripcion.toLowerCase()) {
        return { success: false, message: 'Ya existe un pago recurrente con esa descripción' };
      }
    }

    sheet.appendRow([descripcion, categoria, subcategoria, monto, diaMes, metodoPago, 'Sí', '']);
    var nr = sheet.getLastRow();
    sheet.getRange(nr, 4).setNumberFormat('$#,##0.00');
    sheet.getRange(nr, 8).setNumberFormat('dd/MM/yyyy');

    return { success: true, message: 'Pago recurrente agregado', recurrentes: obtenerRecurrentes() };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

function actualizarRecurrente(descripcion, categoria, subcategoria, monto, diaMes, metodoPago, activo) {
  try {
    descripcion = String(descripcion || '').trim();
    categoria = String(categoria || '').trim();
    subcategoria = String(subcategoria || '').trim();
    monto = parseFloat(monto);
    diaMes = parseInt(diaMes, 10);
    metodoPago = String(metodoPago || 'Transferencia').trim();

    if (!descripcion) return { success: false, message: 'Falta descripción' };
    if (CATEGORIAS.indexOf(categoria) === -1) return { success: false, message: 'Categoría no válida' };
    if (!subcategoria) return { success: false, message: 'Falta subcategoría' };
    if (!monto || monto <= 0) return { success: false, message: 'Monto inválido' };
    if (!diaMes || diaMes < 1 || diaMes > 28) return { success: false, message: 'Día del mes 1-28' };

    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaRecurrentes(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === descripcion) {
        sheet.getRange(i + 1, 2).setValue(categoria);
        sheet.getRange(i + 1, 3).setValue(subcategoria);
        sheet.getRange(i + 1, 4).setValue(monto);
        sheet.getRange(i + 1, 5).setValue(diaMes);
        sheet.getRange(i + 1, 6).setValue(metodoPago);
        sheet.getRange(i + 1, 7).setValue(activo ? 'Sí' : 'No');
        return { success: true, message: 'Pago recurrente actualizado', recurrentes: obtenerRecurrentes() };
      }
    }
    return { success: false, message: 'Pago recurrente no encontrado' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

function eliminarRecurrente(descripcion) {
  try {
    descripcion = String(descripcion || '').trim();
    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaRecurrentes(ss);
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === descripcion) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Pago recurrente eliminado', recurrentes: obtenerRecurrentes() };
      }
    }
    return { success: false, message: 'No encontrado' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

/**
 * FUNCIÓN PRINCIPAL — trigger diario.
 * Registra automáticamente cada pago recurrente cuyo día del mes
 * coincida con hoy y aún no se haya pagado este mes.
 */
function procesarPagosRecurrentes() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    Logger.log('procesarPagosRecurrentes: no se pudo adquirir el lock');
    return { procesados: 0 };
  }
  try {
    var ss = SpreadsheetApp.openById(getSpreadsheetId());
    var sheet = obtenerHojaRecurrentes(ss);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { procesados: 0 };

    var hoy = new Date();
    var diaHoy = hoy.getDate();
    var mesHoy = hoy.getMonth();
    var anioHoy = hoy.getFullYear();
    var fechaHoyStr = Utilities.formatDate(hoy, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    var data = sheet.getRange(2, 1, lastRow - 1, HEADERS_RECURRENTES.length).getValues();
    var procesados = 0;

    data.forEach(function(fila, i) {
      var descripcion = String(fila[0]).trim();
      var categoria = String(fila[1]).trim();
      var subcategoria = String(fila[2]).trim();
      var monto = parseFloat(fila[3]) || 0;
      var diaMes = parseInt(fila[4], 10) || 1;
      var metodoPago = String(fila[5]).trim() || 'Transferencia';
      var activo = String(fila[6]).trim() === 'Sí';
      var ultimoPago = fila[7] instanceof Date ? fila[7] : null;

      if (!descripcion || !activo || !monto) return;
      if (diaMes !== diaHoy) return;
      if (ultimoPago && ultimoPago.getMonth() === mesHoy && ultimoPago.getFullYear() === anioHoy) return;

      registrarMovimiento({
        fecha: fechaHoyStr,
        categoria: categoria,
        subcategoria: subcategoria,
        monto: monto,
        descripcion: descripcion,
        metodoPago: metodoPago,
        notas: '[Auto Recurrente] ' + descripcion
      });

      sheet.getRange(i + 2, 8).setValue(hoy);
      procesados++;
    });

    Logger.log('Recurrentes: procesados hoy = ' + procesados);
    return { procesados: procesados };
  } finally {
    lock.releaseLock();
  }
}

function crearTriggerRecurrentes() {
  eliminarTriggerRecurrentes();
  ScriptApp.newTrigger('procesarPagosRecurrentes')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  Logger.log('Trigger creado: procesarPagosRecurrentes diario ~6am');
}

function eliminarTriggerRecurrentes() {
  var triggers = ScriptApp.getProjectTriggers();
  var count = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'procesarPagosRecurrentes') {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });
  Logger.log('Triggers de recurrentes eliminados: ' + count);
}

/* ============================================================
   RESUMEN EN VIVO PARA EL DASHBOARD DE LA APP
   ============================================================

   Lee directo de Movimientos (fuente de la verdad), agrupa por
   año-mes → categoría → subcategoría → descripción (elemento).
   El frontend consume estas dos funciones para mostrar el resumen
   sin depender de la hoja Dashboard.
   ============================================================ */

/**
 * Retorna la lista de meses con al menos 1 movimiento registrado.
 * Formato: [{ anio, mes, key: '2026-08', label: 'Agosto 2026' }]
 * Ordenados descendente (más recientes primero).
 */
function obtenerMesesConDatos() {
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaMovimientos(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var fechas = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var vistos = {};
  var resultado = [];

  fechas.forEach(function(fila) {
    var f = fila[0];
    if (!(f instanceof Date)) return;
    var anio = f.getFullYear();
    var mes = f.getMonth();
    var key = anio + '-' + ('0' + (mes + 1)).slice(-2);
    if (!vistos[key]) {
      vistos[key] = true;
      resultado.push({
        anio: anio,
        mes: mes + 1, // 1-based para el frontend
        key: key,
        label: MESES[mes] + ' ' + anio
      });
    }
  });

  // Descendente: más reciente primero
  resultado.sort(function(a, b) { return b.key.localeCompare(a.key); });
  return resultado;
}

/**
 * Retorna el resumen agrupado de un mes específico.
 * Estructura:
 * {
 *   anio, mes, label,
 *   totalIngresos, totalGastos, balance,
 *   totalesPorCategoria: { 'Ingresos': N, 'Ahorro': N, ... },
 *   categorias: {
 *     'Gastos Fijos': {
 *       total: N,
 *       subcategorias: {
 *         'Alquiler': {
 *           total: N,
 *           count: N,
 *           elementos: [ { nombre: 'X', plan: 'NNNN' | '', total: N, count: N }, ... ]
 *         }
 *       }
 *     }
 *   }
 * }
 */
function obtenerResumenMes(anio, mes) {
  anio = parseInt(anio, 10);
  mes = parseInt(mes, 10); // 1-based
  if (!anio || !mes || mes < 1 || mes > 12) {
    return { error: 'Año o mes inválido' };
  }

  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var sheet = obtenerHojaMovimientos(ss);
  var lastRow = sheet.getLastRow();

  var resultado = {
    anio: anio,
    mes: mes,
    label: MESES[mes - 1] + ' ' + anio,
    totalIngresos: 0,
    totalGastos: 0,
    balance: 0,
    totalesPorCategoria: {},
    categorias: {}
  };

  // Inicializar cada categoría
  CATEGORIAS.forEach(function(cat) {
    resultado.totalesPorCategoria[cat] = 0;
    resultado.categorias[cat] = { total: 0, subcategorias: {} };
  });

  if (lastRow < 2) return resultado;

  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

  data.forEach(function(fila) {
    var fechaMov = fila[1];
    if (!(fechaMov instanceof Date)) return;
    if (fechaMov.getFullYear() !== anio) return;
    if (fechaMov.getMonth() + 1 !== mes) return;

    var categoria = String(fila[2]).trim();
    var subcategoria = String(fila[3]).trim();
    var monto = parseFloat(fila[4]) || 0;
    var descripcion = String(fila[5]).trim();
    // Cuotas de 4 Pagos: la nota trae '[Auto 4 Pagos] ... plan ...NNNN'
    var mPlan = /\[Auto 4 Pagos\].*?plan \.\.\.(\w+)/.exec(String(fila[7] || ''));
    var plan = mPlan ? mPlan[1] : '';

    if (!categoria || CATEGORIAS.indexOf(categoria) === -1) return;

    // Totales por categoría
    resultado.totalesPorCategoria[categoria] += monto;
    resultado.categorias[categoria].total += monto;

    // Agrupar por subcategoría
    var sub = subcategoria || '(Sin subcategoría)';
    if (!resultado.categorias[categoria].subcategorias[sub]) {
      resultado.categorias[categoria].subcategorias[sub] = {
        total: 0, count: 0, elementos: {}
      };
    }
    var subObj = resultado.categorias[categoria].subcategorias[sub];
    subObj.total += monto;
    subObj.count++;

    // Agrupar por descripción (elemento)
    var elem = descripcion || '(Sin descripción)';
    var elemKey = elem + (plan ? '|plan ' + plan : '');
    if (!subObj.elementos[elemKey]) {
      subObj.elementos[elemKey] = { nombre: elem, plan: plan, total: 0, count: 0 };
    }
    subObj.elementos[elemKey].total += monto;
    subObj.elementos[elemKey].count++;
  });

  // Convertir elementos de objeto a array ordenado por total desc
  Object.keys(resultado.categorias).forEach(function(cat) {
    var subcats = resultado.categorias[cat].subcategorias;
    Object.keys(subcats).forEach(function(sub) {
      var elemsArr = Object.keys(subcats[sub].elementos).map(function(k) {
        return subcats[sub].elementos[k];
      });
      // El pago normal (sin plan) primero; luego los planes de 4 Pagos
      elemsArr.sort(function(a, b) {
        if (!!a.plan !== !!b.plan) return a.plan ? 1 : -1;
        return b.total - a.total;
      });
      subcats[sub].elementos = elemsArr;
    });
  });

  resultado.totalIngresos = resultado.totalesPorCategoria['Ingresos'] || 0;
  var gastosFijos = resultado.totalesPorCategoria['Gastos Fijos'] || 0;
  var gastosVar = resultado.totalesPorCategoria['Gastos Variables'] || 0;
  var deudas = resultado.totalesPorCategoria['Deudas'] || 0;
  resultado.totalGastos = gastosFijos + gastosVar + deudas;
  resultado.balance = resultado.totalIngresos - resultado.totalGastos - (resultado.totalesPorCategoria['Ahorro'] || 0);

  return resultado;
}

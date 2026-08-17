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
var REMITENTES_PERMITIDOS = ['chase.com'];

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

function agregarElemento(categoria, subcategoria, elemento) {
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

    // Reprocesar pendientes: quizás este elemento desbloquea algunos
    var pend = { procesados: 0 };
    try { pend = procesarPendientes(); } catch (e) { /* silencioso */ }
    var msg = 'Elemento agregado';
    if (pend.procesados > 0) msg += ' — ' + pend.procesados + ' pendiente(s) registrado(s)';

    return { success: true, message: msg, elementos: obtenerElementos() };
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
        return { success: true, message: 'Elemento eliminado', elementos: obtenerElementos() };
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

    return {
      success: true,
      message: 'Renombrado — ' + actualizados + ' movimiento(s) actualizado(s)',
      elementos: obtenerElementos()
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
    if (!threads.length) return stats;

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

        var parsed = parsearEmailChase(msg.getPlainBody(), msg.getDate());
        if (!parsed) {
          stats.ignorados++;
          return;
        }

        var res = intentarRegistrar(parsed, msg.getId(), thread.getPermalink());
        if (res.registrado) stats.registrados++;
        else if (res.yaProcesado) stats.ignorados++;
        else stats.pendientes++;

        msg.markRead();
        procesoAlgunEnEsteThread = true;
      });

      if (procesoAlgunEnEsteThread) thread.addLabel(labelProcesado);
    });

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

      var mapeoElem = buscarMapeoElemento(elementoRaw);
      var mapeoTarj = buscarMapeoTarjeta(ultimos4);
      if (!mapeoElem || !mapeoTarj) return;

      var fechaStr = fecha instanceof Date
        ? Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : String(fecha);
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
    return {
      success: true,
      message: msg,
      pendientesRestantes: pend.restantes
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

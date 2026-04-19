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

var CATEGORIAS = ['Ingresos', 'Ahorro', 'Deudas', 'Gastos Fijos', 'Gastos Variables'];

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
    return { success: true, message: 'Subcategoría agregada', subcategorias: obtenerSubcategorias() };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
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
        return { success: true, message: 'Subcategoría eliminada', subcategorias: obtenerSubcategorias() };
      }
    }

    return { success: false, message: 'Subcategoría no encontrada' };
  } catch (error) {
    return { success: false, message: 'Error: ' + error.message };
  }
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

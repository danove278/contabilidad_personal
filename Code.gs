/**
 * Aplicación Web de Registro de Gastos Personales
 * Backend - Google Apps Script
 */

// ID del Google Sheet (se configura después del despliegue)
const SPREADSHEET_ID = '1bdQmYvmDKopiISSSLf-v-HrBlO1BYzdAIH2NrjafUFg';
var MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

var HEADERS = [
  'Timestamp', 'Fecha', 'Categoría', 'Subcategoría',
  'Monto', 'Descripción', 'Método de Pago', 'Notas'
];

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
 * @param {SpreadsheetApp.Spreadsheet} ss - Spreadsheet
 * @param {string} fechaStr - Fecha en formato YYYY-MM-DD
 * @returns {SpreadsheetApp.Sheet} Hoja del mes
 */
function obtenerHojaMes(ss, fechaStr) {
  var partes = fechaStr.split('-');
  var anio = parseInt(partes[0]);
  var mes = parseInt(partes[1]) - 1; // 0-indexed
  var nombreHoja = MESES[mes] + ' ' + anio; // Ej: "Marzo 2026"

  var sheet = ss.getSheetByName(nombreHoja);

  if (!sheet) {
    sheet = ss.insertSheet(nombreHoja);
    formatearHoja(sheet);
  }

  return sheet;
}

/**
 * Aplica formato a una hoja nueva (encabezados, anchos, etc.)
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
 * Registra un nuevo movimiento en el Google Sheet
 * @param {Object} datos - Datos del formulario
 * @returns {Object} Resultado de la operación
 */
function registrarMovimiento(datos) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = obtenerHojaMes(ss, datos.fecha);

    var timestamp = new Date();
    var fila = [
      timestamp,
      datos.fecha,
      datos.categoria,
      datos.subcategoria || '',
      parseFloat(datos.monto),
      datos.descripcion || '',
      datos.metodoPago || '',
      datos.notas || ''
    ];

    sheet.appendRow(fila);

    // Formato de la columna de monto como moneda
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 5).setNumberFormat('$#,##0.00');
    sheet.getRange(lastRow, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');

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
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var hoy = new Date();
  var fechaStr = Utilities.formatDate(hoy, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  obtenerHojaMes(ss, fechaStr);
  Logger.log('Hoja del mes actual creada correctamente.');
}

# Instrucciones de Despliegue - Registro de Gastos

## Paso 1: Crear el Google Sheet

1. Ve a [Google Sheets](https://sheets.google.com) y crea una nueva hoja de cálculo
2. Nómbrala **"Registro de Gastos"** (o el nombre que prefieras)
3. Copia el **ID del spreadsheet** de la URL:
   ```
   https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
   ```

## Paso 2: Crear el proyecto en Google Apps Script

1. Ve a [Google Apps Script](https://script.google.com)
2. Clic en **"Nuevo proyecto"**
3. Nombra el proyecto: **"Registro de Gastos App"**

## Paso 3: Agregar el código

### Archivo `Code.gs`:
1. En el editor, ya hay un archivo `Code.gs` abierto
2. Borra todo el contenido existente
3. Copia y pega todo el contenido del archivo `Code.gs` de esta carpeta

### Archivo `Index.html`:
1. En el menú lateral izquierdo, haz clic en **"+"** junto a "Archivos"
2. Selecciona **"HTML"**
3. Nombra el archivo: **Index** (sin extensión, Apps Script la agrega automáticamente)
4. Borra todo el contenido existente
5. Copia y pega todo el contenido del archivo `Index.html` de esta carpeta

## Paso 4: Configurar el ID del Spreadsheet (seguridad)

Por seguridad, el ID del Sheet NO se guarda en el código. Lo almacenamos en las **Propiedades del script** de Apps Script (privadas, nunca se comparten).

Elige **una** de las dos opciones:

### Opción A — Por función (recomendada)

1. En `Code.gs`, busca la función `configurarSpreadsheetId` (arriba del archivo)
2. Reemplaza `'PON_AQUI_TU_ID_DE_SPREADSHEET'` con el ID real del Paso 1
3. Guarda (Ctrl+S)
4. Selecciona `configurarSpreadsheetId` en el dropdown de funciones y clic en **Ejecutar**
5. Verás "SPREADSHEET_ID configurado correctamente" en el Registro de ejecución
6. **Vuelve a poner el placeholder** (`'PON_AQUI_TU_ID_DE_SPREADSHEET'`) en el código — el ID ya quedó guardado en las propiedades del script

### Opción B — Manual

1. En Apps Script, ve a **⚙️ Configuración del proyecto** (ícono de engranaje a la izquierda)
2. Baja hasta **"Propiedades del script"** → clic en **"Agregar propiedad del script"**
3. Ingresa:
   - **Propiedad:** `SPREADSHEET_ID`
   - **Valor:** tu ID real del Paso 1
4. Clic en **"Guardar propiedades del script"**

## Paso 5: Configurar las hojas

1. En el editor de Apps Script, selecciona la función `configurarHoja` en el dropdown de funciones (arriba)
2. Haz clic en **"Ejecutar"**
3. La primera vez te pedirá permisos. Acepta:
   - Clic en "Revisar permisos"
   - Selecciona tu cuenta de Google
   - Si aparece "Google no ha verificado esta app", clic en "Avanzado" > "Ir a Registro de Gastos App (no seguro)"
   - Clic en "Permitir"
4. Esto creará las 3 hojas base:
   - **Hoja del mes actual** (ej: "Abril 2026")
   - **Movimientos** (hoja maestra con todos los registros)
   - **Config** (subcategorías editables desde la app)

## Paso 6: Crear el Dashboard

1. En el dropdown de funciones, selecciona `crearDashboard`
2. Clic en **"Ejecutar"**
3. Esto genera la hoja "Dashboard" con resumen por mes/año y desglose por subcategoría

> Ejecuta `crearDashboard` de nuevo cada vez que agregues o elimines subcategorías desde la app, para que las nuevas filas aparezcan en el Dashboard.

## Paso 7: Desplegar como Web App

1. En Apps Script, ve a **Implementar > Nueva implementación**
2. Haz clic en el engranaje y selecciona **"Aplicación web"**
3. Configura:
   - **Descripción:** "Registro de Gastos v1.2.1"
   - **Ejecutar como:** "Yo" (tu cuenta)
   - **Quién tiene acceso:** "Cualquier persona con cuenta de Google"
4. Clic en **"Implementar"**
5. Copia la **URL de la aplicación web** — esta es tu app

## Paso 8: Usar la aplicación

1. Abre la URL de la aplicación web en cualquier navegador o dispositivo móvil
2. Inicia sesión con tu cuenta de Google (si no lo has hecho)
3. Selecciona una categoría, llena los campos y haz clic en **"Registrar"**
4. Los datos aparecerán automáticamente en tu Google Sheet (en la hoja del mes y en "Movimientos")

### Gestionar subcategorías desde la app

La app tiene un ícono de engranaje **⚙️** en la esquina superior derecha del header. Al hacer clic:

- Se abre un modal con **todas las categorías** y sus subcategorías actuales
- Puedes **agregar** una subcategoría nueva escribiendo en el campo y clic en "Agregar" (o Enter)
- Puedes **eliminar** una subcategoría con el botón **✕** (pide confirmación)
- Los cambios se guardan automáticamente en la hoja **Config** del Google Sheet
- Al cerrar el modal, el dropdown del formulario se actualiza al instante

> **Nota:** Después de modificar subcategorías, si quieres que el **Dashboard** refleje los cambios, vuelve a ejecutar `crearDashboard` desde el editor de Apps Script.

## Actualizar la aplicación

Si haces cambios en el código (Code.gs o Index.html):

1. Guarda los archivos en Apps Script (Ctrl+S)
2. Ve a **Implementar > Administrar implementaciones**
3. Haz clic en el ícono de **editar** (lápiz)
4. En "Versión", selecciona **"Nueva versión"**
5. Clic en **"Implementar"**

## Migrar datos existentes (si los había)

Si ya tenías registros en hojas mensuales antes de crear la hoja "Movimientos":

1. Selecciona `migrarAHojaMovimientos` en el dropdown de funciones
2. Clic en "Ejecutar"
3. Esto copia todos los registros existentes a la hoja "Movimientos" para que aparezcan en el Dashboard

## Acceso desde el celular

Simplemente abre la URL de la Web App en el navegador de tu celular. Para acceso rápido:
- **iPhone:** Abre en Safari > Compartir > "Agregar a pantalla de inicio"
- **Android:** Abre en Chrome > Menú (3 puntos) > "Agregar a pantalla de inicio"

Esto crea un ícono como si fuera una app nativa.

## Notas

- **Tú no escribes directamente en el Google Sheet.** Todos los registros se hacen desde la app web
- Cada registro se guarda a la vez en la hoja del mes correspondiente **y** en la hoja "Movimientos"
- El **Dashboard** lee de "Movimientos" y muestra el resumen filtrado por mes/año
- Las subcategorías son completamente editables desde la app (ícono ⚙️)
- No borres las hojas "Movimientos", "Config" ni "Dashboard" — son necesarias para el funcionamiento

## Hojas del Google Sheet

| Hoja | Propósito |
|------|-----------|
| Enero/Febrero/... 2026 | Registros de ese mes específico |
| Movimientos | Base de datos completa (alimenta el Dashboard) |
| Config | Subcategorías editables desde la app |
| Dashboard | Resumen visual con totales por subcategoría |

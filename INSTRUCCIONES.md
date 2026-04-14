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
4. **IMPORTANTE:** Reemplaza `'TU_SPREADSHEET_ID_AQUI'` con el ID que copiaste en el Paso 1

### Archivo `Index.html`:
1. En el menú lateral izquierdo, haz clic en **"+"** junto a "Archivos"
2. Selecciona **"HTML"**
3. Nombra el archivo: **Index** (sin extensión, Apps Script la agrega automáticamente)
4. Borra todo el contenido existente
5. Copia y pega todo el contenido del archivo `Index.html` de esta carpeta

## Paso 4: Configurar la hoja

1. En el editor de Apps Script, selecciona la función `configurarHoja` en el dropdown de funciones (arriba)
2. Haz clic en **"Ejecutar"**
3. La primera vez te pedirá permisos. Acepta:
   - Clic en "Revisar permisos"
   - Selecciona tu cuenta de Google
   - Si aparece "Google no ha verificado esta app", clic en "Avanzado" > "Ir a Registro de Gastos App (no seguro)"
   - Clic en "Permitir"
4. Esto creará los encabezados en tu Google Sheet

## Paso 5: Desplegar como Web App

1. En Apps Script, ve a **Implementar > Nueva implementación**
2. Haz clic en el engranaje y selecciona **"Aplicación web"**
3. Configura:
   - **Descripción:** "Registro de Gastos v1"
   - **Ejecutar como:** "Yo" (tu cuenta)
   - **Quién tiene acceso:** "Cualquier persona con cuenta de Google"
4. Clic en **"Implementar"**
5. Copia la **URL de la aplicación web** - esta es tu app

## Paso 6: Usar la aplicación

1. Abre la URL de la aplicación web en cualquier navegador o dispositivo móvil
2. Inicia sesión con tu cuenta de Google (si no lo has hecho)
3. Selecciona una categoría, llena los campos y haz clic en "Registrar"
4. Los datos aparecerán automáticamente en tu Google Sheet

## Actualizar la aplicación

Si haces cambios en el código:
1. Ve a **Implementar > Administrar implementaciones**
2. Haz clic en el ícono de **editar** (lápiz)
3. En "Versión", selecciona **"Nueva versión"**
4. Clic en **"Implementar"**

## Acceso desde el celular

Simplemente abre la URL de la Web App en el navegador de tu celular. Para acceso rápido:
- **iPhone:** Abre en Safari > Compartir > "Agregar a pantalla de inicio"
- **Android:** Abre en Chrome > Menú (3 puntos) > "Agregar a pantalla de inicio"

Esto crea un ícono como si fuera una app nativa.

## Notas

- Los datos se guardan directamente en tu Google Sheet
- Puedes crear gráficos, tablas dinámicas y fórmulas en el Sheet para análisis
- La app solo registra datos; toda la visualización y análisis se hace en el Sheet
- Si necesitas agregar más categorías o métodos de pago, edita las funciones en `Code.gs`

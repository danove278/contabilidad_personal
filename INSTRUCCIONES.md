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
4. Esto creará las 6 hojas base:
   - **Hoja del mes actual** (ej: "Abril 2026")
   - **Movimientos** (hoja maestra con todos los registros)
   - **Config** (subcategorías editables desde la app)
   - **Elementos** (elementos anidados dentro de subcategorías, ej: `Crunchyroll` bajo `Suscripciones`)
   - **Tarjetas** (últimos 4 dígitos + tipo de cada tarjeta — usada por el autoregistro de emails)
   - **Pendientes** (cola del autoregistro por email — emails que faltan mapear)

## Paso 6: Crear el Dashboard

1. En el dropdown de funciones, selecciona `crearDashboard`
2. Clic en **"Ejecutar"**
3. Esto genera la hoja "Dashboard" con resumen por mes/año y desglose por subcategoría

> Ejecuta `crearDashboard` de nuevo cada vez que agregues o elimines subcategorías desde la app, para que las nuevas filas aparezcan en el Dashboard.

## Paso 7: Desplegar como Web App

1. En Apps Script, ve a **Implementar > Nueva implementación**
2. Haz clic en el engranaje y selecciona **"Aplicación web"**
3. Configura:
   - **Descripción:** "Registro de Gastos v1.5.0"
   - **Ejecutar como:** "Yo" (tu cuenta)
   - **Quién tiene acceso:** "Cualquier persona con cuenta de Google"
4. Clic en **"Implementar"**
5. Copia la **URL de la aplicación web** — esta es tu app

## Paso 8: Usar la aplicación

1. Abre la URL de la aplicación web en cualquier navegador o dispositivo móvil
2. Inicia sesión con tu cuenta de Google (si no lo has hecho)
3. Selecciona una categoría, llena los campos y haz clic en **"Registrar"**
4. Los datos aparecerán automáticamente en tu Google Sheet (en la hoja del mes y en "Movimientos")

### Gestionar subcategorías, elementos y tarjetas desde la app

La app tiene un ícono de engranaje **⚙️** en la esquina superior derecha del header. Al hacer clic se abre un modal con dos pestañas:

**Pestaña "Subcategorías"**

- Muestra **todas las categorías** con sus subcategorías actuales
- **Agregar** subcategoría: escribe en el campo y clic en "Agregar" (o Enter)
- **Eliminar** subcategoría: botón **✕** (pide confirmación)
- En **Gastos Fijos** y **Gastos Variables** cada subcategoría se puede **expandir** (▶) para gestionar sus **elementos** (ej: `Suscripciones → Crunchyroll, Netflix`). El número junto al nombre es la cantidad de elementos
- Cambios guardados en las hojas **Config** y **Elementos**

**Pestaña "Tarjetas"**

- Registra los **últimos 4 dígitos** de cada tarjeta con su tipo (**Débito** o **Crédito**) y un **alias** opcional (ej: "Chase Sapphire")
- Estas tarjetas se usarán en v1.4.0 para autoregistrar movimientos leyendo emails del banco
- Cambios guardados en la hoja **Tarjetas**

**En el formulario:** cuando eliges una subcategoría que tiene elementos configurados, aparece un dropdown **Elemento (opcional)** que autocompleta el campo Descripción al seleccionar uno.

> **Nota:** Después de modificar subcategorías, si quieres que el **Dashboard** refleje los cambios, vuelve a ejecutar `crearDashboard` desde el editor de Apps Script.

## Configurar el autoregistro desde emails de Chase (v1.4.0)

El script puede leer los emails de "Alerta de transacción" de Chase y registrar los movimientos solo. **Por privacidad, el script SOLO lee emails con el label `Banco/Alertas`** — cualquier otro email es invisible para el código.

### Paso A — Crear el label y filtro en Gmail (una sola vez)

1. Abre [Gmail](https://mail.google.com)
2. En la barra lateral izquierda, baja hasta **"Más"** → **"Crear etiqueta nueva"** (o **"Crear nueva etiqueta"**)
3. Nombre exacto: **`Banco/Alertas`** (con la barra `/` — Gmail lo interpreta como subcarpeta)
4. Clic en **Crear**

Ahora el filtro:

1. En la barra de búsqueda de Gmail, clic en el ícono de filtro **⚙️** (a la derecha del buscador) → aparece el formulario "Filtrar por"
2. En el campo **De:** pon: `no.reply.alerts@chase.com`
3. Clic en **Crear filtro** (abajo a la derecha)
4. Marca **✔ Aplicar la etiqueta:** y elige **`Banco/Alertas`** en el dropdown
5. (Opcional, recomendado) marca también **✔ Marcar como importante** para verlos rápido
6. Clic en **Crear filtro**

A partir de ahora, cualquier email de `no.reply.alerts@chase.com` se etiqueta automáticamente. El script solo consulta esa etiqueta.

### Paso B — Preparar tus tarjetas y elementos en la app

Antes de que el autoregistro haga su magia, necesita mapeos:

1. Abre la Web App → ícono ⚙️ → pestaña **Tarjetas**: agrega tus tarjetas de Chase con los últimos 4 dígitos, tipo (Débito/Crédito) y alias (ej: "Chase Sapphire")
2. Pestaña **Subcategorías**: en Gastos Fijos / Gastos Variables, expande cada subcategoría (▶) y agrega los **elementos** que uses (ej: bajo `Suscripciones` agrega `Crunchyroll`, `Netflix`, `Spotify`)

**Reglas de mapeo:**
- El elemento del email (ej: `CRUNCHYROLL.COM`) se cruza contra tu catálogo por **inclusión sin espacios/mayúsculas**. Si tienes `Crunchyroll` en la hoja Elementos, matches con `CRUNCHYROLL.COM`, `Crunchyroll TX 4234`, etc.
- Los últimos 4 dígitos son match **exacto**

Si un email llega y **no** encuentra el elemento o la tarjeta, va a la hoja **Pendientes** — no se pierde. Cuando agregas lo faltante desde la app, la app **reprocesa automáticamente** los pendientes.

### Paso C — Activar el trigger automático

Esto hace que la app revise Gmail cada 15 minutos, sin abrirla:

1. En Apps Script, en el dropdown de funciones selecciona **`crearTriggerEmails`**
2. Clic en **Ejecutar**
3. Autoriza los permisos (te va a pedir acceso a Gmail — es necesario para leer los emails etiquetados)
4. En el Registro debe salir: `Trigger creado: procesarEmailsBancarios cada 15 min`

Verificación: en la barra lateral izquierda de Apps Script, clic en **⏰ Activadores**. Debes ver una entrada de `procesarEmailsBancarios` cada 15 minutos.

Para desactivar: ejecuta `eliminarTriggerEmails` desde el mismo dropdown.

### Paso D — Probar el parser antes de esperar un email real

En Apps Script, selecciona **`testParserChase`** en el dropdown → **Ejecutar** → revisa el Registro.

Debe imprimir algo parecido a:
```
{"fecha":"2026-08-15","elementoRaw":"CRUNCHYROLL.COM","ultimos4":"8598","monto":15.83}
```

Después ejecuta **`testParserChaseDebito`** — cubre el formato de tarjeta de débito ("Realizaste una transacción con tarjeta de débito de $NN.NN con MERCHANT"):
```
{"fecha":"2026-08-15","elementoRaw":"MY SUNNY LAUNDRY","ultimos4":"8310","monto":31.2}
```

Si alguno sale `null`, algo cambió en el formato del email — avísame.

### Paso E — Sincronización manual

En la app: ícono ⚙️ → pestaña **Emails** → botón **Sincronizar ahora**. Útil para no esperar al trigger cuando acabas de hacer un gasto y quieres verlo aparecer ya.

### Qué hacer con los Pendientes

Si en la pestaña **Emails** ves un badge naranja con un número, hay emails que no se pudieron mapear. Ábre la hoja **Pendientes** del Google Sheet para ver el detalle. El motivo te dice qué falta:
- `Elemento no mapeado: XXX` → agrega ese elemento (o uno cuyo nombre esté incluido en el raw) en la pestaña Subcategorías
- `Tarjeta desconocida: ...NNNN` → agrega esa tarjeta en la pestaña Tarjetas

En cuanto guardes lo que falta, se registra solo y desaparece de Pendientes.

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
| Elementos | Elementos anidados debajo de subcategorías (ej: `Crunchyroll` bajo `Suscripciones`) |
| Tarjetas | Últimos 4 dígitos + tipo (Débito/Crédito) + alias de cada tarjeta |
| Pendientes | Cola del autoregistro por email — se procesa sola al agregar lo faltante |
| Dashboard | Resumen visual con totales por subcategoría |

# Registro de Gastos Personales

Aplicación web para el registro de movimientos financieros personales (ingresos, ahorros, deudas y gastos). Usa **Google Sheets como base de datos** y se despliega como Web App en **Google Apps Script** — sin servidores externos ni costos.

## Características

- **Formulario web responsivo** (mobile-first) para registrar movimientos desde cualquier dispositivo con conexión a internet
- **Google Sheets como base de datos**: toda la visualización, análisis y reportes se hacen directamente en la hoja de cálculo
- **Organización por mes**: cada registro se guarda automáticamente en una hoja separada con el nombre del mes (ej: "Marzo 2026", "Abril 2026")
- **Hoja Dashboard** con resumen automático: totales del mes, balance y desglose por subcategoría (mes / anual / total histórico)
- **Gestión de subcategorías, elementos y tarjetas desde la app**: ícono ⚙️ en el header con dos pestañas — Subcategorías (agregar/eliminar subcategorías, y **elementos** anidados debajo de las de Gastos Fijos/Variables, ej: `Suscripciones → Crunchyroll`) y Tarjetas (últimos 4 dígitos + tipo Débito/Crédito + alias opcional, para el futuro autoregistro de emails del banco)
- **Autenticación Google**: solo usuarios con cuenta Google pueden acceder
- **5 categorías con subcategorías editables** (valores iniciales por defecto):
  - Ingresos: Salario, Freelance, Inversiones, Otros
  - Ahorro: Fondo emergencia, Inversión, Meta específica
  - Deudas: Préstamo, Tarjeta crédito, Hipoteca
  - Gastos Fijos: Alquiler, Servicios, Seguro, Suscripciones, Transporte
  - Gastos Variables: Comida, Entretenimiento, Ropa, Salud, Educación
- **Métodos de pago**: Efectivo, Tarjeta Débito, Tarjeta Crédito, Transferencia, Otro
- **Sin secretos en el código**: el ID del Google Sheet se guarda en las **Propiedades del script** de Apps Script, no en el repositorio. El código fuente puede publicarse en GitHub público sin exponer nada de tus datos
- **Autoregistro desde emails del banco** (Chase): la app lee automáticamente los emails de alerta de transacción de Chase y los registra en la hoja. Solo lee los emails con el label `Banco/Alertas` que tú configuras — cualquier otro email es invisible para el script

## Arquitectura

```
[Usuario] → [App Web (Google Apps Script)] → [Google Sheet]
   ↑              HTML/CSS/JS                    Base de datos
   └── Acceso con cuenta Google ──────────────┘
```

## Estructura del Proyecto

| Archivo | Descripción |
|---------|-------------|
| `Code.gs` | Backend — funciones del servidor en Google Apps Script que escriben en Google Sheets |
| `Index.html` | Frontend — formulario responsivo con HTML, CSS y JavaScript integrados |
| `INSTRUCCIONES.md` | Guía paso a paso para desplegar el proyecto en Google Apps Script |

## Cómo funciona

**Tú NO escribes directamente en el Google Sheet.** Todos los registros los haces desde la **app web** (el formulario). Al registrar desde la app, los datos se guardan automáticamente en **dos lugares a la vez**:

1. **Hoja del mes** (ej: "Marzo 2026") → para ver los registros organizados por mes
2. **Hoja "Movimientos"** → donde se acumulan todos los registros (la usa el Dashboard internamente)

El **Dashboard** lee de "Movimientos" y te muestra el resumen filtrado por mes/año.

### Hojas del Google Sheet

| Hoja | Para qué sirve | ¿La borro? |
|------|----------------|------------|
| Marzo 2026 (y otras por mes) | Ver registros de ese mes específico | **NO** — es tu vista por mes |
| Movimientos | Base de datos completa (alimenta el Dashboard) | **NO** — la necesita el Dashboard |
| Config | Subcategorías editables desde la app | **NO** — la usan la app y el Dashboard |
| Elementos | Elementos anidados debajo de subcategorías (ej: `Crunchyroll` bajo `Suscripciones`) | **NO** — la usa la app y el autoregistro por email |
| Tarjetas | Últimos 4 dígitos + tipo (Débito/Crédito) + alias de cada tarjeta | **NO** — la usa el autoregistro por email |
| Pendientes | Emails que se leyeron pero no se pudieron mapear (elemento nuevo o tarjeta desconocida). Se procesan solos cuando agregas lo faltante | **NO** — es la cola del autoregistro |
| Dashboard | Resumen visual con totales y desglose | **NO** — es tu vista principal |

### Flujo completo

1. Abres la app web → registras un gasto en el formulario
2. Se guarda automáticamente en la hoja del mes correspondiente **Y** en "Movimientos"
3. Abres el Dashboard → seleccionas mes → ves todos los totales y el detalle por subcategoría

### Gestionar subcategorías, elementos y tarjetas desde la app

En el header de la app hay un ícono **⚙️ (engranaje)** que abre un modal con dos pestañas:

**Pestaña "Subcategorías"**

- **Agregar subcategoría**: escribe el nombre en "Nueva subcategoría" y clic en "Agregar" (o Enter)
- **Eliminar subcategoría**: clic en el botón **✕** (pide confirmación)
- En **Gastos Fijos** y **Gastos Variables** cada subcategoría se puede expandir (▶) para gestionar sus **elementos** anidados (ej: `Suscripciones → Crunchyroll, Netflix, Spotify`)
- Los elementos aparecen como un dropdown opcional en el formulario cuando eliges una subcategoría que los tenga, y autocompletan la Descripción
- Los cambios se guardan en las hojas **"Config"** (subcategorías) y **"Elementos"** del Google Sheet

**Pestaña "Tarjetas"**

- Registra los **últimos 4 dígitos** de cada tarjeta, su **tipo** (Débito/Crédito) y un **alias** opcional
- Estas tarjetas se usarán a partir de v1.4.0 para autoregistrar movimientos leyendo emails del banco (detectar el tipo por los últimos 4 dígitos)
- Los cambios se guardan en la hoja **"Tarjetas"**

Al cerrar el modal, el dropdown del formulario se actualiza al instante. Para que el **Dashboard** refleje cambios de subcategorías, ejecuta nuevamente `crearDashboard` desde el editor de Apps Script.

Las subcategorías o elementos que elimines **no borran los registros históricos** — esos datos siguen existiendo en las hojas mensuales y en Movimientos.

### Autoregistro automático desde emails de Chase (v1.4.0)

Cuando Chase te manda un email de "Alerta de transacción", el script:

1. Lo lee (solo si tiene el label `Banco/Alertas` — configuración de Gmail, ver [INSTRUCCIONES.md](INSTRUCCIONES.md))
2. Extrae **monto**, **comercio** y **últimos 4 dígitos**
3. Busca el comercio en tu hoja **Elementos** (ej: `CRUNCHYROLL.COM` → `Crunchyroll` → `Gastos Fijos / Suscripciones`)
4. Busca los últimos 4 dígitos en tu hoja **Tarjetas** para saber si fue **Débito o Crédito**
5. Si todo mapea → **registra el movimiento solo** (con nota `[Auto] Chase ...8598`)
6. Si falta algo → lo deja en la hoja **Pendientes**. Cuando agregas el elemento o la tarjeta desde el modal ⚙️, se registra solo

El script se ejecuta cada 15 minutos vía trigger (activar con `crearTriggerEmails()` desde el editor). También puedes forzar la sincronización en cualquier momento desde la pestaña **Emails** del modal ⚙️.

**Privacidad:** el script SOLO consulta emails con el label `Banco/Alertas`. Cualquier email fuera de ese label es invisible para el código (el query se ve en `Code.gs`, constante `GMAIL_QUERY`).

## Campos registrados

Cada movimiento guarda:

| Campo | Tipo |
|-------|------|
| Timestamp | Fecha y hora automática del registro |
| Fecha | Fecha del movimiento |
| Categoría | Una de las 5 categorías |
| Subcategoría | Opción predefinida según la categoría |
| Monto | Cantidad en formato moneda |
| Descripción | Texto libre (opcional) |
| Método de Pago | Efectivo, Débito, Crédito, Transferencia, Otro |
| Notas | Notas adicionales (opcional) |

## Despliegue

Consulta [INSTRUCCIONES.md](INSTRUCCIONES.md) para la guía detallada de despliegue en Google Apps Script.

Pasos resumidos:
1. Crear un Google Sheet y copiar su ID
2. Crear un proyecto en Google Apps Script
3. Pegar el contenido de `Code.gs` e `Index.html`
4. Guardar el ID en las **Propiedades del script** (ejecutando `configurarSpreadsheetId` o manualmente — **nunca en el código**)
5. Ejecutar `configurarHoja` y luego `crearDashboard` desde el editor
6. Desplegar como Web App con acceso "Cualquier persona con cuenta de Google"

> Si ya tenías datos registrados antes de crear la hoja "Movimientos", ejecuta una vez la función `migrarAHojaMovimientos` para copiarlos automáticamente.

## Uso

1. Abre la URL de la Web App desde cualquier navegador (PC o móvil)
2. Inicia sesión con tu cuenta de Google
3. Selecciona categoría, subcategoría y completa los campos
4. Clic en "Registrar"
5. Los datos se guardan automáticamente en la hoja del mes y en "Movimientos"
6. Abre el Dashboard en el Google Sheet para ver el resumen

Para acceso rápido en móvil, agrega la URL a la pantalla de inicio (Safari/Chrome → "Agregar a pantalla de inicio").

## Versiones

- **v1.14.0** — **Resumen como vista principal**. Al abrir la app ahora ves directamente el dashboard interactivo (mes actual con desglose por categoría/subcategoría/elemento). El formulario de registro manual pasa a ser un modal que se abre con el botón **➕** en el header. Se refresca automáticamente el resumen tras registrar un gasto
- **v1.15.0** — **4 Pagos automático**. Al llegar el email de setup, la app registra el reembolso (+total, Ingresos › Reembolso 4 Pagos) y agenda 4 cuotas (cada 14 días) como gasto en la misma clasificación de la compra original. Las cuotas se registran solas al vencer; el email recordatorio ajusta la fecha real. Pestaña 4 Pagos pasa a mostrar avance (cuotas x/4) con opción de cancelar. Se corrigen parsers (símbolo … y 'PagosSM'). Opcional: ejecutar `crearTrigger4Pagos` (diario 6am)
- **v1.13.0** — **Recibos de Google Play**. Parser detecta emails "El recibo de tu pedido de Google Play" y extrae cada artículo con su precio. Registra cada suscripción como movimiento individual (matcheando contra el catálogo de Elementos). Dedup con Chase `GOOGLE *X` charges usando ventana de 5 días. Requiere filtro nuevo en Gmail: `from:googleplay-noreply@google.com` → aplicar label `Banco/Alertas`. Refactor: helpers de dedup consolidados en funciones genéricas (`_registrarCargoEsperado` / `_matcheaCargoReciente`) reutilizables
- **v1.12.0** — **Split de suscripciones Apple**. Nuevo parser detecta emails "Tu recibo de Apple" y extrae cada suscripción individualmente. Cada item se registra como movimiento separado (matcheando el nombre contra el catálogo de Elementos). Dedup automático con el cargo consolidado de Chase `APPLE.COM/BILL`: si Chase manda un charge por el total en los próximos 5 días, se skipea para no duplicar. Requiere filtro nuevo en Gmail: `from:no_reply@email.apple.com` → aplicar label `Banco/Alertas`
- **v1.11.0** — **Dashboard interactivo en la app**. Nuevo botón **📊** en el header abre un modal con: selector de mes (dropdown de meses con datos), cards con Ingresos/Gastos/Balance, lista de las 5 categorías con total y barra proporcional, expandible a subcategorías (con contador de movimientos) y estas a elementos individuales (con monto agregado y multiplicador si hay más de 1). Lee en vivo de Movimientos, sin depender de la hoja Dashboard del Sheet
- **v1.10.0** — **Recurrentes integrados en Subcategorías**: al agregar un elemento bajo una subcategoría, checkbox `🔄 Es un pago recurrente` habilita campos de monto/día/método pago. Se crean **ambas entradas vinculadas** (elemento + recurrente) en una sola acción. Los elementos con recurrente muestran badge 🔄. Renombrar o eliminar un elemento vinculado sincroniza el cambio con el recurrente correspondiente. La pestaña "Recurrentes" se mantiene como vista y para creación directa
- **v1.9.0** — **Depósitos directos + Pagos recurrentes**. Nuevo parser detecta emails `Tienes un depósito directo de $X` y los registra automáticamente en `Ingresos → Depósito directo` (auto-crea la subcategoría). Nueva hoja **Recurrentes** y pestaña homónima en el modal ⚙️ para gastos fijos que se auto-generan cada mes (gym, HOA, membresías sin email). Trigger diario `crearTriggerRecurrentes()` procesa los pagos cuando el día del mes coincide. Cada recurrente elige categoría/subcategoría/método pago libremente
- **v1.8.1** — **Pago mensual y Día opcionales** en Deudas cuando se configura Destinatario. Si vinculas una deuda a un destinatario de transferencia, ya no tienes que inventar un pago mensual fijo — el email de Chase decide el monto. La card muestra "🔗 Actualiza desde transferencias a X" en lugar de "Pago mensual $X · Día X"
- **v1.8.0** — **Transferencias de Chase**: nuevo parser detecta emails "Enviaste $X a DESTINATARIO" y los registra como movimientos automáticamente (método Transferencia). Si el destinatario matchea un elemento del catálogo, usa esa categoría/subcategoría; si no, va a Pendientes. Nuevo campo **"Destinatario Chase"** en cada Deuda: cuando se recibe una transferencia a ese destinatario, se actualiza automáticamente el saldo `Pagado`/`Restante` de la deuda. Las deudas con destinatario configurado **saltan el trigger diario** (el email es la fuente de la verdad, evita duplicación). Auto-migración de la hoja Deudas existente
- **v1.7.0** — **Chase 4 Pagos**: la app detecta cuando configuras un plan "4 Pagos" en Chase (usa el **número de plan** como identificador único) y lo agrega a una nueva pestaña **4 Pagos** en el modal ⚙️. Confirmas cuál movimiento se convirtió eligiéndolo de un dropdown de candidatos (mismo monto, últimos 45 días), la app anula ese movimiento para evitar doble contabilización. Los 4 cobros futuros de Chase llegan como transacciones normales. Los emails de recordatorio se marcan como procesados en silencio
- **v1.6.0** — **Deudas rotativas**: nueva hoja `Deudas` y nueva pestaña **Deudas** en el modal ⚙️ para gestionar deudas (descripción, monto total, pago mensual, día del mes de pago). Un **trigger diario** (`crearTriggerDeudas()`) revisa cada deuda: si hoy es su día de pago y aún no se pagó este mes, registra automáticamente un movimiento en **Gastos Fijos → Pago Deuda** (método `Transferencia`) y descuenta del saldo. Cuando el restante llega a 0, la deuda se marca inactiva sola. UI con progress bar, edit inline, pausar/reactivar
- **v1.5.0** — **Renombrar** subcategorías, elementos y tarjetas desde el modal ⚙️ (ícono ✏️ inline, guardar con Enter o ✓, cancelar con Esc o ✕). Los renames de subcategoría y elemento **actualizan también los movimientos históricos** para mantener consistencia con el Dashboard. El **Dashboard se regenera automáticamente** tras cambios en subcategorías (agregar/eliminar/renombrar). Nuevo botón **"Regenerar Dashboard"** en el modal para forzarlo cuando quieras
- **v1.4.3** — Fix de **duplicados por race condition**: `procesarEmailsBancarios` y `procesarPendientes` ahora usan `LockService` para serializar ejecuciones concurrentes (aparecían duplicados cuando se agregaban tarjeta + elemento casi al mismo tiempo). Defensa en profundidad: dedup por **EmailID** vía Propiedades del script (ventana rodante de 200 IDs procesados)
- **v1.4.2** — El bot ahora usa la **ausencia del label `Banco/Procesado`** como criterio de "email pendiente", en vez de `is:unread`. Antes, abrir un email en Gmail lo sacaba del pipeline; ahora solo el bot puede marcarlo como procesado (aplicando el label). El `newer_than:7d` sigue limitando el alcance a la última semana
- **v1.4.1** — El parser de Chase ahora también entiende emails de **tarjeta de débito** ("Realizaste una transacción con tarjeta de débito de $NN.NN con MERCHANT" + "Realizada el" en lugar de "Fecha"). Los emails de débito que ya habían llegado antes se reprocesan solos al sincronizar
- **v1.4.0** — **Autoregistro desde emails de Chase**. Parser de "Alerta de transacción", cruce con hojas Elementos + Tarjetas, hoja **Pendientes** para mapeos faltantes que se resuelven solos al agregar el elemento/tarjeta, trigger automático cada 15 min y botón manual **"Sincronizar ahora"** en nueva pestaña **Emails** del modal ⚙️. Privacidad por diseño: el script solo consulta emails con label `Banco/Alertas`
- **v1.3.0** — Nueva pestaña **Tarjetas** en el modal ⚙️ (últimos 4 dígitos + Débito/Crédito + alias) y **elementos** anidados dentro de subcategorías de Gastos Fijos/Variables (ej: `Suscripciones → Crunchyroll`). Dropdown de elemento en el formulario que autocompleta la Descripción. Base para el autoregistro automático de emails del banco (v1.4.0)
- **v1.2.1** — Seguridad: el `SPREADSHEET_ID` se movió del código a **PropertiesService** (Propiedades del script). El repositorio ya no contiene información sensible
- **v1.2.0** — Gestión de subcategorías desde la app (modal ⚙️) + hoja "Config" para almacenarlas dinámicamente
- **v1.1.1** — Fix de error en `crearDashboard` y mejoras de documentación
- **v1.1.0** — Hoja Dashboard con resumen por mes/año + hoja maestra "Movimientos" + migración de datos existentes
- **v1.0.0** — Primera versión estable con registro completo y organización por mes

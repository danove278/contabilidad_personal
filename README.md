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

- **v1.4.0** — **Autoregistro desde emails de Chase**. Parser de "Alerta de transacción", cruce con hojas Elementos + Tarjetas, hoja **Pendientes** para mapeos faltantes que se resuelven solos al agregar el elemento/tarjeta, trigger automático cada 15 min y botón manual **"Sincronizar ahora"** en nueva pestaña **Emails** del modal ⚙️. Privacidad por diseño: el script solo consulta emails con label `Banco/Alertas`
- **v1.3.0** — Nueva pestaña **Tarjetas** en el modal ⚙️ (últimos 4 dígitos + Débito/Crédito + alias) y **elementos** anidados dentro de subcategorías de Gastos Fijos/Variables (ej: `Suscripciones → Crunchyroll`). Dropdown de elemento en el formulario que autocompleta la Descripción. Base para el autoregistro automático de emails del banco (v1.4.0)
- **v1.2.1** — Seguridad: el `SPREADSHEET_ID` se movió del código a **PropertiesService** (Propiedades del script). El repositorio ya no contiene información sensible
- **v1.2.0** — Gestión de subcategorías desde la app (modal ⚙️) + hoja "Config" para almacenarlas dinámicamente
- **v1.1.1** — Fix de error en `crearDashboard` y mejoras de documentación
- **v1.1.0** — Hoja Dashboard con resumen por mes/año + hoja maestra "Movimientos" + migración de datos existentes
- **v1.0.0** — Primera versión estable con registro completo y organización por mes

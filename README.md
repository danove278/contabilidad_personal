# Registro de Gastos Personales

Aplicación web para el registro de movimientos financieros personales (ingresos, ahorros, deudas y gastos). Usa **Google Sheets como base de datos** y se despliega como Web App en **Google Apps Script** — sin servidores externos ni costos.

## Características

- **Formulario web responsivo** (mobile-first) para registrar movimientos desde cualquier dispositivo con conexión a internet
- **Google Sheets como base de datos**: toda la visualización, análisis y reportes se hacen directamente en la hoja de cálculo
- **Organización por mes**: cada registro se guarda automáticamente en una hoja separada con el nombre del mes (ej: "Marzo 2026", "Abril 2026")
- **Autenticación Google**: solo usuarios con cuenta Google pueden acceder
- **5 categorías con subcategorías predefinidas**:
  - Ingresos: Salario, Freelance, Inversiones, Otros
  - Ahorro: Fondo emergencia, Inversión, Meta específica
  - Deudas: Préstamo, Tarjeta crédito, Hipoteca
  - Gastos Fijos: Alquiler, Servicios, Seguro, Suscripciones, Transporte
  - Gastos Variables: Comida, Entretenimiento, Ropa, Salud, Educación
- **Métodos de pago**: Efectivo, Tarjeta Débito, Tarjeta Crédito, Transferencia, Otro

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
4. Reemplazar `SPREADSHEET_ID` con el ID real
5. Desplegar como Web App con acceso "Cualquier persona con cuenta de Google"

## Uso

1. Abre la URL de la Web App desde cualquier navegador (PC o móvil)
2. Inicia sesión con tu cuenta de Google
3. Selecciona categoría, subcategoría y completa los campos
4. Clic en "Registrar"
5. Los datos se guardan automáticamente en la hoja del mes correspondiente en el Google Sheet

Para acceso rápido en móvil, agrega la URL a la pantalla de inicio (Safari/Chrome → "Agregar a pantalla de inicio").

## Versión

**v1.0.0** — Primera versión estable con registro completo y organización por mes.

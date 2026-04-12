
# Mejora del Módulo "Crear Transacción"

## Problemas Identificados

1. **Moneda no clara**: Los formularios de Compra, Venta y Nota Crédito solo muestran USD sin opción de elegir moneda base. El usuario no sabe si está ingresando en USD o DOP.
2. **Formulario de Gasto/Costo**: Tiene los dos campos (USD/DOP) con auto-conversión, pero no hay un selector explícito de "moneda primaria" — es confuso saber cuál es la fuente.
3. **Asiento libre (Journal)**: No tiene selector de moneda ni muestra equivalente en DOP.
4. **Compra y Nota Crédito**: Solo permiten ingresar en USD, sin equivalente DOP visible prominentemente.
5. **UX general**: El formulario es largo y los 6 tipos de transacción se ven todos iguales al inicio. No hay guía contextual de qué tipo usar.
6. **Falta recibo/adjunto**: No hay opción de adjuntar comprobante en el formulario manual.
7. **Fecha repetida**: El selector de fecha está al final de cada formulario, debería estar arriba como dato compartido.

## Propuesta de Mejoras

### 1. Selector de moneda explícito (USD / DOP)
- Agregar un toggle global `USD | DOP` arriba del formulario que define la moneda de entrada.
- Todos los campos de monto muestran la moneda seleccionada como primaria y el equivalente convertido debajo.
- Aplica a: Gasto, Costo, Compra, Nota Crédito, Venta (total), Asiento Journal.
- Mostrar tasa de cambio activa con fecha, y nota de auto-conversión.

### 2. Reorganizar layout del formulario
- **Barra superior compartida**: Fecha + Moneda base + Tasa de cambio — siempre visible, aplica a todos los tipos.
- **Tipo de transacción**: Mantener los 6 botones pero con descripción corta debajo de cada ícono para guiar al usuario.
- Campos específicos aparecen según el tipo seleccionado (ya funciona así, solo mejorar la descripción contextual).

### 3. Mejorar el formulario de Gasto/Costo
- Reemplazar los dos campos separados USD/DOP por: un campo de monto + el toggle de moneda. El equivalente se muestra como texto, no como input editable (reduce confusión).
- Agregar campo de recibo (ReceiptUpload ya existe como componente).

### 4. Journal Entry: agregar moneda
- Mostrar totales en ambas monedas (USD y DOP equivalente).
- Agregar label de moneda a las columnas de débito/crédito.

### 5. Compra y Nota Crédito: dual currency
- Mostrar equivalente DOP prominente debajo del total.
- Permitir ingresar en DOP si el usuario cambia la moneda base.

### 6. Preview contable mejorado
- Mostrar ambas monedas en el preview (ya muestra USD, agregar DOP).

## Archivos a Modificar

- `src/components/finanzas/CrearTransaccionTab.tsx` — Cambio principal: agregar selector de moneda, reorganizar layout, mejorar campos de monto, agregar ReceiptUpload.
- `src/components/finanzas/AccountingPreview.tsx` — Agregar columna DOP al preview.

## Cambios Técnicos

1. Nuevo state `currencyBase: 'USD' | 'DOP'` — controla qué moneda se muestra como input primario.
2. Barra superior: `[Fecha picker] [USD ⇄ DOP toggle] [Tasa: RD$60.76]`
3. Cada campo de monto: input en moneda base + texto pequeño con equivalente.
4. Para Compra/Venta: los precios unitarios se mantienen en USD (catálogo), pero el total muestra ambas monedas.
5. AccountingPreview: agregar prop `exchangeRate` y mostrar columna DOP.
6. Agregar ReceiptUpload al formulario de Gasto/Costo (ya existe el componente).

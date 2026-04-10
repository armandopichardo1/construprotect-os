

## Plan: Módulo "Crear Transacción" con IA en Finanzas

### Concepto
Reemplazar el actual diálogo flotante "AI Asistente" con una pestaña completa "Crear Transacción" en el módulo de Finanzas. El usuario escribe en lenguaje natural lo que sucedió (ej: "Pagué RD$5,000 de electricidad", "Vendí 10 Ram Board a Pedralbes") y la IA clasifica automáticamente la transacción, asigna cuenta contable, calcula montos y presenta una vista previa para aprobar, editar o rechazar.

### Cambios

**1. Nueva pestaña en Finanzas**
- Agregar "Crear Transacción" como primera pestaña en el array `tabs` (posición prominente)
- Eliminar el botón flotante "AI Asistente" y el `AIAssistantDialog` actual — su funcionalidad se absorbe en la nueva pestaña

**2. Componente `CrearTransaccionTab`** (inline en FinanzasPage o componente separado)
- **Input principal**: Un textarea grande y limpio con placeholder: "Describe qué pasó... Ej: Pagué $200 USD de flete a DHL"
- **Botón "Clasificar con IA"**: Envía al edge function `financial-ai` con action `classify`
- **Vista previa de resultado**: Card con los datos clasificados:
  - Tipo (Venta / Gasto / Costo) con badge de color
  - Cuenta contable sugerida (del catálogo `chart_of_accounts`)
  - Categoría, descripción, montos USD/DOP, tasa de cambio
  - Para ventas: items, cliente, ITBIS, total
  - Confianza de la IA (barra visual)
  - Explicación de la clasificación
- **3 acciones**: Aprobar (guarda directo), Editar (abre form pre-llenado), Rechazar
- **Historial reciente**: Lista de las últimas 5 transacciones creadas en esta sesión

**3. Actualizar edge function `financial-ai`**
- Ampliar el prompt de `classify` para que también sugiera `account_id` y `account_code` del catálogo de cuentas contables
- Agregar soporte para tipo `cost` (además de `expense` y `sale`)
- Incluir las categorías de costos en el prompt del sistema

**4. Lógica de aprobación expandida**
- Soportar 3 tipos: `sale`, `expense`, `cost`
- Al aprobar un gasto o costo, vincular automáticamente el `account_id` sugerido por la IA
- Invalidar queries correspondientes tras insertar

**5. Ejemplos rápidos (chips clickeables)**
- Mostrar 4-5 ejemplos debajo del textarea: "Pagué flete DHL $350", "Vendí 20 cajas a Pedralbes", "Compré materiales por RD$15,000", "Nómina almacén RD$45,000"
- Al hacer click, se pre-llena el textarea

### Archivos a modificar
- `src/pages/FinanzasPage.tsx` — nueva pestaña, remover AIAssistantDialog, agregar CrearTransaccionTab
- `supabase/functions/financial-ai/index.ts` — expandir prompt classify para incluir costos y cuentas contables

### Resultado
El usuario tiene un flujo conversacional directo dentro de Finanzas donde escribe qué pasó y con un click la transacción queda registrada con su cuenta contable, categoría y montos correctos.




# Plan: Reorganizar Productos, Pricing y Costo Promedio Ponderado

## Resumen

Separar la gestión de productos en dos partes:
1. **Maestras > Productos**: Solo datos básicos del producto (SKU, nombre, marca, categoría, dimensiones, specs)
2. **Finanzas > Pricing**: Nueva pestaña con toda la gestión de precios, márgenes y costos
3. **Costo unitario**: Empieza en 0 y se actualiza automáticamente con el método de costo promedio ponderado al recibir envíos

---

## Cambios detallados

### 1. Simplificar ProductDialog (formulario de alta de productos)

**Archivo:** `src/components/ProductDialog.tsx`

- Eliminar del formulario: Costo Unitario, los 4 precios (lista, arquitecto, proyecto, mayoreo), los 4 márgenes
- Mantener solo: SKU, Nombre, Marca, Categoría, Cobertura m², Punto Reorden, Dimensiones, Uds/Caja, Lead Time, Qty Reorden, Min Order Qty, CBM, Peso
- Al crear producto, los campos de precio/margen/costo se guardan en 0

### 2. Simplificar tabla de Productos en ProductosPage

**Archivo:** `src/pages/ProductosPage.tsx`

- Eliminar columnas de: Costo Unitario, Precio Lista, Margen Lista, Margen Arquitecto, Margen Proyecto, Precio Mayorista, Margen Mayorista
- Dejar columnas: SKU, Nombre, Marca, Categoría, Dimensiones, Uds/Caja, acciones
- Eliminar lógica de edición inline de precios/márgenes y el footer de promedios de margen

### 3. Crear pestaña "Pricing" en Finanzas

**Archivo:** `src/pages/FinanzasPage.tsx` (agregar tab) + nuevo `src/components/finanzas/PricingTab.tsx`

- Agregar "Pricing" a la lista de tabs de Finanzas
- Crear componente `PricingTab` que contenga:
  - Tabla completa de productos con: SKU, Nombre, Costo Unitario (read-only, calculado), 4 precios, 4 márgenes
  - Edición inline de precios y márgenes (mover la lógica actual de `ProductosPage`)
  - Cálculo automático de márgenes cuando se cambia precio y viceversa
  - Footer con promedios de márgenes
  - Filtros por categoría y búsqueda
  - El costo unitario será de solo lectura (viene del promedio ponderado de compras)

### 4. Costo promedio ponderado al recibir envíos

**Archivo:** `src/components/inventario/ShipmentsTab.tsx`

- Al ejecutar `receiveShipment`, después de actualizar inventario, calcular el nuevo costo promedio ponderado:
  
```text
Nuevo Costo = (Qty existente × Costo actual + Qty recibida × Costo nuevo) 
              ÷ (Qty existente + Qty recibida)
```

- Actualizar `products.unit_cost_usd` y recalcular `total_unit_cost_usd` y los 4 márgenes basados en los precios existentes
- Esto asegura que el costo solo cambia cuando hay una recepción real de mercancía

### 5. Limpieza de helpers

- Mover `calcRealMargin`, `calcPriceFromMargin`, `MarginCell`, `EditableCell`, `EditableCategoryCell` de `ProductosPage.tsx` a `PricingTab.tsx` (o a un archivo compartido si se reusan)
- Eliminar `BulkLogisticsDialog` del ProductosPage si ya no aplica ahí

---

## Flujo resultante

```text
Alta de producto:  Maestras > Productos > + Nuevo Producto (solo datos básicos)
                   → Costo unitario = 0, precios = 0

Compra:            Inventario > Envíos > Crear PO con productos y costos
                   → Recibir envío → Costo promedio ponderado se recalcula

Pricing:           Finanzas > Pricing > Ver/editar precios y márgenes
                   → Costo unitario (read-only, viene de compras)
                   → Editar precios → márgenes se recalculan automáticamente
```


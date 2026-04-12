

# Auto-cálculo de Precios y Márgenes en ProductDialog

## Resumen
Modificar el formulario de productos para que precio y margen se calculen automáticamente de forma bidireccional, usando la fórmula contable estándar:

```text
Margen (%) = ((Precio - Costo) / Precio) × 100
Precio = Costo / (1 - Margen/100)
```

## Comportamiento

Para cada par precio/margen (Lista, Arquitecto, Proyecto, Mayoreo):

1. **Si el usuario cambia el Costo** → recalcula los 4 márgenes reales basándose en los precios existentes
2. **Si el usuario cambia un Precio** → recalcula su margen correspondiente automáticamente
3. **Si el usuario cambia un Margen** → recalcula su precio correspondiente automáticamente

El costo unitario (`unit_cost_usd`) es el dato base. Los campos de precio y margen se muestran lado a lado para que sea evidente la relación.

## Cambios en `src/components/ProductDialog.tsx`

1. **Reorganizar la sección de precios**: mostrar cada precio junto a su margen en la misma fila (Precio Lista ↔ Margen Lista, etc.) para que la relación sea visual e intuitiva.

2. **Reemplazar el `set()` genérico** con funciones inteligentes:
   - `handleCostChange(newCost)` — actualiza costo y recalcula los 4 márgenes
   - `handlePriceChange(tier, newPrice)` — actualiza el precio y calcula el margen: `((price - cost) / price) * 100`
   - `handleMarginChange(tier, newMargin)` — actualiza el margen y calcula el precio: `cost / (1 - margin/100)`

3. **Indicador visual**: si un margen resulta negativo o menor a 5%, mostrar el campo en rojo como advertencia.

4. **Protección**: si el costo es 0, no calcular (dejar campos editables manualmente). Si el margen ingresado es ≥100%, no calcular precio (sería división por 0).

## Estructura visual del formulario (nueva)

```text
💰 Costo y Precios (USD)
┌─────────────────┐
│ Costo Unitario   │  ← campo base
└─────────────────┘

│ Precio Lista    │  │ Margen Lista %   │  ← bidireccional
│ Precio Arquitecto │ │ Margen Arq %    │  ← bidireccional  
│ Precio Proyecto │  │ Margen Proyecto % │  ← bidireccional
│ Precio Mayoreo  │  │ Margen Mayoreo %  │  ← bidireccional
```

## Archivo modificado
- `src/components/ProductDialog.tsx` — única modificación necesaria


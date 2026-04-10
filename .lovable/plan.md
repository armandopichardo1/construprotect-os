

## Plan: Analítica por Cliente/Producto + Alerta de Cliente Inactivo

### Resumen
Agregar una nueva alerta "Cliente sin compras recientes" al motor de alertas, y enriquecer la analítica existente en el Dashboard y Finanzas > Reportes con métricas de tendencia de ventas por cliente y producto.

### Cambios

**1. Nueva alerta: `client_declining` en `useAlerts.ts`**
- Agregar regla `client_declining` con threshold configurable (ej. 30 días sin compras)
- Lógica: comparar la última fecha de compra de cada cliente activo contra el umbral. Si un cliente que ha comprado antes no ha comprado en X días, disparar alerta
- Categoría: `crm`, severity: `warning`
- Navega a `/finanzas` (pestaña Reportes)

**2. Dashboard — Mejorar panel "Tendencia por Cliente"**
- Agregar indicador de "días sin comprar" junto a cada cliente en el sparkline existente
- Resaltar en rojo clientes que llevan más de 30 días sin comprar
- Agregar tooltip con última fecha de compra y variación porcentual

**3. Finanzas > Reportes — Enriquecer vista "Por Cliente"**
- Agregar columnas: "Última Compra", "Días sin Comprar", "Tendencia" (flecha arriba/abajo basada en comparación últimos 3 meses vs 3 meses anteriores)
- Ordenar opcionalmente por "Mayor caída" para identificar clientes que se están yendo
- Agregar mini-sparkline inline en la tabla para visualizar tendencia de 6 meses

**4. Finanzas > Reportes — Enriquecer vista "Por Producto"**
- Agregar columnas: "Velocidad" (unidades/mes promedio últimos 3 meses), "Tendencia" (comparación vs período anterior)
- Resaltar productos con tendencia a la baja

**5. Configuración — Agregar regla al panel de alertas**
- La nueva regla `client_declining` aparecerá automáticamente en MasPage > Alertas con su umbral editable (días sin compra)

### Archivos a modificar
- `src/hooks/useAlerts.ts` — nueva regla + lógica de evaluación
- `src/pages/DashboardPage.tsx` — enriquecer panel de tendencia por cliente
- `src/pages/FinanzasPage.tsx` — columnas adicionales en ReportesTab para ambas vistas
- `src/pages/MasPage.tsx` — la regla aparece automáticamente (ya usa DEFAULT_ALERT_RULES)

### Detalles técnicos
- La consulta de sales ya incluye `contact_id` y `crm_clients(name)` — se reutiliza para calcular última compra y tendencia
- Se usa `last_order_date` de la tabla `contacts` como referencia rápida, con fallback al cálculo desde `sales`
- No se requieren cambios de base de datos


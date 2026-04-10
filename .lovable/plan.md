

# ConstruProtect OS — Gap Analysis & Implementation Plan

## What's Been Built (Status: Done)
- Auth + profiles (3 users)
- Database: products, inventory, locations, inventory_movements, exchange_rates, settings, contacts, deals, activities, quotes, quote_items, sales, sale_items, expenses
- Product catalog CRUD + Excel import + 20 SKUs seeded
- Inventory page with Stock, Analytics (ABC, bubble chart), Envios (hardcoded), AI PO Recommender
- CRM: Pipeline, Contacts, Agenda, Quotes tabs with AI Deal Game Plan, AI Weekly Agenda
- Finanzas: Resumen, Ventas, Gastos, P&L, AI Asesor + AI Transaction Assistant
- Dashboard: KPIs, charts (revenue donut, pipeline funnel, client sparklines), AI Business Review
- PDF Quotes (branded, dual currency, ITBIS)
- Realtime for inventory table
- Exchange rate fetch edge function
- Desktop sidebar layout

## What's Missing (from the Architecture Document)

### Database Tables Not Created
1. **`shipments`** — supplier PO tracking (status pipeline: ordered → in_transit → customs → warehouse → received)
2. **`shipment_items`** — line items per shipment
3. **`client_projects`** — project planner per contact (m2 calc, product needs, status)
4. **`product_requests`** — track requested products not yet in catalog

### Missing Features

| # | Feature | Section | Priority |
|---|---------|---------|----------|
| 1 | **Shipments CRUD** — real data instead of hardcoded Envios tab. Create/edit shipments with step-progress, receive to inventory | Inventario > Envios | High |
| 2 | **Drag-and-drop pipeline** — kanban columns with drag between stages | CRM > Pipeline | High |
| 3 | **AI Pitch Creator** — per-deal button generating customized sales pitch | CRM > Pipeline deals | Medium |
| 4 | **AI Expense Categorizer** — auto-suggest category during expense entry | Finanzas > Gastos | Medium |
| 5 | **AI Cross-sell Advisor** — on contact detail view, suggest products from purchase history | CRM > Contactos | Medium |
| 6 | **AI Anomaly Detection** — flag unusual patterns on data entry | Financial entries | Low |
| 7 | **Dashboard Quick Actions** — "+ Venta, + Gasto, + Actividad" buttons | Dashboard | Medium |
| 8 | **Dashboard Alerts Section** — low stock, stale deals (7+ days), overdue activities, overdue payments | Dashboard | High |
| 9 | **Sale inventory auto-deduction** — creating a sale should deduct from inventory + create movement | Finanzas > Ventas | High |
| 10 | **Client Projects planner** — per-contact project tracker (m2, product needs, timeline) | CRM | Low |
| 11 | **Product Requests tracker** — log products clients ask for that aren't in catalog | CRM/Settings | Low |
| 12 | **Data Export** — export tables to Excel/PDF | Settings | Medium |
| 13 | **P&L Export to PDF** | Finanzas > P&L | Medium |
| 14 | **Contact detail view** — full detail with activity timeline, deals history, order history, quick actions | CRM > Contactos | Medium |
| 15 | **Quote wizard flow** — step-by-step: select client → add products → preview → generate PDF | CRM > Cotizaciones | Medium |
| 16 | **Company settings** — editable name, RNC, address, logo in Settings | Mas | Low |
| 17 | **155 Contacts import** — still pending user uploading the Excel file | Data seed | High |
| 18 | **Deal stage: "delivered"** — missing from current enum (spec includes it) | DB | Low |
| 19 | **Deal fields: `project_location`, `is_recurring`** — in spec but not in DB | DB | Low |
| 20 | **Products fields: `additional_costs_usd`, `taxes_per_unit_usd`, `notes`** — in spec but not in DB | DB | Low |

## Implementation Plan (Ordered by Priority)

### Step 1: Database Migrations
Create missing tables and add missing columns:
- Create `shipments` and `shipment_items` tables with RLS
- Create `client_projects` table with RLS
- Create `product_requests` table with RLS
- Add `project_location`, `is_recurring` to `deals`
- Add `additional_costs_usd`, `taxes_per_unit_usd`, `notes` to `products`
- Add `delivered` to deal_stage enum
- Enable realtime for `shipments`

### Step 2: Sale Inventory Auto-Deduction
- When a sale is saved, auto-create `inventory_movements` (type `sale`, negative quantity) and update `inventory.quantity_on_hand` for each sale_item

### Step 3: Shipments Module (Real Data)
- Replace hardcoded Envios tab with full CRUD
- Shipment form: supplier, PO number, dates, status, items with products + quantities
- Step-progress visualization from DB status
- "Receive" action that creates `inventory_movements` (type `receipt`) and updates stock

### Step 4: Pipeline Drag-and-Drop
- Add `@hello-pangea/dnd` library
- Refactor `PipelineTab` to use `DragDropContext`, `Droppable`, `Draggable`
- On drop, update deal stage via Supabase

### Step 5: Dashboard Enhancements
- Add Quick Actions row: "+ Venta", "+ Gasto", "+ Actividad" (open respective forms)
- Add Alerts section: low stock items, stale deals (7+ days no activity), overdue activities, overdue payments

### Step 6: AI Features (add to `business-ai` edge function)
- **AI Pitch Creator**: new action `pitch` — input deal/client/segment, output customized pitch in Spanish
- **AI Expense Categorizer**: new action in `financial-ai` — input description, output suggested category
- **AI Cross-sell Advisor**: new action `cross-sell` — input contact purchase history + catalog, output product recommendations

### Step 7: Contact Detail View
- Create `ContactDetailDialog` or expand existing contact card
- Show: full info, activity timeline, deals history, order history, quick action buttons

### Step 8: Data Export
- Add Excel export buttons to Ventas, Gastos, Productos tables (using xlsx library already installed)
- Add P&L export to PDF

### Step 9: Settings Enhancements
- Company info form (name, RNC, address, logo upload to storage)
- Product requests tracker page

### Step 10: Client Projects (Phase 5)
- Client project planner UI with m2 calculator, product needs, timeline
- Linked to contacts and deals

### Technical Details

**New dependencies**: `@hello-pangea/dnd` (for drag-and-drop)

**Edge function changes**: Add `pitch`, `cross-sell`, `expense-categorize` actions to existing edge functions

**Migration count**: 1 migration with all table/column changes

**Files to create**:
- `src/components/inventario/ShipmentDialog.tsx`
- `src/components/crm/ContactDetailDialog.tsx`
- `src/components/dashboard/QuickActions.tsx`
- `src/components/dashboard/AlertsSection.tsx`

**Files to modify**:
- `src/pages/InventarioPage.tsx` — Envios tab with real data
- `src/components/crm/PipelineTab.tsx` — drag-and-drop
- `src/pages/DashboardPage.tsx` — quick actions + alerts
- `src/pages/FinanzasPage.tsx` — expense categorizer + sale inventory deduction
- `src/pages/MasPage.tsx` — company settings + export
- `supabase/functions/business-ai/index.ts` — new AI actions
- `supabase/functions/financial-ai/index.ts` — expense categorizer


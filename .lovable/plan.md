

# ConstruProtect OS — Desktop Operating System Redesign

## The Problem
Currently the app is built as a **mobile-first phone app** with a 480px max-width container, bottom navigation, and stacked card layouts. For a desktop OS that will be the **core of your organization**, this is severely limiting. You need a proper desktop workspace: sidebar navigation, multi-panel layouts, data-dense tables, and larger charts.

## What Changes

### 1. Navigation: Bottom tabs → Sidebar
- Replace `BottomNav` with a collapsible **sidebar** using shadcn's `Sidebar` component
- Icons from Lucide (LayoutDashboard, Package, Users, DollarSign, Settings)
- Logo + company name at top, user profile + sign-out at bottom
- Collapsed mode shows icons only (icon strip)
- Active route highlighting

### 2. Layout: Phone → Desktop workspace
- Remove the `max-w-[480px]` constraint from `AppLayout`
- New layout: `SidebarProvider` → `Sidebar` + `main` area that fills the screen
- Content areas use proper desktop widths with padding

### 3. Dashboard: Stacked cards → Multi-column grid
- **4-column KPI row** across the top (full width)
- **2-column layout** below: Revenue chart (left, wider) + Category donut + Stock alerts (right)
- Top products as a horizontal bar chart instead of progress bars
- AI Summary as a persistent banner at the bottom
- Exchange rate in the top header bar

### 4. Inventario: Single-column → Split panels
- Left panel: stock table (proper `<table>` with sortable columns: SKU, Name, Category, Qty, Status, Value, Trend)
- Status filter chips above the table
- Sub-tabs (Stock, Productos, Analytics, Envíos, ABC) remain but content fills desktop width
- Analytics tab: side-by-side charts instead of stacked
- Products tab uses the dedicated `/productos` route with data table

### 5. CRM: Stacked tabs → Desktop kanban
- Pipeline: **full-width horizontal kanban** that uses the available screen space (no 210px constraint)
- Deal cards wider with more info visible
- Contacts tab: **data table** with columns (Name, Company, Segment, Priority, Revenue, Last Activity, Actions)
- Agenda: **2-column layout** — overdue/today on left, this week on right
- Quotes: proper table with status badges

### 6. Finanzas: Stacked sections → Dashboard grid
- Summary tab: **3-column grid** — KPIs row, Revenue/COGS/Expenses bar chart (2/3), Expense donut (1/3), Profit trend full-width
- Sales/Expenses: proper sortable data tables instead of card lists
- P&L: formatted financial statement with indentation, full-width

### 7. Settings (Más): Proper settings page
- 2-column layout: navigation on left, content on right
- Sections: Company, Exchange Rate, Users, Data Import/Export

### 8. Header bar
- Add a top header bar with: page title, breadcrumbs, search (global), notifications bell, user avatar + name
- SidebarTrigger button always visible

### 9. Login page
- Centered card with subtle background pattern, wider form (max-w-md), company branding

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/AppLayout.tsx` | **Rewrite** — SidebarProvider + Sidebar + header + main |
| `src/components/AppSidebar.tsx` | **Create** — Sidebar with navigation items |
| `src/components/AppHeader.tsx` | **Create** — Top header bar |
| `src/components/BottomNav.tsx` | **Delete** — No longer needed |
| `src/pages/DashboardPage.tsx` | **Rewrite** — Multi-column desktop grid |
| `src/pages/InventarioPage.tsx` | **Rewrite** — Table-based layout |
| `src/pages/CrmPage.tsx` | **Rewrite** — Desktop kanban + tables |
| `src/pages/FinanzasPage.tsx` | **Rewrite** — Dashboard grid layout |
| `src/pages/MasPage.tsx` | **Rewrite** — Desktop settings layout |
| `src/pages/ProductosPage.tsx` | **Rewrite** — Data table with actions |
| `src/pages/LoginPage.tsx` | **Update** — Desktop-sized centered card |
| `src/components/KpiCard.tsx` | **Update** — Desktop-optimized sizing |
| `src/index.css` | **Update** — Add DM Sans + workspace-scale typography |

## Design Principles
- **Data density**: Tables over cards for lists. Show more data per screen.
- **Multi-panel layouts**: Use CSS Grid `grid-cols-3`, `grid-cols-4` for dashboards.
- **Professional dark theme**: Keep existing color system, increase contrast and whitespace for desktop.
- **No mobile bottom nav**: Sidebar is the primary navigation paradigm.
- **Charts expand**: Larger chart areas (300px+ height instead of 180px).

No database changes required — this is purely a frontend layout transformation.


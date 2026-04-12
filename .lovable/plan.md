

# Balance de Comprobación (Trial Balance)

## Overview
Add a new "Balance Comprobación" tab to FinanzasPage that aggregates all transactions (sales, expenses, costs) by chart of accounts, showing debits, credits, and balances per account. Include summary charts for visual analysis.

## Data Sources & Interconnection Logic

The trial balance pulls from ALL financial sources:

| Source | Debit | Credit | Account Mapping |
|--------|-------|--------|-----------------|
| **Sales** (ventas) | — | total_usd | `account_id` → chart_of_accounts, or default to Ingreso accounts |
| **Sale Items** (COGS) | unit_cost × qty | — | Maps to Costo de Ventas (inventory cost) |
| **Expenses** (gastos) | amount_usd | — | `account_id` → chart_of_accounts, or category-based mapping |
| **Costs** (costos) | amount_usd | — | `account_id` → chart_of_accounts, or category-based mapping |
| **Inventory** | Derived from movements | — | Maps to Inventarios account (13000) |
| **Accounts Receivable** | Unpaid sales (pending/overdue) | Paid sales | Maps to CxC account (12000) |

## Changes

### 1. Add tab to FinanzasPage
- Add "Balance" to the `tabs` array (between "Reportes" and "Flujo Caja")
- Render new `<BalanceComprobacionTab>` component with all data props (sales, expenses, costs, saleItems, rate)

### 2. New component: `src/components/finanzas/BalanceComprobacionTab.tsx`

**Table section — Trial Balance by Account:**
- Fetch `chart_of_accounts` with hierarchical structure
- For each account, aggregate debits and credits from all sources using `account_id` foreign keys + automatic mappings for unmapped transactions
- Columns: Código, Cuenta, Tipo, Débitos USD, Créditos USD, Saldo Deudor, Saldo Acreedor
- Group by account_type (Activo, Pasivo, Capital, Ingreso, Gasto, Costo)
- Show subtotals per group and grand totals at bottom
- Validation row: Total Débitos = Total Créditos (highlight in green if balanced, red if not)
- DatePeriodFilter for time range selection
- Export to Excel button

**Chart 1 — Composición por Tipo de Cuenta (Stacked Bar):**
- Horizontal stacked bar showing the balance distribution across account types
- Colors per type: Activo=blue, Pasivo=orange, Capital=purple, Ingreso=green, Gasto=red, Costo=yellow

**Chart 2 — Debit vs Credit by Account Type (Grouped Bar):**
- Grouped bar chart comparing total debits vs credits for each account type
- Helps visualize where money flows

**Chart 3 — Balance Verification Donut:**
- Donut chart showing total debits vs total credits
- Center text shows the difference (should be 0 for a balanced set of books)

**KPI cards at top:**
- Total Débitos, Total Créditos, Diferencia (should be ~0), Cuentas Activas

### 3. Account Mapping Logic
For transactions without `account_id`, auto-map based on:
- Sales → default Ingreso account (code starting with 40xxx or 41xxx)
- Expenses → map by category to Gasto accounts (50xxx-59xxx)
- Costs → map by category to Costo accounts (matching classification)
- COGS from sale_items → Costo de Ventas account
- Unpaid sales → Cuentas por Cobrar (12xxx)

### 4. Validation Checks
Display warnings if:
- Débitos ≠ Créditos (partida doble not balanced)
- Accounts with no transactions (optional toggle to show/hide)
- Transactions with no account mapping (show count of unmapped)

## Technical Notes
- Component will be ~400 lines, extracted to its own file
- Uses existing queries from FinanzasPage (sales, expenses, costs, saleItems) plus a new query for chart_of_accounts
- DatePeriodFilter reused from existing components
- Recharts for all charts (already installed)
- Export via existing `exportToExcel` utility


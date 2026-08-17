# VPR Systems — Codebase Architecture Document

> Source of truth for re-engineering work. Produced by static analysis of the repository at commit `e5c0d3b` ("Initial commit 5") on 2026-08-10. Everything under **CURRENT IMPLEMENTATION** is derived directly from code with file:line evidence. Everything under **RECOMMENDATION** is a proposal, not a fact. Anything that could not be verified from the repository is explicitly marked `UNKNOWN — requires verification`.

---

## 1. What This Application Is

VPR Systems is an internal **inventory / stock, sales-dispatch, and purchase-procurement management system** for what appears to be a manufacturing/distribution business ("VPR", order numbers, dispatch numbers, lifting numbers, godowns = warehouses). It tracks:

- Multi-godown (warehouse) stock levels per product, built from an append-only ledger of stock **transactions** (opening stock, factory-in, transfers, dispatch-out, purchase-in, adjustments).
- **Sales**: orders → dispatch planning → dispatch execution → customer WhatsApp notifications.
- **Purchase**: indents (requisitions) → vendor selection → vendor approval → delivery/goods receipt (with multi-godown allocation).
- **Master data**: products, godowns, customers, vendors, transporters, product groupings.
- **User management** with a custom (non-Supabase-Auth) username/password login and per-user page/tab access control (a simple RBAC-by-array system, not Postgres RLS).

It is a single-tenant, single-page React application talking directly to a Supabase Postgres database via the `@supabase/supabase-js` client — there is no custom backend API server. One Supabase Edge Function exists, solely to proxy outbound WhatsApp Business API calls.

---

## 2. Repository File Structure

```text
VPR_System_V1/
│
├── .env                              # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignored, not committed)
├── vite.config.js                    # Active Vite config (JS) — see §20 “Duplicate Config” finding
├── vite.config.ts                    # Dead/duplicate Vite config (TS) — not referenced by any script
├── vercel.json                       # SPA rewrite rule for Vercel deployment
├── components.json                   # shadcn/ui generator config
├── jsconfig.json                     # "@/*" -> "./src/*" path alias (mirrors vite alias)
├── eslint.config.js                  # Flat ESLint config — see §20 (TS-only glob, misses .jsx)
├── package.json / package-lock.json
├── supabaseSCHEMA.sql                # Hand-maintained schema dump ("context only, not meant to be run")
│
├── supabase/
│   ├── functions/
│   │   └── send-whatsapp/index.ts    # Edge Function: WhatsApp Cloud API proxy
│   └── migrations/                   # 6 incremental ALTER-TABLE migrations (Jun 2026), NOT a full schema history
│
├── assets/
│   └── vpr_logo.png                  # referenced from src via relative path ../../assets/...
│
└── src/
    ├── main.jsx                      # ReactDOM root, StrictMode
    ├── App.jsx                       # Router + route table (only router config in the app)
    ├── index.css                     # Tailwind entry + custom scrollbar/gradient utility classes
    ├── supabase.js                   # Supabase client singleton (anon key)
    │
    ├── store/
    │   └── authStore.js              # Zustand store, persisted to localStorage key "vpr-systems"
    │
    ├── constants/
    │   └── index.js                  # USER_ROLES, GENDERS, PAGES (route/menu registry), PAGE_TABS, DEFAULT_USER_PAGES
    │
    ├── lib/
    │   └── utils.js                  # `cn()` clsx/tailwind-merge helper (shadcn boilerplate)
    │
    ├── services/                     # THE data-access layer — every Supabase call lives here (13 files)
    │   ├── authService.js            # loginUser() — plaintext credential check against `users` table
    │   ├── masterService.js          # products, godowns, opening stock, bulk import
    │   ├── customerService.js / vendorService.js / transporterService.js   # near-identical CRUD triplets
    │   ├── productGroupingService.js # product_groups / product_group_members
    │   ├── stockService.js           # the ledger engine: transactions, FSG simulation, void/edit/transfer
    │   ├── salesService.js           # sales_orders, dispatch_plans, cancellation, WhatsApp triggers
    │   ├── purchaseService.js        # purchase_indents → vendor selection → approval → deliveries
    │   ├── dashboardService.js       # aggregation queries for Live Stock Dashboard
    │   ├── settingsService.js        # user CRUD (Settings page)
    │   ├── myprofileService.js       # self-service profile fetch/update
    │   ├── storageService.js         # Supabase Storage upload (profile pictures)
    │   └── whatsappService.js        # thin wrapper invoking the `send-whatsapp` Edge Function
    │
    ├── components/                   # Shared/reusable, cross-page components
    │   ├── Layout.jsx                # Sidebar + Header + <Outlet/> shell for all protected routes
    │   ├── Sidebar.jsx                # Nav menu, filtered by user.page_access; Realtime self-subscription
    │   ├── Header.jsx                 # Topbar, user dropdown, notification bell (largely stubbed out)
    │   ├── ProtectedRoute.jsx         # Auth + page-access route guard (see §16)
    │   ├── DataTable.jsx              # Standard responsive table+card+pagination wrapper used by all list pages
    │   ├── DragScrollTable.jsx        # Mouse-drag horizontal scroll behavior for wide tables
    │   ├── ModalForm.jsx              # Generic modal shell (header/body/footer) used across most *Modal.jsx files
    │   ├── ConfirmationModal.jsx      # Generic confirm/destructive-action dialog
    │   └── ui/                        # shadcn/radix primitives: button, input, textarea, Select, dropdown,
    │                                   # popover, calendar, date-picker, modal, pagination
    │
    └── pages/                         # One folder per top-level route, each with local `components/`
        ├── Login.jsx                  # Public route; custom credential form
        ├── LiveStockDashboard/        # Read-only stock overview (per-product per-godown opening/in/out/closing)
        ├── StockManagement/           # Factory-in, Transfer, Dispatch(bulk), Void, transaction ledger + edit
        ├── Master/                    # Tabbed: Products, Godowns, Customers, Vendors, Transporters, Product Grouping
        ├── Sales/                     # Tabbed: Orders, Dispatch Planning, Dispatch Completed, Inform flows, Skip-Delivered
        ├── Purchase/                   # Tabbed: Indent, Vendor Selection, Vendor Approval, Delivery, Aawak Details
        ├── Settings/                  # User management (create/edit users, assign page_access & tab_access, roles)
        └── MyProfile/                  # Self-service profile view/edit + profile picture upload
```

### File classification

| Category | Files |
|---|---|
| **Active / load-bearing** | Everything under `src/services/`, `src/store/authStore.js`, `src/supabase.js`, `App.jsx`, `main.jsx`, `ProtectedRoute.jsx`, `Layout.jsx`, `Sidebar.jsx`, all `pages/**`, `supabase/functions/send-whatsapp/index.ts` |
| **Supporting / shared UI** | `DataTable.jsx`, `ModalForm.jsx`, `ConfirmationModal.jsx`, `DragScrollTable.jsx`, `components/ui/*`, `constants/index.js`, `lib/utils.js` |
| **Configuration** | `vite.config.js`, `vercel.json`, `components.json`, `jsconfig.json`, `eslint.config.js`, `.env` (local, ungitignored value pair) |
| **Documentation-only / reference (not executed)** | `supabaseSCHEMA.sql` (explicitly labeled "context only… not meant to be run") |
| **Partial history** | `supabase/migrations/*.sql` — only 6 migrations dated 2026-06-08/06-13 exist; the base schema (users, products, transactions, sales/purchase tables) predates the migration folder and was evidently created directly against the Supabase project (via SQL editor / dashboard), not tracked in this repo. **This means the migrations folder is NOT a reliable full history — `supabaseSCHEMA.sql` is the only complete (if stale-labelled) reference.** |
| **Legacy / dead code** | `vite.config.ts` — duplicate of `vite.config.js` with the Tailwind plugin and path alias removed; not referenced by any npm script (`"dev": "vite"` resolves `vite.config.js` by default file-resolution order). Confirmed unused by checking `package.json` scripts (§20). |
| **Potentially unused** | `sheetjs` and `xlsx` are both declared in `package.json` (§20 dependency overlap) — needs runtime grep to confirm both are actually imported. `Header.jsx`'s notification-fetching logic (§5) is mostly commented-out/stubbed (`// Notifications table missing, disabling fetch for now`) — dead code path kept for a future notifications table. |
| **Generated** | `package-lock.json`, `dist/` (build output, gitignored) |

---

## 3. Frontend Architecture

### 3.1 Application entry & startup sequence

```text
Browser
   ↓
index.html → src/main.jsx
   ↓
<StrictMode><App/></StrictMode>                         (main.jsx:6-9)
   ↓
App.jsx: <Router><Toaster/><Routes>…</Routes></Router>   (App.jsx:16-45)
   ↓
Route match:
  "/login"  → <Login/>                                   (public)
  "/*"      → <ProtectedRoute><Layout/></ProtectedRoute>  (guarded)
   ↓ (if authenticated + authorized)
Layout.jsx: <Sidebar/> + <Header/> + <Outlet/>            (Layout.jsx:6-49)
   ↓
Matched child route's Page component (e.g. Sales.jsx)
   ↓
Page mounts → calls one or more services/*.js functions on useEffect
   ↓
services/*.js → supabase.from(...) / supabase.rpc(...) / supabase.functions.invoke(...)
   ↓
Supabase (PostgREST + Postgres) → response
   ↓
Page setState → re-render → DataTable / Modal components
```

There is **no root-level provider tree** (no ThemeProvider, no QueryClientProvider, no custom AuthProvider/Context). Global concerns are handled ad hoc:
- Auth state: a Zustand store (`useAuthStore`), not React Context.
- Toasts: `react-hot-toast`'s own singleton `<Toaster/>` mounted once in `App.jsx:20`.
- No error boundary exists anywhere in the codebase (`grep` for `componentDidCatch`/`ErrorBoundary` — none found). An uncaught render error in any page will white-screen the whole app.

### 3.2 Routing

Defined entirely in [App.jsx](src/App.jsx). No lazy-loading (`React.lazy`) is used anywhere — every page is eagerly bundled into the main chunk.

| Route | Component | Auth | Page-level Authorization | Purpose |
|---|---|---|---|---|
| `/login` | `Login` | Public | — | Username/password sign-in |
| `/` (index) | redirects → `/live-stock-dashboard` | Required | — | Default landing page |
| `/live-stock-dashboard` | `LiveStockDashboard` | Required | `page_access` must include `live-stock-dashboard` | Stock overview dashboard |
| `/stock-management` | `StockManagement` | Required | `page_access: stock-management` | Ledger entry/edit/void |
| `/master` | `Master` | Required | `page_access: master` (+ per-tab `tab_access.master`) | Master data CRUD, tabbed via `?tab=` query param |
| `/settings` | `Settings` | Required | `page_access: settings` | User management |
| `/sales` | `Sales` | Required | `page_access: sales` (+ `tab_access.sales`) | Sales order → dispatch workflow, tabbed |
| `/purchase` | `Purchase` | Required | `page_access: purchase` (+ `tab_access.purchase`) | Indent → delivery workflow, tabbed |
| `/my-profile` | `MyProfile` | Required | `page_access: my-profile` (in `DEFAULT_USER_PAGES`, always granted) | Self-service profile |
| `*` (catch-all) | redirect → `/` | — | — | 404 fallback is a silent redirect, not a 404 page |

**CURRENT IMPLEMENTATION — route protection**: `ProtectedRoute` ([src/components/ProtectedRoute.jsx](src/components/ProtectedRoute.jsx)) wraps the entire `Layout` subtree once (`App.jsx:23-27`), not per-route. It reads `user.page_access` (an array of page IDs) from the Zustand store and:
1. If no `user` in store → redirect to `/login`.
2. Normalizes the current pathname to a page ID and checks membership in `allowedPages` (exact match or `startsWith` for nested paths).
3. If not allowed, redirects to the user's first allowed page, or to `/login` if they have none.

There are no distinct "admin routes" at the router level — `Settings` (user management) is reachable by anyone whose `page_access` array happens to include `"settings"`; there is no additional role check gating it. Role (`SUPER ADMIN` / `ADMIN` / `USER`) is a data attribute used cosmetically (e.g. Sidebar footer, Header's `isAdmin` notification gate) but does **not** independently gate any route — only `page_access`/`tab_access` do, and both are ordinary editable columns on the `users` table with no database-level enforcement (see §9, §16).

Tabs within `Master`, `Sales`, and `Purchase` are not separate routes — they are client-side state (`Master` uses `useSearchParams` for `?tab=`; `Sales`/`Purchase` likely use local `useState`, `UNKNOWN — requires verification` for the exact mechanism per page, not fully read) filtered against `user.tab_access.<page>` (an array stored as `jsonb` per page, e.g. `tab_access.master = ["products","godowns"]`).

### 3.3 Component architecture

**Layout shell**
```text
Component: Layout
Location: src/components/Layout.jsx
Purpose: Persistent app shell (sidebar + header + footer) around all protected pages
Props: none
State: none (delegates to Sidebar/Header)
Hooks: useLocation (currently unused result — isFixedPage is hardcoded false, dead logic, Layout.jsx:8)
Children: Sidebar, Header, <Outlet/>
Potential problems: `isFixedPage` dead code; no error boundary around <Outlet/>
```

**Sidebar** — [src/components/Sidebar.jsx](src/components/Sidebar.jsx)
```text
Purpose: Primary navigation, filtered by user.page_access; also owns a Realtime subscription
State: isOpen (mobile drawer)
Supabase calls: supabase.channel('user-permission-updates').on('postgres_changes', UPDATE users WHERE user_id=eq.<self>) — see §18
Side effects: on permission change, live-patches the Zustand user object (page_access, tab_access…) without requiring re-login
Potential problems:
  - Dead "dropdown" menu-item branch (item.type === 'dropdown') — PAGES never produces this shape, so lines 230-271 are unreachable.
  - NavLink icon className computed with an inline arrow function passed to template string (line 288) — `({isActive}) => ...` is stringified instead of invoked; the active-icon color branch never actually applies (icon color is always the "inactive" class). Cosmetic bug, not filed as a defect since analysis-only phase, but worth flagging: SIDEBAR ICON ACTIVE-STATE BUG.
```

**ProtectedRoute** — see §3.2 for logic; it is presentational-only, no data fetching.

**DataTable** — [src/components/DataTable.jsx](src/components/DataTable.jsx)
```text
Purpose: Shared responsive list view — desktop <table>, mobile card grid, integrated pagination footer
Props: headers, data, renderRow, renderCard, minWidth, currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange, totalResults, itemsPerPageOptions
Notable coupling: contains a special-cased row-highlight rule keyed on `item.orderType` ("urgent order" / "stock order") — a generic table component with sales-domain knowledge baked in (DataTable.jsx:58-66). This is a code-quality smell: domain logic (order urgency styling) leaking into a "generic" shared component.
Consumers: virtually every list-bearing page (Master's sub-tables, Sales/Purchase tables, StockManagement's TransactionTable, etc.)
```

**ModalForm / ConfirmationModal** — generic modal shells reused by the ~20 `*Modal.jsx` files under each page's `components/` folder (ProductModal, GodownModal, CustomerModal, IndentModal, OrderModal, DispatchModal, UserModal, etc.). Each domain modal composes ModalForm + its own field set + calls straight into the matching service function — **no shared form-validation library** (no react-hook-form/zod/yup in `package.json`); validation is manual, ad hoc, and duplicated per modal (e.g. quantity/date checks are re-implemented in both `stockService.js` and presumably in the modal components — `UNKNOWN — requires verification` for the exact split without reading every modal file).

**Page-level components** (pattern common to Master, Sales, Purchase, Settings, StockManagement, LiveStockDashboard — confirmed directly in Master.jsx and Settings.jsx, and by structural symmetry across the other pages' file layout):
```text
Purpose: Top-level route component — owns ALL state for its page (lists, filters, modal-open flags, editing-target, pagination), fetches data on mount via useEffect, renders tab switcher + DataTable + Modal(s)
State: page data arrays, `loading`, per-entity modal-open booleans, per-entity `editing<Entity>` objects, searchTerm, filters, currentPage
Hooks: useState heavily (10-20+ state variables per page — Master.jsx alone declares 20), useMemo for client-side filtering, useSearchParams (Master only, for ?tab=)
Supabase/API calls: NONE directly — pages call `services/*.js` functions, never `supabase.from()` directly (this convention holds: `grep supabase.from src/pages` returns no direct hits based on files read — pages consistently go through the service layer)
Potential problems:
  - Pages are large "God components" mixing data-fetching orchestration, client-side filtering/search, pagination, and tab routing all in one file (Master.jsx = 459 lines, Sales.jsx = 378 lines, Purchase.jsx = 273 lines).
  - Client-side-only filtering/search (Master.jsx:77-120) — all rows are fetched, then filtered/paginated in the browser. Fine at current data volumes, will not scale (see §21 Performance).
  - No react-query/SWR — every "refresh after mutation" is a manual re-call of the fetch function passed as onSuccess callback into modals (e.g. Settings.jsx:139 `onSuccess={fetchUsers}`), meaning any page that wants to reflect a change must remember to hand the mutation an explicit refetch callback. Easy to forget on new features.
```

### 3.4 State management

| Category | Mechanism | Evidence |
|---|---|---|
| **Global — auth** | Zustand (`zustand` + `persist` middleware), localStorage key `vpr-systems` | [src/store/authStore.js](src/store/authStore.js) |
| **Global — auth (duplicate!)** | A second copy of the logged-in user is also written straight to `localStorage.setItem('user', ...)` in `Login.jsx:40`, and read back nowhere else that was found (`UNKNOWN — requires verification` whether any code still reads the raw `localStorage['user']` key instead of the store — Sidebar's `handleLogout` removes it (`Sidebar.jsx:81`) but doesn't rely on it for reads). **This is redundant, divergence-prone state** — two sources of truth for "current user" (Zustand-persisted store vs. raw localStorage key). |
| **Server state (remote data)** | No caching/query library. Every page manually `useState` + `useEffect` + service call. No request deduplication, no stale-time, no background refetch. |
| **Local/UI state** | `useState` per component; no `useReducer` usage found. |
| **URL state** | Only `Master.jsx` uses `useSearchParams` for the active tab (`?tab=products`). Other tabbed pages (Sales/Purchase) do **not** appear to sync tab state to the URL — `UNKNOWN — requires verification`, not fully read, but no `useSearchParams` import was seen in the file list grep beyond Master. If confirmed, this is an inconsistency: some tabs are bookmarkable/shareable, others reset to tab 1 on refresh. |
| **Realtime state** | `Sidebar.jsx` subscribes to the current user's own row in `users` via `postgres_changes` and patches the Zustand store in place — the only realtime-driven state in the app. |
| **Persistent state** | `localStorage['vpr-systems']` (Zustand persist), `localStorage['user']` (raw duplicate), `localStorage['hasSeenLanguageHint']` (cleared unconditionally on every Login mount, `Login.jsx:19-22` — dead feature, the flag is removed before it could ever be read elsewhere; grep found no reader). |

**Problematic duplication identified**: `authStore.user` and `localStorage['user']` are two independent copies of the same logical object, set together at login (`Login.jsx:40-41`) but only one (the store) is kept live by the Realtime patch in Sidebar. If any code path reads the raw key later, it will silently serve stale permissions after an admin changes a user's access. Recommend consolidating to the single Zustand-persisted store.

---

## 4. Supabase Architecture

### 4.1 Client initialization

```js
// src/supabase.js
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseKey)
```
Single client instance, imported by every `services/*.js` file and by `Sidebar.jsx` (for the Realtime channel) and `Login.jsx`/`authService.js` (indirectly). Uses the **anon key** only — correct practice; no service-role key is present anywhere in frontend code (checked: only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` exist in `.env`, and the anon key is the only key referenced in `src/`).

### 4.2 Usage inventory

| API surface | Used? | Where |
|---|---|---|
| `supabase.from()` | **Extensively** | All 13 files in `src/services/` |
| `supabase.rpc()` | **Not used anywhere** | No Postgres RPC functions are called from the frontend — all business logic (stock-balance simulation, duplicate-product detection, numbering sequences) is implemented **client-side in JavaScript** inside `services/*.js`, not as database functions. See §10. |
| `supabase.auth` | **Not used at all** | Confirms this app does NOT use Supabase Auth. See §16. |
| `supabase.storage` | Used once | `storageService.js` — `profile_picture` bucket, for profile photo uploads |
| `supabase.channel()` | Used once | `Sidebar.jsx` — `user-permission-updates` channel on `postgres_changes` for the `users` table |
| `supabase.functions.invoke()` | Used once (as a wrapper) | `whatsappService.js` → `send-whatsapp` Edge Function |

### 4.3 Data-access pattern: UI → Service → Database

The codebase consistently follows a **service-layer pattern**, not raw `UI → Database`:
```text
Page component (e.g. Sales.jsx)
   ↓ calls
services/salesService.js  (business rules: order numbering, dispatch stock checks, WhatsApp triggers)
   ↓ calls
supabase.from('sales_orders')... / supabase.from('dispatch_plans')...
   ↓
PostgREST → Postgres
```
No component was found calling `supabase.from()` directly — `Sidebar.jsx`'s realtime subscription is the one exception, but that is infrastructure (auth-permission sync), not business data. This is a genuinely good separation for a project of this size — **RECOMMENDATION**: preserve this convention in any refactor; it is the strongest architectural asset in the codebase.

There is, however, **no repository/domain-model abstraction above Supabase** — services return raw PostgREST response shapes (snake_case DB columns) straight into component state, so DB schema changes propagate directly into UI code with no translation layer.

---

## 5. Database Schema

Source of truth: [supabaseSCHEMA.sql](supabaseSCHEMA.sql) (explicitly a manually maintained dump — "not meant to be run") cross-checked against `supabase/migrations/*.sql`. No RLS policies, triggers, views, or functions are defined in any file in this repository (see §9, §11, §12, §13 — all `UNKNOWN — requires Supabase schema inspection` beyond what's inferred from usage).

### 5.1 Tables

**`users`**
| Column | Type | Nullable | Default | PK/FK |
|---|---|---|---|---|
| user_id | uuid | NOT NULL | gen_random_uuid() | PK |
| full_name | text | NOT NULL | | |
| designation | text | YES | | |
| date_of_birth | date | YES | | |
| gender | text | YES | | |
| email | text | YES | | |
| phone_number | text | YES | | |
| current_address | text | YES | | |
| username | text | NOT NULL | | UNIQUE |
| password_hash | text | NOT NULL | | — **stores plaintext, not a hash; see §9** |
| role | text | YES | | free text, validated client-side against `USER_ROLES` only |
| is_active | boolean | YES | true | |
| profile_picture | text | YES | | public Storage URL |
| page_access | text[] | YES | '{}' | drives `ProtectedRoute` / `Sidebar` |
| created_at | timestamp (no tz) | YES | now() @ Asia/Kolkata | |
| tab_access | jsonb | YES | '{}' | e.g. `{"master": ["products","godowns"], ...}` |

**`products`**
| Column | Type | Nullable | Default | PK/FK |
|---|---|---|---|---|
| product_id | uuid | NOT NULL | gen_random_uuid() | PK |
| name | varchar | NOT NULL | | |
| unit | varchar | NOT NULL | | |
| allow_negative_stock | boolean | YES | true | drives whether a product can go negative in the ledger |
| created_at | timestamptz | YES | now() | |
| product_type | varchar | YES | '' | |

Note: `masterService.js` reads/writes `brand_name`, `category`, `mux` columns on `products` (used for duplicate-detection key and bulk import) that **do not appear in `supabaseSCHEMA.sql`** — the schema dump is stale relative to the actual database. Flagged as `SCHEMA FILE OUT OF DATE — requires live Supabase inspection` (see §9.1 caveat).

**`godowns`**
| Column | Type | Nullable | Default | PK |
|---|---|---|---|---|
| godown_id | uuid | NOT NULL | gen_random_uuid() | PK |
| name | varchar | NOT NULL | | |
| is_active | boolean | YES | true | |

**`transactions`** — the append-only stock ledger, the core of the whole system
| Column | Type | Nullable | Default | PK/FK |
|---|---|---|---|---|
| txn_id | uuid | NOT NULL | gen_random_uuid() | PK |
| product_id | uuid | NOT NULL | | FK → products |
| godown_id | uuid | NOT NULL | | FK → godowns |
| txn_date | date | NOT NULL | | CHECK txn_date <= CURRENT_DATE |
| txn_type | enum `txn_type` | NOT NULL | | values seen in code: OPEN_STOCK, IN_FACTORY, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT_IN, ADJUSTMENT_OUT, OUT_GODOWN, PURCHASE_IN (PURCHASE_IN added via migration) |
| qty | numeric | NOT NULL | | CHECK qty >= 0 |
| is_void | boolean | YES | false | soft-delete flag — nothing is ever hard-deleted from this table by the app |
| void_reason | varchar | YES | | |
| ref_txn_id | uuid | YES | | FK → transactions.txn_id (self-ref; links a correction to the original) |
| pair_id | uuid | YES | | groups TRANSFER_OUT/TRANSFER_IN legs of one transfer |
| created_at | timestamptz | YES | now() | |
| created_by | uuid | YES | | FK → users |
| back_dated | boolean | YES | false | flags entries dated in the past relative to entry time |
| dispatch_plan_id | uuid | YES | | FK → dispatch_plans (added by migration) |
| dispatch_number | text | YES | | (added by migration) |
| lr_number, vehicle_number, lifting_number | text | YES | | purchase/logistics tracking fields |

**`daily_snapshots`** — PK (snapshot_date, product_id, godown_id); `closing_stock numeric`, `stale boolean`. **No code in `src/` reads or writes this table** (`grep daily_snapshots src` — no hits across all services read). Likely intended for a nightly snapshot job (e.g. a cron Edge Function) that does not exist in this repo, or a leftover from an earlier design. Flagged as **potentially unused / orphaned table** — do not delete without checking for external jobs (Rule 2: trace before concluding; no such job was found in this repo, so its existence outside the repo is `UNKNOWN — requires verification`).

**`customers`** / **`vendors`** / **`transporters`** — simple master-data tables (name, location/phone/email/gst for customers & vendors; name/vehicle/driver-phone for transporters). No FKs into them from `transactions`.

**`product_groups`** / **`product_group_members`** — many-to-many grouping of products (`product_groups.created_by` → users; junction table `product_group_members(group_id, product_id)`).

**`sales_orders`** → **`sales_order_items`** → **`dispatch_plans`**
- `sales_orders`: order_number (unique, format `VPR/OR-###`), customer_id FK, total_amount, is_void, process_type (`'order_process'` | `'skip_delivered'` — used to branch Sales workflow tabs).
- `sales_order_items`: order_id FK, product_id FK, godown_id FK, unit_price, quantity (CHECK > 0), cancelled_quantity (CHECK >= 0, added by migration).
- `dispatch_plans`: order_item_id FK, quantity, godown_id FK, unit_price, is_planned, dispatch_date, dispatch_number (unique, format `DN-####`), dispatch_status (`Pending`/`Planned`/`Partially Dispatched`/`Dispatch Done`/`Cancelled` — inferred from code branches), created_by FK, inform_before_dispatch / inform_after_dispatch (free-text status strings driving customer notification workflow), cancelled_at/reason/by.
- Migration `20260608_add_cancellation_and_partial_dispatch.sql` **dropped** the original UNIQUE constraint on `dispatch_plans.order_item_id`, explicitly to allow multiple dispatch plans (partial dispatches) per order item — an intentional relaxation.

**`purchase_indents`** → **`purchase_indent_items`** → **`purchase_deliveries`** → **`purchase_delivery_godowns`**
- `purchase_indents`: indent_number (unique, `VPR/IN-###`), godown_id FK, vendor_id FK, remarks, total_amount, is_void, process_type (`'process'` | `'direct'` — direct-purchase bypass path).
- `purchase_indent_items`: indent_id FK, product_id FK, quantity, rate, planning_date/vendor_remarks/vendor_id/planning_status (vendor-selection stage), approval_status/approved_godown_id (approval stage).
- `purchase_deliveries`: item_id FK, indent_id FK, delivery_date, received_quantity, transporter_id FK, lr_number, vehicle_number, remarks, lifting_number (unique-ish sequence `LIFT-####`), status (`In Transit`/`Arrived`/etc.), expected_delivery_date, status_updated_at.
- `purchase_delivery_godowns`: delivery_id FK, godown_id FK, qty — supports splitting one delivery's received quantity across multiple godowns.

### 5.2 `godown_stock` — undocumented view

`stockService.js`, `masterService.js`, and `salesService.js` all query `supabase.from('godown_stock').select('product_id, godown_id, current_stock')` as a read source of pre-aggregated current stock balances. **This object does not appear anywhere in `supabaseSCHEMA.sql` or the migrations folder.** It must be a Postgres **view** (or materialized view) created directly in the Supabase dashboard/SQL editor, outside this repository's tracked schema artifacts.

```text
UNKNOWN — requires Supabase schema inspection: godown_stock definition (view vs. table, refresh strategy if materialized, exact aggregation logic)
```
This is a significant documentation gap: the single most business-critical read path (current stock level) has its authoritative definition living entirely outside version control. **RECOMMENDATION (High priority)**: extract `CREATE VIEW godown_stock AS ...` from the live database and commit it as a migration immediately.

### 5.3 Relationship diagram

```text
users ──────────────┬─ created_by → transactions, sales_orders, purchase_indents, dispatch_plans, product_groups
                     └─ page_access[] / tab_access{} drive frontend routing (no DB enforcement)

products ─┬─ transactions (ledger entries)
          ├─ sales_order_items
          ├─ purchase_indent_items
          └─ product_group_members ─ product_groups

godowns ─┬─ transactions
         ├─ sales_order_items / dispatch_plans
         ├─ purchase_indents / purchase_delivery_godowns
         └─ daily_snapshots (orphaned — no app code touches it)

customers ─ sales_orders
vendors   ─ purchase_indents, purchase_indent_items (vendor_id per-item override)
transporters ─ purchase_deliveries

sales_orders ─ sales_order_items ─ dispatch_plans ─┬─ transactions (dispatch_plan_id link, OUT_GODOWN)
                                                     └─ WhatsApp notification trigger (inform_after_dispatch)

purchase_indents ─ purchase_indent_items ─ purchase_deliveries ─ purchase_delivery_godowns
                                                              └─ transactions (PURCHASE_IN, via lifting_number)

transactions (self-referential): ref_txn_id links a "correction" row to the voided original;
                                  pair_id links TRANSFER_OUT/TRANSFER_IN legs of one transfer

godown_stock (view, UNKNOWN definition) — aggregates transactions into current-stock-by-(product,godown)
```

---

## 6. RLS & Security Analysis

```text
RLS Enabled: UNKNOWN — requires Supabase schema inspection
Policy: UNKNOWN — no CREATE POLICY statements exist anywhere in this repository
```
No SQL file, migration, or config in this repo defines a single Row Level Security policy, nor enables/disables RLS on any table. This repository provides **zero evidence that RLS is configured at all** — combined with the facts below, this is treated as a critical finding rather than an assumption:

### 6.1 Critical security findings

**CRITICAL — Custom auth bypasses Supabase Auth entirely; credentials queried and compared client-side**
```text
File: src/services/authService.js:3-16
Issue: loginUser() runs `supabase.from('users').select('*').eq('username', username).single()`
       using the PUBLIC ANON KEY, then compares `user.password_hash !== password` in the
       BROWSER. This means:
         1. The anon key must be able to SELECT the full `users` row — including password_hash,
            role, and every other user's PII — for this query to succeed at all, for ANY
            unauthenticated visitor who knows (or guesses) a username.
         2. Password comparison happens in client JS after the plaintext password value has
            already round-tripped to the database query layer's response path is NOT itself
            exposing it (the compare happens against the fetched row, not sent to DB), but the
            fetched row's password_hash IS delivered to the browser over the wire before the
            comparison — so the "hash" (really, whatever was stored) is visible in the network
            response to any client that can query that username.
         3. The column is named password_hash but is compared with strict `!==` against the
            raw submitted password (line 14) — meaning it is almost certainly stored as PLAINTEXT,
            not hashed (no bcrypt/argon2/crypto import exists anywhere in the codebase — confirmed
            by absence of any hashing library in package.json).
Why it matters: Anyone with anon-key access (i.e. anyone who loads the app, since the anon key
       ships in the frontend bundle by design) can query `/rest/v1/users?select=*` (subject to
       whatever RLS does or doesn't restrict) and obtain every user's plaintext password, role,
       phone number, email, and full page/tab permissions — without ever logging in.
Recommended solution: Migrate to Supabase Auth (email/password or phone OTP) so credential
       verification happens server-side via GoTrue, never via a client-selectable table. At minimum,
       until migrated: (a) enable RLS on `users` with a policy that blocks anon SELECT of
       password_hash entirely (e.g. a security-definer RPC that returns only a boolean/session
       token, never the row), and (b) hash passwords server-side with bcrypt via an Edge Function
       or RPC — never compare plaintext client-side.
```

**HIGH — No RLS evidence on any business table**
```text
File: N/A (absence of evidence across entire repo)
Issue: Every service in src/services/ performs INSERT/UPDATE/DELETE/SELECT against
       transactions, sales_orders, purchase_indents, dispatch_plans, users, etc. using only the
       anon key. If RLS is not enabled (or is enabled with permissive "allow all" policies —
       common default when people "just get Supabase working"), then ANY visitor to the login
       page's JS bundle can extract the anon key (it is not a secret — it's meant to be public)
       and issue arbitrary PostgREST requests directly against these tables, bypassing the
       React app, ProtectedRoute, and page_access checks entirely — because none of those are
       enforced in the database.
Why it matters: page_access / tab_access / role are purely cosmetic UI-layer gates. There is no
       verified server-side authorization boundary in this system at all.
Recommended solution: This is the single highest-priority re-engineering item (see §17 Roadmap,
       Phase 1). Audit and enable RLS on every table with policies that mirror (and enforce, not
       just suggest) the page_access/tab_access model — likely via a custom `current_user_id()`
       claim mechanism, since Supabase Auth (auth.uid()) is not in use.
```

**MEDIUM — Anon key exposure is by design, correctly not flagged as a secret**
```text
File: .env, src/supabase.js
Note: VITE_SUPABASE_ANON_KEY is intended to be public and is correctly the only key used in
      frontend code. No service-role key was found anywhere in src/ or supabase/functions/ —
      this is good practice and should be preserved.
```

**MEDIUM — Edge Function secrets handled correctly**
```text
File: supabase/functions/send-whatsapp/index.ts:43-51
Note: WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are read via Deno.env.get() inside the
      Edge Function (server-side), never exposed to the frontend. This is the correct pattern.
      The function's CORS header `Access-Control-Allow-Origin: '*'` (line 12) is permissive —
      combined with no auth check inside the function body (no verification that the caller is
      an authenticated/authorized user), any third party who discovers the function URL could
      invoke it to send arbitrary WhatsApp template messages billed to this business's WhatsApp
      account. Supabase Edge Functions require the anon/service JWT by default unless
      `verify_jwt = false` is set — UNKNOWN — requires Supabase project config inspection whether
      JWT verification is disabled for this function; if the app calls it via
      `supabase.functions.invoke()` (which it does, whatsappService.js:5) with the anon client,
      a valid anon JWT is being sent, but that only proves the caller has *a* Supabase anon key,
      not that they're one of this app's authenticated users (since this app doesn't use
      Supabase Auth sessions at all — see §16).
Recommended solution: Add a shared-secret or authenticated-user check inside the function, and
      tighten CORS to the app's actual origin(s).
```

**LOW — `deleteOrder()` is a hard-delete "dev-only" utility left in production service code**
```text
File: src/services/salesService.js:602-648
Issue: A comment explicitly says "Dev-only hard delete... so test data can be cleaned up," yet
       the function is exported unconditionally and callable from any component/page that
       imports it, with no environment guard.
Recommended solution: Verify no page currently calls it (UNKNOWN — requires verification, not
       traced to a call site in the files read); if unused, remove it before shipping; if a
       dev/admin utility is genuinely needed, gate it behind role check + confirmation, not a
       comment.
```

### 6.2 What "Anonymous access" means in this app

Because there is no Supabase Auth session, the client is **always** "anonymous" from Supabase's perspective — every single request, authenticated-feeling or not, uses the same anon key with the same (unknown) RLS posture. There is no way for the database to distinguish "a logged-in VPR user performing sales entry" from "an anonymous internet visitor" at the Postgres layer, because the app never establishes a Supabase Auth session. All authorization is therefore, today, enforced *only* by whether the React app happens to render the button — not by the database.

---

## 7. Database Functions & RPC

```text
No supabase.rpc() calls exist anywhere in src/.
No PostgreSQL function (CREATE FUNCTION) definitions exist in supabaseSCHEMA.sql or migrations/.
```
Conclusion: **this application does not use database functions/RPC at all.** Every piece of "business logic" that would typically live in a Postgres function — sequential document numbering (`VPR/OR-001`, `DN-0001`, `VPR/IN-001`, `LIFT-0001`), stock-balance simulation before allowing an edit (`runFSG` in `stockService.js`), duplicate-product detection — is implemented in **client-side JavaScript inside `services/*.js`**, executed in the browser, then written back via plain INSERT/UPDATE.

This has a direct, verifiable consequence: **document-numbering functions have a race condition.** `generateNextOrderNumber()` ([salesService.js:5-25](src/services/salesService.js#L5)) does `SELECT ... ORDER BY order_number DESC LIMIT 1` then computes `next+1` in JS before a separate INSERT. Two users creating an order within the same round-trip window can both read the same "last number" and both attempt to insert the same `order_number`, which is UNIQUE — one will fail with a Postgres unique-violation. `saveDispatchPlan()` explicitly works around exactly this class of race for dispatch numbers by retrying up to 3 times on `23505` ([salesService.js:490-510](src/services/salesService.js#L490-510)) — proving the team is aware of the race for at least one of the four numbering sequences, but has not applied the same retry-loop fix to `generateNextOrderNumber`, `generateNextIndentNumber`, or `generateNextLiftingNumber`.

```text
RECOMMENDATION: Move all sequence generation to a Postgres SEQUENCE or a SECURITY DEFINER
  RPC function using `SELECT ... FOR UPDATE` / advisory locks, eliminating the race entirely
  rather than retry-patching each call site individually.
```

---

## 8. Database Triggers & Views

```text
Triggers: UNKNOWN — requires Supabase schema inspection. No CREATE TRIGGER statements exist in
  this repository. Given that `created_at` timestamps and `updated_at` bookkeeping are set
  explicitly by client code in every INSERT/UPDATE call (e.g. salesService.js repeatedly sets
  `updated_at: new Date().toISOString()` manually), there is no evidence of an `updated_at`
  trigger — if one exists in the live DB it is redundant with the client-side sets; if one
  doesn't exist, any code path that forgets to set updated_at manually will leave it stale.

Views: only `godown_stock` (read-only, current stock aggregation) is referenced by app code;
  its definition is not in this repository (see §5.2). No other view names were found in any
  supabase.from() call across the 13 service files.
```

---

## 9. Application Workflows

### 9.1 Authentication (Login)

```text
User submits username/password on Login.jsx
    ↓
authService.loginUser(username, password)
    ↓
supabase.from('users').select('*').eq('username', username).single()   [anon key, full row incl. password_hash]
    ↓
Client-side: if (user.password_hash !== password) throw 'Invalid credentials'
    ↓ (also checks user.is_active === false → "account deactivated" error)
On success: build a "compatibility object" (adds Name, Admin derived fields) →
    localStorage.setItem('user', ...)   [raw duplicate copy]
    useAuthStore.login(userForStore)    [Zustand persist → localStorage['vpr-systems']]
    ↓
navigate('/' + PAGES[0].id)   → always lands on live-stock-dashboard regardless of page_access
    (ProtectedRoute will then immediately redirect again if the user lacks access to that page)
```
There is no password-reset flow, no "forgot password," no email verification, no MFA, no session expiry/refresh logic (Zustand-persisted state never expires client-side; a user stays "logged in" indefinitely until they manually log out or clear storage — there is no token to expire since there's no Supabase Auth session).

**Logout**: `Sidebar.jsx:80-83` — `localStorage.removeItem('user')` then `navigate('/login')`. Note: **this does NOT clear the Zustand `authStore`/`localStorage['vpr-systems']` key** — only the raw duplicate. `ProtectedRoute` reads `useAuthStore`'s `user`, not the raw key, so if the store still holds a truthy user object after this "logout," the guard would still consider the user authenticated. Whether this results in a real bug depends on whether `authStore`'s `logout()` action is called elsewhere on the logout button — **it does not appear to be**: `handleLogout` in Sidebar.jsx only removes the raw `localStorage['user']` key and navigates; it never calls `useAuthStore.getState().logout()`.
```text
LOGOUT BUG (High confidence, traced): Sidebar.jsx:80-83 does not call the Zustand store's
  logout() action. Since ProtectedRoute (ProtectedRoute.jsx:7) reads `user` from useAuthStore,
  not from the raw localStorage key, the persisted Zustand state survives "logout." A user who
  clicks Logout is navigated to /login, but if they navigate back (browser back button) or the
  app remounts before a fresh reload clears in-memory state... actually because Zustand-persist
  rehydrates FROM localStorage on load, and that key was never cleared, a full page reload after
  "logout" will re-authenticate the user automatically via the still-persisted store. This should
  be verified live, but the code path is unambiguous: logout() the store action exists
  (authStore.js:15-17) and is exported, yet is never imported/called in Sidebar.jsx.
```

### 9.2 Stock ledger — the core domain model

The entire stock system is an **append-only, event-sourced ledger** over the `transactions` table. There is no mutable "current stock" column anywhere the app writes to directly — `godown_stock` (a view of unknown definition) and the in-app JS reducers (`balanceMap` patterns repeated across `masterService.js`, `stockService.js`, `dashboardService.js`) both derive current stock by summing signed transaction rows:
```text
inbound types  (add):    OPEN_STOCK, IN_FACTORY, TRANSFER_IN, ADJUSTMENT_IN, PURCHASE_IN
outbound types (subtract): OUT_GODOWN, TRANSFER_OUT, ADJUSTMENT_OUT
```
This exact classification list is duplicated verbatim across **at least 5 separate files** (`masterService.js:163`, `stockService.js` ×4 occurrences, `dashboardService.js` ×3 occurrences) — a maintenance hazard: adding a new transaction type requires remembering to update every copy (see §22 Code Quality).

**Editing or voiding a past transaction** ([stockService.js](src/services/stockService.js)) runs a client-side simulation called **FSG** ("Forward Simulation from Godown-date"? — name not expanded in code, `runFSG`) that:
1. Computes the balance immediately before the edit point.
2. Replays every subsequent transaction for that (product, godown) forward, substituting the edited/removed row.
3. Rejects the edit if any resulting running balance would go negative **and** the product's `allow_negative_stock` is false.
This "dry-run replay" logic is executed entirely in JavaScript after fetching every affected row, not via a DB constraint or function — for a high-volume ledger this becomes a scaling risk (§21).

```text
Workflow: Void a Transfer
User clicks Void → StockManagement/VoidConfirmModal
    ↓
stockService.voidTransaction(txnId, reason, userId)
    ↓
If transaction has a pair_id (it's a transfer leg):
    Fetch both legs → runFSG on each leg's post-removal balance → if either would go negative
    and product disallows it, THROW (block the void)
    ↓ (else)
    UPDATE transactions SET is_void=true, void_reason=... WHERE txn_id IN (both leg ids)
    ↓
    If original.dispatch_plan_id exists: also mark the linked dispatch_plans row 'Cancelled'
```

### 9.3 Sales: Order → Dispatch Planning → Dispatch → Customer Notification

```text
Sales.jsx (Orders tab)
    ↓ create/edit
salesService.createOrder() / updateOrder()
    ↓
INSERT sales_orders + sales_order_items
    ↓ (if notify_customer)
notifyOrderConfirmation() [fire-and-forget, errors only console.error'd, never surfaced to UI]
    ↓
whatsappService.sendOrderConfirmationWhatsapp()
    ↓
supabase.functions.invoke('send-whatsapp')  →  Meta WhatsApp Cloud API

Sales.jsx (Dispatch Planning tab)
    ↓
salesService.saveDispatchPlan({ order_item_id, quantity, godown_id, dispatch_date, ... })
    ↓
Checks godown_stock.current_stock vs product.allow_negative_stock
    ↓
INSERT/UPDATE dispatch_plans + INSERT/UPDATE linked transactions row (txn_type OUT_GODOWN,
    dispatch_plan_id FK) — stock is deducted AT PLANNING TIME, not at actual dispatch completion
    ↓
completeDispatchWithStockOut() [Dispatch Completed tab] only adjusts the existing txn's qty/date
    if the actually-dispatched amount differs from the planned amount — it does NOT create a
    new stock movement; the movement already happened at planning time.

Sales.jsx (Inform After Dispatch tab)
    ↓
salesService.batchUpdateInformAfterDispatch(planIds, 'Informed')
    ↓
notifyDispatchConfirmation() per plan → WhatsApp "dispatch_confirmation" template

Sales.jsx (Skip Delivered tab) — orders explicitly created with process_type='skip_delivered',
    bypassing normal dispatch planning; getSkipDeliveredItems() filters items whose (quantity −
    dispatched − cancelled) > 0, i.e. still outstanding.

Cancellation: cancelOrderItems() voids any planned/dispatched transactions for the cancelled
    quantity (restoring stock via stockService.voidTransaction), marks affected dispatch_plans
    'Cancelled', increments sales_order_items.cancelled_quantity, and auto-voids the whole
    sales_orders row if every item ends up fully cancelled.
```

### 9.4 Purchase: Indent → Vendor Selection → Approval → Delivery

```text
Purchase.jsx (Indent tab, process_type='process')
    ↓
purchaseService.createIndent() → INSERT purchase_indents + purchase_indent_items

Purchase.jsx (Vendor Selection tab)
    ↓
getAllIndentItemsForVendorSelection() [only process_type='process' items]
    ↓
updateVendorSelection(item_id, {vendor_id, rate, planning_date, vendor_remarks, planning_status})
    → sets purchase_indent_items.planning_status='Planned' (implied by getIndentsForApproval filter)

Purchase.jsx (Vendor Approval tab)
    ↓
getIndentsForApproval() [WHERE planning_status='Planned']
    ↓
approveIndentItem(item_id, {vendor_id, rate, quantity, godown_id}) → approval_status='Approved',
    approved_godown_id set

Purchase.jsx (Delivery tab)
    ↓
getApprovedItemsForDelivery() [WHERE approval_status='Approved'], computes received/remaining
    via SUM(purchase_deliveries.received_quantity WHERE status='Arrived')
    ↓
createDelivery({ item_id, godown_allocations[], transporter_id, lr_number, vehicle_number, status })
    ↓
INSERT purchase_deliveries + purchase_delivery_godowns (one row per godown split)
    ↓ (if status === 'Arrived')
INSERT transactions rows (txn_type PURCHASE_IN, one per godown allocation) → stock increases
    immediately upon marking Arrived; an 'In Transit' delivery does NOT move stock until later
    updated to 'Arrived' via updateDeliveryStatus()

Purchase.jsx (Aawak Details tab) — items whose parent indent has process_type='direct'
    (a "direct purchase," bypassing indent→vendor-selection→approval), tracked the same way
    through createDelivery/updateDeliveryStatus.
```

### 9.5 CRUD matrix

| Feature / Page | Table | SELECT | INSERT | UPDATE | DELETE | RPC |
|---|---|:-:|:-:|:-:|:-:|:-:|
| Login | users | ✓ | – | – | – | – |
| Settings — user mgmt | users | ✓ | ✓ | ✓ | – | – |
| My Profile | users | ✓ | – | ✓ | – | – |
| Master — Products | products, transactions | ✓ | ✓ | ✓ | ✓ | – |
| Master — Godowns | godowns | ✓ | ✓ | ✓ (status toggle) | ✓ | – |
| Master — Customers | customers | ✓ | ✓ | ✓ | ✓ | – |
| Master — Vendors | vendors | ✓ | ✓ | ✓ | ✓ | – |
| Master — Transporters | transporters | ✓ | ✓ | ✓ | ✓ | – |
| Master — Product Grouping | product_groups, product_group_members | ✓ | ✓ | ✓ | ✓ | – |
| Stock Management | transactions, products, godowns, godown_stock | ✓ | ✓ | ✓ (void/edit) | – (soft-void only) | – |
| Sales — Orders | sales_orders, sales_order_items | ✓ | ✓ | ✓ | ✓ (dev-only hard delete) | – |
| Sales — Dispatch Planning/Completed | dispatch_plans, transactions | ✓ | ✓ | ✓ | – | – |
| Purchase — Indent | purchase_indents, purchase_indent_items | ✓ | ✓ | ✓ | ✓ | – |
| Purchase — Vendor Selection/Approval | purchase_indent_items | ✓ | – | ✓ | – | – |
| Purchase — Delivery/Aawak | purchase_deliveries, purchase_delivery_godowns, transactions | ✓ | ✓ | ✓ | – | – |
| Live Stock Dashboard | products, godowns, transactions | ✓ | – | – | – | – |
| WhatsApp notifications | (none directly — via Edge Function) | – | – | – | – | Edge Function invoke |

---

## 10. File & Storage Workflow

```text
Bucket: profile_picture   (used, confirmed) — src/services/storageService.js
Bucket policy (public/private): UNKNOWN — requires Supabase Storage inspection; getPublicUrl()
  is used (storageService.js:16-18), which only produces a working URL if the bucket is public
  or has a public-read policy — implies the bucket is configured public.
Upload path: `profile-pictures/${Math.random()}.${fileExt}` — filename collision risk is
  extremely low but not zero (Math.random() is not cryptographically unique); no content-type
  or file-size validation before upload (no size/type checks in storageService.js); relies
  entirely on whatever bucket-level restrictions exist in Supabase (UNKNOWN).
Consumers: MyProfile page (upload), Sidebar/Header (display via user.profile_picture URL)
```
No other file upload/download workflow exists in the app (no invoice PDF storage, no document attachments on orders/indents/deliveries, despite `jspdf`/`exceljs`/`xlsx`/`sheetjs` being dependencies — those are used for **client-side export generation** — e.g. `exportStockReport.js` in `LiveStockDashboard/` — not for Storage-backed file persistence).

---

## 11. Realtime Architecture

Exactly one Realtime subscription exists in the entire application:
```text
Channel: 'user-permission-updates'
Table: public.users
Event: UPDATE
Filter: user_id=eq.<current user's id>
Location: src/components/Sidebar.jsx:32-77
Purpose: When an admin changes a logged-in user's page_access/tab_access/role from Settings,
  that user's own browser tab live-patches its Zustand store without requiring logout/login.
Lifecycle: subscribed on mount (keyed to user?.user_id), unsubscribed via
  supabase.removeChannel(channel) in the effect cleanup — correctly cleaned up.
Notable robustness: manually parses Postgres's realtime string-array payload format
  ("{a,b}" → ["a","b"]) since Supabase Realtime doesn't always deliver array columns as JS
  arrays over the wire (Sidebar.jsx:48-57) — a defensive but slightly fragile hand-rolled parser
  (would break on a page-id containing a literal comma or curly brace, which is not a realistic
  input here, but worth noting as a hidden coupling to Postgres's text serialization of arrays).
Race/duplicate-subscription risk: Sidebar.jsx is rendered persistently for the lifetime of any
  authenticated session (it's part of Layout, mounted once per protected-route session) — no
  evidence of duplicate subscriptions from repeated mounts, since Layout itself doesn't remount
  on navigation (React Router keeps it mounted across child route changes via <Outlet/>).
```
No other table has Realtime wired up — stock levels, orders, dispatch plans, etc. are all pull-based (manual refetch after mutation), not push-updated. Two browser tabs open on the same Sales page will not see each other's changes without a manual refresh.

---

## 12. Environment Configuration

| Variable | Used By | Purpose | Required | Sensitive |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | `src/supabase.js` | Supabase project REST/Realtime endpoint | Yes | No (public by design) |
| `VITE_SUPABASE_ANON_KEY` | `src/supabase.js` | Supabase anon/public API key | Yes | No (public by design, but see §6 — its effective power depends entirely on RLS being correctly configured) |

No `.env.example` exists in the repo (new developers must be told the two variable names out-of-band or via `README`, which also does not exist). `.env` itself is correctly listed in `.gitignore` and was confirmed absent from `git ls-files` (never committed). No other environment variables (e.g. WhatsApp secrets) are referenced from `import.meta.env` anywhere in `src/` — the WhatsApp secrets live only in the Supabase Edge Function's own environment (`Deno.env.get`), configured via `supabase secrets set` per the comment in `supabase/functions/send-whatsapp/index.ts:4-6`, entirely outside this repo's `.env`.

---

## 13. Dependency Analysis

```text
Core:            react, react-dom, react-router-dom
Database:        @supabase/supabase-js
State:           zustand
UI (Radix/shadcn):  radix-ui, @radix-ui/react-* (avatar, collapsible, dialog, dropdown-menu,
                     popover, scroll-area, select, separator, slot, tooltip), shadcn,
                     class-variance-authority, tailwind-merge, tw-animate-css, clsx
UI (MUI, parallel system): @mui/material, @mui/x-charts — see finding below
Styling:         @tailwindcss/vite, tailwindcss, autoprefixer, postcss
Icons:           lucide-react, @fortawesome/* (fontawesome-svg-core, free-solid-svg-icons,
                     react-fontawesome) — TWO icon systems in parallel, see finding below
Charts:          chart.js + react-chartjs-2, recharts, @mui/x-charts — THREE charting
                     libraries declared simultaneously, see finding below
Forms/Validation: none (no react-hook-form, formik, zod, yup) — all manual
Dates:           date-fns, react-day-picker
Export/Reporting: exceljs, xlsx, sheetjs, jspdf, jspdf-autotable
Notifications:   react-hot-toast
Fonts:           @fontsource-variable/geist
CSS-in-JS:       @emotion/react, @emotion/styled (MUI peer dependency)
Dev/Build:       vite, @vitejs/plugin-react, eslint (+ plugins), typescript-eslint, globals
```

**Dependency overlap / redundancy findings (Should Fix — bundle size & maintainability, not urgent):**
```text
1. Three charting libraries: chart.js/react-chartjs-2, recharts, and @mui/x-charts are all
   declared. UNKNOWN — requires grep-per-page verification which page uses which; at minimum
   this means the bundle ships multiple charting engines' code even if only one is exercised
   on a given page, since none of them are dynamically imported.
2. Two icon systems: lucide-react (used pervasively — confirmed in every file read: Login,
   Sidebar, Header, Master, Settings, etc.) vs. the FontAwesome trio. UNKNOWN — requires
   verification whether FontAwesome is used anywhere at all; if not, it's dead weight.
3. Two UI component systems: the shadcn/Radix primitives (components/ui/*, used throughout
   confirmed pages) vs. @mui/material + @mui/x-charts + @emotion/*. If MUI is only used for
   one chart component, that's a very heavy dependency chain (MUI + Emotion) for a single use.
4. sheetjs (a near-empty/placeholder npm package name, version 2.0.0) alongside xlsx (0.18.5,
   the actual, well-known Excel library) — sheetjs the npm package is not the same as
   "SheetJS" the project (whose real package IS `xlsx`); this may be an accidental/confused
   dependency add. UNKNOWN — requires verification whether `sheetjs` is imported anywhere;
   if not, remove it.
5. jspdf declared as ^4.2.1 — the real published jsPDF major version history does not include
   a 4.x line as of this analysis's knowledge; UNKNOWN — requires verification against the
   actual installed package-lock.json resolution (could be a private/scoped fork, a typo'd
   version range, or knowledge-cutoff mismatch — flagged rather than assumed).
```

---

## 14. Performance Analysis

| Finding | Classification | Evidence |
|---|---|---|
| Client-side FSG replay refetches and iterates every future transaction for a (product, godown) pair on every edit/void | **HIGH** | `stockService.js` — `runFSG`, `getAffectedTransactionsImpact` fetch full row sets, no pagination/limit |
| Dashboard aggregation issues 5 parallel full-table-ish queries per page load, then builds per-product×per-godown maps in JS | **MEDIUM** | `dashboardService.js:18-47, 123-168` — bounded by date filters but not by result size; fine at current data volume, will degrade as `transactions` grows since several queries have no upper date bound (`lte('txn_date', prevDateStr)` scans all history before that date) |
| No pagination on most list-fetch service functions (`getAllOrders`, `getAllIndents`, `getAllTransactions`, `getAllDispatchPlans`, etc.) — all rows fetched, then paginated client-side in the page component | **HIGH** (scales badly) | Confirmed pattern across `salesService.js`, `purchaseService.js`, `stockService.js`; only `dashboardService.getDashboardData` implements server-side `range()` pagination |
| No `React.lazy`/code-splitting — every page bundled into one chunk | **MEDIUM** | `App.jsx` imports all 8 page components eagerly |
| Duplicate business-logic constant (`inbound txn_type` list) hand-copied across 5+ files | **LOW** (correctness risk more than perf) | see §9.2 |
| Sequential `await` chains inside loops in bulk-import functions (`bulkImportProducts`, `stockService`'s per-row insert loops) | **MEDIUM** | `masterService.js:222-247` loops `for (const row of uniqueProducts)` with an `await` insert per iteration — N sequential round-trips instead of one batched insert |
| `bulkDispatchStock` correctly chunks inserts at 1000 rows | **Good practice, no issue** | `stockService.js:693-701` |
| Realtime channel is per-Sidebar-mount, not leaked (see §11) | **Good practice, no issue** | |

---

## 15. Code Quality Analysis

- **Business logic embedded in "generic" UI component**: `DataTable.jsx` special-cases `item.orderType` for row highlighting (§3.3) — couples a shared component to the Sales domain.
- **Massive duplication of the inbound/outbound transaction-type classification** across `masterService.js`, `stockService.js` (×4), `dashboardService.js` (×3) — a single misspelling or missed update when adding a new `txn_type` will silently corrupt balance calculations in whichever copy is missed. **RECOMMENDATION: extract to a single shared `src/constants/transactionTypes.js` and import everywhere**, or better, compute via the `godown_stock` view/DB function so client code never needs the classification at all.
- **Large "God" page components**: Master.jsx (459 lines, 20+ useState calls), Sales.jsx (378 lines), Header.jsx (284 lines with large stubbed-out notification logic) mix data-fetching, filtering, pagination, and modal-orchestration in one file each.
- **Dead code**: `vite.config.ts` (superseded by `.js`), Sidebar's dropdown-menu branch (unreachable given current `PAGES` shape), `Layout.jsx`'s `isFixedPage` (hardcoded `false`), `Login.jsx`'s `hasSeenLanguageHint` localStorage clear (nothing reads that key), large commented-out/disabled notification-fetch logic in `Header.jsx` (`// Notifications table missing, disabling fetch for now`).
- **Dev-only utility shipped in production module**: `salesService.deleteOrder` (§6.1).
- **Inconsistent numbering-race handling**: retry-on-conflict implemented only for dispatch numbers, not order/indent/lifting numbers (§7).
- **No error boundary** anywhere in the React tree.
- **Manual, duplicated validation** in every modal/service pair instead of a shared schema (no zod/yup) — e.g. "quantity must be a positive whole number" is re-implemented near-identically in `addFactoryStock`, `transferStock`, `dispatchStock`, `bulkDispatchStock`, `editTransaction`, `editTransfer` (all in `stockService.js`).
- **Two sources of truth for the logged-in user** (`localStorage['user']` vs. Zustand-persisted store) — see §3.4, §9.1 (logout bug).
- **Loading/empty/error states**: present and reasonably consistent in the pages read (Settings.jsx shows explicit loading spinner, empty state, and search-aware empty message — a good pattern to replicate); error states are uniformly "toast.error(err.message)" with no retry affordance or inline field-level error display.
- **TypeScript usage**: the project is nearly all `.jsx`/`.js` despite `typescript-eslint` being a devDependency and one `.ts` file (`vite.config.ts`, unused) and one `.ts` Edge Function existing. TypeScript is not meaningfully adopted — it's present only where Deno/Supabase Functions default to `.ts`.

---

## 16. Authentication & Authorization — Summary

```text
Provider: Custom (NOT Supabase Auth) — a `users` table queried directly with the anon key
Session handling: Zustand `persist` middleware → localStorage['vpr-systems']; no token, no
   expiry, no server-side session record. A "session" is simply "the store has a truthy user
   object."
Login flow: see §9.1
Logout flow: see §9.1 — BUGGED, does not clear the Zustand-persisted session (§9.1)
Refresh behavior: N/A — nothing to refresh; the app never revalidates the stored user against
   the database (e.g. to catch is_active being flipped to false, or role/page_access changes)
   EXCEPT via the one Realtime subscription in Sidebar, which only fires on an UPDATE to that
   user's own row — a DELETE of the user row, or is_active flip if that isn't part of the
   watched columns... actually is_active IS part of `users`, so it WOULD trigger the same
   postgres_changes UPDATE event and get merged into the store via the spread (`...newData`).
   But nothing in Sidebar's handler currently forces a logout/redirect if `is_active` becomes
   false or `page_access` becomes empty — the user stays on their current page until their next
   navigation, at which point ProtectedRoute would evaluate the now-updated (but not
   re-fetched-from-guard, just live-patched) `page_access`.
Protected routes: single ProtectedRoute wrapper around the whole authenticated app tree
   (App.jsx:23-27), not per-route
Role resolution: `users.role` free-text column; USER_ROLES constant (`SUPER ADMIN`, `ADMIN`,
   `USER`) is a UI suggestion list only — nothing in the database enforces role to be one of
   these three values, and no route/component gates on role directly (see §3.2)
Permission resolution: `users.page_access` (text[]) and `users.tab_access` (jsonb) — arbitrary
   editable arrays with no relationship to role; an "ADMIN" and a "USER" are functionally
   identical in terms of what the frontend allows except for whatever page_access array an
   admin manually assigned them in Settings
RLS relationship to frontend authorization: NONE VERIFIED — see §6. The frontend's page_access/
   tab_access checks are, as far as this repository shows, the ONLY authorization boundary in
   the entire system.
```

```text
Authentication flow (as implemented):
User
 ↓ submits username+password
Login.jsx → authService.loginUser()
 ↓
supabase.from('users').select('*').eq('username',...).single()   [anon key — no auth boundary]
 ↓ (client-side string comparison)
Zustand authStore.login(user)  +  localStorage['user'] (duplicate)
 ↓
Navigate to /live-stock-dashboard
 ↓
ProtectedRoute reads authStore.user.page_access → allow/redirect
 ↓
Sidebar filters menu items by the same page_access array
 ↓
Database RLS: UNKNOWN — not verified to exist; if absent/permissive, this entire flow above is
  advisory only, and any anon-key holder can bypass it completely via direct REST calls.
```

---

## 17. Deployment

- **Target**: Vercel (`vercel.json` present, single SPA rewrite rule `"/(.*)" → "/index.html"` — standard client-side-routing catch-all).
- **Build**: `vite build` (from `package.json` scripts), output presumably `dist/` (Vite default, gitignored).
- **Environment variables**: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` must be configured in Vercel's project environment settings — `UNKNOWN — requires Vercel dashboard inspection` whether they currently are; not verifiable from this repo.
- **Database migrations**: no CI/CD step or script exists in this repo to apply `supabase/migrations/*.sql` to any environment (no `supabase db push`/`supabase migration up` invocation found in any script or workflow file; no `.github/workflows` directory exists at all). Migrations appear to be applied manually.
- **Edge Function deployment**: no deployment script/workflow found either; `supabase functions deploy send-whatsapp` is presumably run manually per the comment style in the function file.
- **No CI**: no `.github/`, no test runner configured (`package.json` has no `test` script; no test files found anywhere in `src/`).

---

## 18. Security Findings Summary (Ranked)

### Critical
1. **Custom auth exposes plaintext-comparable passwords to the client for any queryable username**, with credential verification happening in browser JS rather than server-side (§6.1, §9.1). *File: `src/services/authService.js:3-16`.*
2. **No verified RLS enforcement on any table** — the entire authorization model may be UI-only (§6.1). *Evidence: absence, across whole repo.*

### High
3. **Logout does not clear the persisted session store**, potentially allowing a deactivated/permission-revoked user's browser to retain elevated access after a reload (§9.1, §16). *File: `src/components/Sidebar.jsx:80-83`.*
4. **`send-whatsapp` Edge Function has no caller-authorization check and wide-open CORS**, risking abuse of the business's WhatsApp messaging budget/reputation if the function URL leaks (§6.1). *File: `supabase/functions/send-whatsapp/index.ts:11-14`.*

### Medium
5. Sequential document-numbering race conditions on order/indent/lifting numbers (only dispatch numbers have a retry guard) (§7).
6. Dev-only hard-delete function (`deleteOrder`) shipped without an environment/role guard (§6.1). *File: `src/services/salesService.js:602-648`.*
7. Profile-picture upload has no client-side file-type/size validation before hitting Storage (§10). *File: `src/services/storageService.js`.*

### Low
8. `godown_stock` view definition lives entirely outside version control (§5.2) — not itself a vulnerability, but a governance/auditability gap for the most business-critical read path.
9. Stale/incomplete `supabaseSCHEMA.sql` (missing `brand_name`/`category`/`mux` columns actually used by `masterService.js`) means anyone using this file to reason about the schema will be misled (§5.1).

---

## 19. Technical Debt Inventory

| Issue | Location | Severity | Impact | Recommended Action |
|---|---|---|---|---|
| No RLS / no verified DB-level authorization | Entire Supabase project | Critical | Complete authorization bypass possible via direct REST calls | Phase 1 of roadmap — audit & implement RLS |
| Custom plaintext-comparable auth | `authService.js` | Critical | Credential/PII exposure | Migrate to Supabase Auth |
| Duplicated transaction-type classification (5+ copies) | `masterService.js`, `stockService.js`, `dashboardService.js` | Medium | Silent balance-calculation bugs on new txn types | Extract shared constant or move to DB view/function |
| `godown_stock` view not in version control | Supabase project (external to repo) | Medium | No auditability, no rollback path, no local dev parity | Reverse-engineer and commit as a migration |
| No pagination on most list services | `salesService.js`, `purchaseService.js`, `stockService.js` | High (growing) | Will degrade with data growth | Add server-side pagination (`range()`) uniformly |
| Two duplicate "current user" stores | `authStore.js` vs raw `localStorage['user']` | Medium | Logout bug, permission-drift risk | Consolidate to one source of truth |
| Three charting libs, two icon libs, two component-UI systems | `package.json` | Low–Medium | Bundle bloat, inconsistent UX, onboarding confusion | Pick one of each, remove the rest |
| No tests, no CI | whole repo | High (process debt) | No regression safety net for a financial/inventory system | Introduce test suite + CI before further feature work |
| No error boundaries | React tree | Medium | Any render error white-screens the app | Add boundary around `<Outlet/>` at minimum |
| Manual, duplicated validation logic | every service/modal pair | Medium | Inconsistent rules, hard to change centrally | Introduce zod schemas shared between form and service layer |
| Race conditions on 3 of 4 numbering sequences | `salesService.js`, `purchaseService.js` | Medium | Rare but real unique-constraint failures under concurrent use | Apply the same retry pattern already used for dispatch numbers, or move to DB sequences |
| Dead files/config (`vite.config.ts`, unreachable Sidebar branch, stubbed Header notifications) | various | Low | Confuses future maintainers about what's live | Remove in a cleanup pass |
| Stale schema reference file | `supabaseSCHEMA.sql` | Low | Misleads anyone trusting it as current | Regenerate from live DB regularly or automate via CI |

---

## 20. Re-Engineering Recommendations

```text
CURRENT ARCHITECTURE
   React SPA (Vite) → Supabase JS client (anon key) → PostgREST → Postgres
   Custom table-based auth, no RLS verified, all business logic client-side
        ↓
PROBLEMS
   Authorization exists only in the browser · credential handling unsafe ·
   ledger simulation logic duplicated and runs client-side at growing cost ·
   no test/CI safety net for a financial-adjacent system
        ↓
TARGET ARCHITECTURE (see §21 diagram)
   Same overall shape (React + Supabase is a reasonable fit for this app's scale) BUT:
   - Supabase Auth for identity, RLS for every table, policies mirroring page_access/tab_access
   - Stock-balance and numbering logic moved into Postgres (views/functions/sequences) so the
     database is the single source of truth for "current stock," not a client-computed reducer
   - A thin typed data-access layer (keep the existing services/ convention — it's good — but
     add input validation schemas and typed return shapes)
        ↓
MIGRATION STRATEGY
   Phased, security-first, no functional rewrite required (see §22 roadmap)
```

**Priority order** (per the mandated hierarchy — security, data integrity, reliability, maintainability, performance, DX, UI/UX):

**Must Fix**
- Enable and correctly configure RLS on every table; verify with a re-audit before any other refactor ships.
- Replace client-side plaintext password comparison with Supabase Auth (or, as an interim step, a server-side (Edge Function / RPC) credential check that never returns `password_hash` to the client).
- Fix the logout bug (call `authStore.logout()`).
- Lock down the `send-whatsapp` Edge Function (authz check + origin-restricted CORS).

**Should Fix**
- Commit the `godown_stock` view definition (and any other undocumented DB objects) into version control.
- Deduplicate the transaction-type classification into one shared source (ideally the database, via a function/view).
- Add server-side pagination to all list-fetch services.
- Consolidate the two "current user" storage locations into one.
- Fix the numbering-race conditions consistently (all four sequences, not just one).
- Remove the dev-only `deleteOrder` export or gate it properly.

**Could Improve**
- Introduce a shared validation layer (zod) reused by both modals and services.
- Break up the largest page components (Master.jsx, Sales.jsx) into smaller feature-scoped hooks/components.
- Add code-splitting (`React.lazy`) per route.
- Add an application-level error boundary.

**Optional**
- Consolidate the redundant chart/icon/UI-kit dependencies.
- Regenerate `supabaseSCHEMA.sql` automatically (e.g. via a CI job running `supabase db dump`) instead of by hand.
- Remove confirmed-dead files (`vite.config.ts`, unreachable Sidebar branch, stubbed Header code) once each is independently verified unused.

---

## 21. Target Architecture

```text
React UI (pages)
   ↓
Feature components (existing page-local components/ folders — keep this convention)
   ↓
services/*.js  (existing convention — keep; add: typed inputs, zod-validated payloads)
   ↓
Supabase JS client
   ↓
   ├── supabase.auth  →  Supabase Auth (NEW — replaces custom users-table login)
   ├── supabase.from() → PostgREST → Postgres tables, GATED BY RLS (NEW — currently unverified)
   ├── supabase.rpc()  → Postgres functions (NEW — sequence generation, stock-balance
   │                      validation/simulation moved server-side, replacing client `runFSG`)
   └── supabase.functions.invoke() → Edge Functions (existing WhatsApp proxy, hardened with
                                       an authorization check)
   ↓
PostgreSQL
   - `godown_stock` and any other views committed as migrations
   - RLS policies mirroring/enforcing page_access & tab_access (or migrated to a role-claims
     model once Supabase Auth is adopted)
   - Sequences/functions for document numbering (eliminates the race conditions in §7)
```
This does **not** require abandoning Supabase or the current React structure — the existing `services/` layer separation is a solid foundation and should be preserved, not replaced with a different architectural paradigm (e.g. a separate backend server is not necessary; Supabase already provides the pieces needed — Auth, RLS, RPC — that this codebase simply hasn't adopted yet).

---

## 22. Migration / Re-Engineering Roadmap

```text
Phase 0 — Documentation (this document)
  Objective: Establish ground truth before any change
  Risk: None
  Result: CODEBASE_ARCHITECTURE.md (this file)

Phase 1 — Security
  Objective: Close the Critical/High findings in §18
  Affected: authService.js, Sidebar.jsx (logout), send-whatsapp Edge Function, Supabase RLS config
  DB changes: Enable RLS on all tables; add policies; (recommended) begin Supabase Auth migration
  Risk: Medium-High — incorrect RLS policies can lock legitimate users out; requires careful
    staged rollout (start with permissive-but-logged policies, tighten iteratively) and thorough
    testing against every service function's exact query shape documented in §9
  Dependencies: None — should start immediately, independent of other phases
  Expected result: Database becomes the real authorization boundary; credentials no longer
    travel to the browser in cleartext-comparable form

Phase 2 — Database Stabilization
  Objective: Bring undocumented DB objects (godown_stock, any others discovered) under version
    control; move document-numbering and stock-balance-validation logic into Postgres
  Affected: supabase/migrations/ (new files), stockService.js, salesService.js,
    purchaseService.js (numbering functions), masterService.js (duplicate-check logic)
  DB changes: New migrations for godown_stock view, numbering sequences/functions,
    stock-validation RPC
  Risk: Medium — requires exact behavioral parity with the current JS logic (esp. `runFSG`'s
    replay semantics) to avoid silently changing historical balance calculations
  Dependencies: Phase 1 (RLS must already treat the new RPC functions correctly, e.g.
    SECURITY DEFINER where needed)
  Expected result: Single source of truth for stock balances and document numbers; race
    conditions eliminated

Phase 3 — Data Access Refactor
  Objective: Consolidate auth state (remove duplicate localStorage['user']), add shared
    validation schemas, add server-side pagination to list services
  Affected: authStore.js, services/*.js (pagination signatures), all *Modal.jsx form components
  DB changes: None
  Risk: Low-Medium — pagination signature changes require updating every page that calls
    the affected getAll* functions
  Dependencies: None blocking, but easier after Phase 2 stabilizes service return shapes

Phase 4 — Frontend Architecture
  Objective: Break up God components (Master.jsx, Sales.jsx), introduce React error boundaries,
    add code-splitting
  Affected: pages/Master, pages/Sales, App.jsx
  Risk: Low — mostly mechanical extraction, testable via manual QA of each tab
  Dependencies: None

Phase 5 — UI/UX
  Objective: Address inconsistent tab-state URL-sync (Master vs Sales/Purchase), standardize
    loading/empty/error states across all pages using Settings.jsx's pattern as the template
  Risk: Low
  Dependencies: Phase 4 makes this easier but doesn't block it

Phase 6 — Performance
  Objective: Verify and tune query patterns at real data volumes (esp. dashboard aggregations
    and FSG replay) once Phase 2's server-side stock functions are in place
  Risk: Low — mostly measurement-driven at this point
  Dependencies: Phase 2

Phase 7 — Testing
  Objective: Introduce a test suite (unit tests for service logic — esp. the numbering and
    balance functions being moved in Phase 2 — plus at least smoke E2E coverage of the core
    Sales/Purchase/Stock workflows documented in §9)
  Risk: None (additive)
  Dependencies: Ideally alongside Phase 2, so the moved logic is tested both before and after
    migration to Postgres

Phase 8 — Deployment
  Objective: Add CI (lint + test + build on PR), automate migration application, add a
    committed .env.example
  Risk: Low
  Dependencies: Phase 7 (need tests for CI to run)
```

---

## 23. Final System Summary

### Current Architecture
A Vite/React SPA that talks directly to Supabase (Postgres + PostgREST + one Edge Function) using only the public anon key, with a custom (non-Supabase-Auth) username/password login table and a consistent `page → service → supabase.from()` data-access convention. All business logic — stock-balance simulation, document numbering, duplicate detection — runs client-side in JavaScript rather than in the database.

### Major Features
- Multi-godown stock ledger with opening stock, factory-in, transfers, dispatch-out, purchase-in, adjustments, and void/edit-with-replay-validation.
- Sales order → dispatch planning → dispatch execution → WhatsApp customer notification pipeline, with partial dispatch and cancellation support.
- Purchase indent → vendor selection → vendor approval → multi-godown delivery receipt pipeline, plus a "direct purchase" fast path.
- Master data management for products, godowns, customers, vendors, transporters, and product groupings (with bulk Excel-style import for several entities).
- Per-user page-level and tab-level access control (`page_access`, `tab_access`), live-synced via one Realtime subscription.
- Live Stock Dashboard with per-product/per-godown opening/in/out/closing figures and export.
- User self-service profile management with profile-picture upload to Supabase Storage.

### Database
Core tables: `users`, `products`, `godowns`, `transactions` (the ledger), `customers`, `vendors`, `transporters`, `product_groups`/`product_group_members`, `sales_orders`/`sales_order_items`/`dispatch_plans`, `purchase_indents`/`purchase_indent_items`/`purchase_deliveries`/`purchase_delivery_godowns`, and an apparently-orphaned `daily_snapshots`. One known view, `godown_stock`, is undocumented in this repository. No triggers, RPC functions, or RLS policies were found anywhere in the repo — all `UNKNOWN — requires Supabase schema inspection` if they exist only in the live project.

### Authentication
Fully custom, table-based, client-side-compared credentials — not Supabase Auth. No RLS was found to gate any of it. This is the most significant architectural risk in the system (§6, §16, §18).

### Critical Risks (Top 10)
1. Plaintext-comparable password auth queried with the public anon key (§6.1, §18#1).
2. No verified RLS on any table — authorization may be entirely client-side (§6.1, §18#2).
3. Logout does not clear the persisted auth store (§9.1, §18#3).
4. Unauthenticated/uncontrolled access to the WhatsApp-sending Edge Function (§6.1, §18#4).
5. Undocumented `godown_stock` view — the business's most-relied-on read path lives outside version control (§5.2, §18#8).
6. Numbering race conditions on 3 of 4 document sequences (§7, §18#5).
7. Dev-only hard-delete function shipped in production code (§6.1, §18#6).
8. No automated tests for financial/inventory-affecting logic (stock replay, cancellation cascades) (§19).
9. No CI/deployment automation — migrations and function deploys are manual (§17).
10. Client-side-only, unbounded list fetching that will degrade as `transactions`/`sales_orders`/`purchase_indents` grow (§14).

### Technical Debt (Top 10)
See §19 table in full; highest-impact items are the duplicated transaction-type classification (§9.2, §15), the two competing "current user" stores (§3.4, §16), the lack of server-side pagination (§14), and the three-charting/two-icon/two-UI-kit dependency sprawl (§13).

### Recommended Next Steps (priority order)
1. Live-inspect the Supabase project directly (RLS status per table, `godown_stock` definition, any RPC/triggers) to convert every `UNKNOWN` in this document into a verified fact — this document's Phase 0 is complete for the *repository*, but a full picture requires DB-side inspection this repo cannot provide.
2. Execute Phase 1 (Security) from §22 — RLS + auth hardening — before any feature work continues.
3. Execute Phase 2 (Database Stabilization) — commit `godown_stock`, move numbering/balance logic server-side.
4. Proceed through Phases 3–8 as scheduled, using this document as the shared reference for what currently exists versus what's proposed.

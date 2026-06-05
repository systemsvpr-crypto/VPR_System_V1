# Inventory Management System — Rules & Formulas Reference

> **Scope**: Multi-godown, multi-product inventory system with daily transactions,
> historical edits, opening stock management, and audit-safe recalculation.
> Every formula and rule in this document is derived from the ledger-based
> (append-only) architecture. Do not deviate from these rules without
> understanding the cascading consequences described in each section.

---

## Table of Contents

1. [Core Architecture Principles](#1-core-architecture-principles)
2. [Data Model & Field Definitions](#2-data-model--field-definitions)
3. [Opening Stock Rules](#3-opening-stock-rules)
4. [Stock-In Formulas](#4-stock-in-formulas)
5. [Stock-Out Formulas](#5-stock-out-formulas)
6. [Godown Transfer Rules](#6-godown-transfer-rules)
7. [Running Balance Formula](#7-running-balance-formula)
8. [Current Stock Formula (Live View)](#8-current-stock-formula-live-view)
9. [Edit & Void Rules](#9-edit--void-rules)
10. [Forward Simulation Guard (Recalculation Engine)](#10-forward-simulation-guard-recalculation-engine)
11. [Negative Stock Scenarios & Handling](#11-negative-stock-scenarios--handling)
12. [Back-Dated Entry Rules](#12-back-dated-entry-rules)
13. [New Product Mid-Year Addition](#13-new-product-mid-year-addition)
14. [Daily Snapshot Rules](#14-daily-snapshot-rules)
15. [Godown-Level Stock Isolation](#15-godown-level-stock-isolation)
16. [Company-Level (Cross-Godown) Stock Formula](#16-company-level-cross-godown-stock-formula)
17. [Audit Trail Rules](#17-audit-trail-rules)
18. [Transaction Ordering Rules](#18-transaction-ordering-rules)
19. [Recalculation After Snapshot Invalidation](#19-recalculation-after-snapshot-invalidation)
20. [Edge Case Decision Matrix](#20-edge-case-decision-matrix)
21. [Database Constraints Checklist](#21-database-constraints-checklist)
22. [Application-Layer Validation Checklist](#22-application-layer-validation-checklist)
23. [Error Messages Reference](#23-error-messages-reference)

---

## 1. Core Architecture Principles

### P-01 — Append-Only Ledger
The `transactions` table is append-only. No row is ever physically deleted or
updated after it is committed. Every correction is a new row.

```
RULE: UPDATE transactions SET ... → FORBIDDEN
RULE: DELETE FROM transactions WHERE ... → FORBIDDEN
RULE: Corrections = void old row + insert new row
```

### P-02 — No Stored Running Balance
Running balances are never stored as a column in the transactions table.
They are always computed on demand from the raw ledger rows.

```
RULE: transactions.running_balance column → DO NOT CREATE
RULE: Current stock = SUM of qualified rows (see Formula C-01)
```

### P-03 — Single Source of Truth
The `transactions` table is the only source of truth for stock levels.
The `godown_stock` view and `daily_snapshots` table are derived — they are
never updated directly.

```
RULE: godown_stock is a VIEW, not a TABLE
RULE: daily_snapshots is populated only by the nightly snapshot job
RULE: Never manually INSERT into daily_snapshots
```

### P-04 — Atomic Pairs
Transfers between godowns and void+correction operations must always be
committed in a single database transaction. Partial commits are not allowed.

```
RULE: BEGIN TRANSACTION → [all paired inserts] → COMMIT
RULE: Any failure inside the transaction → ROLLBACK everything
```

### P-05 — Guard Before Every Write
The forward simulation guard (Section 10) runs before every transaction that
could reduce stock: OUT entries, TRANSFER_OUT entries, and edits that reduce qty.

---

## 2. Data Model & Field Definitions

### 2.1 `products` table

| Column | Type | Rule |
|---|---|---|
| product_id | UUID / INT PK | Immutable after creation |
| name | VARCHAR | Required |
| unit | VARCHAR | e.g. kg, pcs, ltr |
| allow_negative_stock | BOOLEAN | Default FALSE |
| created_at | TIMESTAMP | Set on insert, never changed |

### 2.2 `godowns` table

| Column | Type | Rule |
|---|---|---|
| godown_id | UUID / INT PK | Immutable |
| name | VARCHAR | Required |
| is_active | BOOLEAN | Inactive godowns reject new txns |

### 2.3 `transactions` table (ledger)

| Column | Type | Rule |
|---|---|---|
| txn_id | UUID / INT PK | Auto-generated, immutable |
| product_id | FK → products | Required |
| godown_id | FK → godowns | Required |
| txn_date | DATE | The business date of the movement |
| txn_type | ENUM | See Section 2.4 |
| qty | INTEGER | Always non-negative, whole number only |
| is_void | BOOLEAN | Default FALSE. Set TRUE to cancel. |
| void_reason | VARCHAR | Required when is_void = TRUE |
| ref_txn_id | FK → transactions | Points to original row when this is a correction |
| pair_id | UUID | Links TRANSFER_OUT ↔ TRANSFER_IN |
| created_at | TIMESTAMP | Server time of insert. Never changed. |
| created_by | FK → users | Audit trail |
| back_dated | BOOLEAN | TRUE if txn_date < DATE(created_at) |

### 2.4 `txn_type` enum values

| Value | Meaning | Effect on stock |
|---|---|---|
| OPEN_STOCK | Opening balance for a product in a godown | +qty |
| IN_FACTORY | Stock received from factory/supplier | +qty |
| TRANSFER_IN | Stock received from another godown | +qty |
| TRANSFER_OUT | Stock sent to another godown | −qty |
| OUT_GODOWN | Stock dispatched to customer / used | −qty |
| ADJUSTMENT_IN | Manual positive adjustment (verified variance) | +qty |
| ADJUSTMENT_OUT | Manual negative adjustment (verified variance) | −qty |

### 2.5 `daily_snapshots` table

| Column | Type | Rule |
|---|---|---|
| snapshot_date | DATE | The business date |
| product_id | FK | |
| godown_id | FK | |
| closing_stock | INTEGER | Stock at end of snapshot_date |
| created_at | TIMESTAMP | When the snapshot job ran |

### 2.6 `godown_stock` view (never a table)

```sql
CREATE OR REPLACE VIEW godown_stock AS
SELECT
    product_id,
    godown_id,
    SUM(
        CASE
            WHEN txn_type IN ('OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN')
            THEN qty
            ELSE -qty
        END
    ) AS current_stock
FROM transactions
WHERE is_void = FALSE
GROUP BY product_id, godown_id;
```

---

## 3. Opening Stock Rules

### OS-01 — Auto-Insert on Product Save
When a new product is saved in the product master, the application must
automatically insert one OPEN_STOCK transaction row for each godown that
has an initial quantity.

```
Formula:
  opening_txn.txn_type   = 'OPEN_STOCK'
  opening_txn.qty        = product_master.current_stock_for_godown_X
  opening_txn.txn_date   = product_master.as_of_date (default = today)
  opening_txn.godown_id  = godown_X
  opening_txn.is_void    = FALSE
  opening_txn.ref_txn_id = NULL
```

### OS-02 — One OPEN_STOCK Per Product Per Godown
At any time, there must be exactly one non-voided OPEN_STOCK row per
(product_id, godown_id) combination.

```sql
-- Enforce with a partial unique index:
CREATE UNIQUE INDEX ux_one_opening_per_godown
    ON transactions (product_id, godown_id)
    WHERE txn_type = 'OPEN_STOCK' AND is_void = FALSE;
```

### OS-03 — Distributed Opening Stock
If a product starts in multiple godowns, insert one OPEN_STOCK row per godown.
Never use TRANSFER rows to distribute opening stock — transfers imply movement,
which did not happen.

```
Example: Product "Widget A", total opening = 150
  INSERT OPEN_STOCK: godown_id=G1, qty=80
  INSERT OPEN_STOCK: godown_id=G2, qty=40
  INSERT OPEN_STOCK: godown_id=G3, qty=30
  Total = 150. Each godown independently correct.
```

### OS-04 — Correcting Opening Stock
To change an opening stock entry, use the standard void-and-reissue pattern.
Do not directly update the original OPEN_STOCK row.

```
Step 1: SET is_void=TRUE, void_reason='Opening stock correction' on old OPEN_STOCK row
Step 2: INSERT new OPEN_STOCK row with corrected qty, ref_txn_id = old row's txn_id
Step 3: Run forward simulation guard from opening_date to today
Step 4: If guard passes → COMMIT. If guard fails → ROLLBACK with error message.
```

### OS-05 — Go-Live Date Rule (Migration)
When adding a product that physically existed before software go-live:
- Set txn_date = go-live date (not the product's real origin date)
- qty = physical count on go-live date
- No transactions should be back-dated before the OPEN_STOCK date

```
RULE: MIN(txn_date) for any product ≥ its OPEN_STOCK txn_date
```

---

## 4. Stock-In Formulas

### SI-01 — Factory Receipt

```
Pre-condition : godown is active
               product exists
               qty > 0
               txn_date ≤ today

On commit:
  INSERT INTO transactions (
    product_id, godown_id, txn_date, txn_type, qty, is_void, back_dated
  ) VALUES (
    :product_id, :godown_id, :txn_date, 'IN_FACTORY', :qty, FALSE,
    CASE WHEN :txn_date < CURRENT_DATE THEN TRUE ELSE FALSE END
  )

Effect on godown_stock:
  godown_stock[product_id][godown_id] += qty
```

### SI-02 — Adjustment In (variance correction)

```
Pre-condition : Requires manager approval flag
               Must include a reason

INSERT txn_type = 'ADJUSTMENT_IN', qty = :adjustment_qty
Effect: godown_stock[product_id][godown_id] += adjustment_qty
```

---

## 5. Stock-Out Formulas

### SO-01 — Dispatch to Customer / Consumption

```
Pre-condition check (run BEFORE insert):
  available = godown_stock[product_id][godown_id]   -- from view
  IF (available - qty) < 0 AND allow_negative_stock = FALSE:
      → BLOCK. Return error SO-ERR-01.
  IF (available - qty) < 0 AND allow_negative_stock = TRUE:
      → ALLOW with warning flag.

On commit:
  INSERT txn_type = 'OUT_GODOWN', qty = :qty
  
Effect: godown_stock[product_id][godown_id] -= qty
```

### SO-02 — Quantity Validation

```
qty must be > 0                    → else reject: "Qty must be greater than zero"
qty must be ≤ 9,999,999            → configurable upper sanity limit
qty must be a whole number (integer)  → no decimal places allowed
```

---

## 6. Godown Transfer Rules

### GT-01 — Transfer is Always a Paired Insert

```
A transfer from Godown A to Godown B = exactly two rows inserted atomically:

Row 1 (debit from source):
  txn_type = 'TRANSFER_OUT'
  godown_id = A
  qty = :transfer_qty
  pair_id = :new_uuid

Row 2 (credit to destination):
  txn_type = 'TRANSFER_IN'
  godown_id = B
  qty = :transfer_qty          ← same qty as Row 1
  pair_id = :same_uuid         ← same pair_id as Row 1

Both rows: same product_id, same txn_date, same created_at (within same DB txn)
```

### GT-02 — Transfer Pre-Condition Check

```
Before inserting the pair:
  source_stock = godown_stock[product_id][godown_A]
  IF (source_stock - transfer_qty) < 0:
      → BLOCK. Return error GT-ERR-01.
```

### GT-03 — Net Effect on Company Stock

```
Company-level stock before transfer = S
After transfer:
  godown_A stock = godown_A_stock - transfer_qty
  godown_B stock = godown_B_stock + transfer_qty
  Company-level total = S   ← unchanged. Transfers never change total.
```

### GT-04 — Transfer Voiding

```
To void a transfer, both rows in the pair must be voided together atomically:
  SET is_void=TRUE on TRANSFER_OUT row (pair_id = X)
  SET is_void=TRUE on TRANSFER_IN  row (pair_id = X)
  Run forward simulation guard on BOTH godowns from txn_date forward.
  If either guard fails → ROLLBACK both voids.
```

---

## 7. Running Balance Formula

The running balance for a product in a godown up to a given date is:

### RB-01 — Point-in-Time Balance Formula

```
Balance(product_id, godown_id, as_of_date) =

  SUM of all non-voided rows where:
    product_id = :product_id
    godown_id  = :godown_id
    txn_date   ≤ :as_of_date

  For each qualifying row:
    IF txn_type IN ('OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'):
        contribution = +qty
    IF txn_type IN ('OUT_GODOWN','TRANSFER_OUT','ADJUSTMENT_OUT'):
        contribution = -qty

  Balance = SUM(all contributions)
```

### RB-02 — SQL Implementation

```sql
SELECT
    SUM(
        CASE
            WHEN txn_type IN ('OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN')
            THEN qty
            ELSE -qty
        END
    ) AS balance_as_of_date
FROM transactions
WHERE product_id  = :product_id
  AND godown_id   = :godown_id
  AND txn_date    <= :as_of_date
  AND is_void     = FALSE;
```

### RB-03 — Row-by-Row Running Balance (for ledger display)

```sql
SELECT
    txn_date,
    txn_id,
    txn_type,
    qty,
    SUM(
        CASE
            WHEN txn_type IN ('OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN')
            THEN qty ELSE -qty
        END
    ) OVER (
        PARTITION BY product_id, godown_id
        ORDER BY txn_date ASC, created_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance
FROM transactions
WHERE product_id = :product_id
  AND godown_id  = :godown_id
  AND is_void    = FALSE
ORDER BY txn_date ASC, created_at ASC;
```

---

## 8. Current Stock Formula (Live View)

### CS-01 — Live Current Stock for One Product in One Godown

```
current_stock(product_id, godown_id) =
    SUM(IN-type qty) - SUM(OUT-type qty)
    WHERE is_void = FALSE
    [no date filter — all history included]
```

### CS-02 — Current Stock Across All Godowns for a Product

```
total_current_stock(product_id) =
    SUM over all godowns of: current_stock(product_id, godown_id)

Equivalently:
    SELECT SUM(CASE WHEN txn_type IN ('OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN')
                    THEN qty ELSE -qty END)
    FROM transactions
    WHERE product_id = :product_id AND is_void = FALSE;

NOTE: TRANSFER_IN and TRANSFER_OUT cancel each other in this sum.
      Transfers do not appear in the company-level total.
```

### CS-03 — Stock as of a Specific Date (Historical)

```
Use Formula RB-01 with as_of_date = the required historical date.
If a daily_snapshot exists for that date, use it for performance:

    SELECT closing_stock
    FROM daily_snapshots
    WHERE product_id   = :product_id
      AND godown_id    = :godown_id
      AND snapshot_date = :required_date;

If no snapshot exists for that date, fall back to RB-02.
```

---

## 9. Edit & Void Rules

### EV-01 — The Void-and-Reissue Pattern

No row is ever directly updated. Every edit follows this exact pattern:

```
Step 1 — Void the original row:
    UPDATE transactions
    SET is_void = TRUE,
        void_reason = :reason
    WHERE txn_id = :original_txn_id;

Step 2 — Insert the correction row:
    INSERT INTO transactions (
        product_id, godown_id, txn_date, txn_type,
        qty, is_void, ref_txn_id, back_dated
    ) VALUES (
        :same_product_id, :same_or_corrected_godown_id,
        :same_or_corrected_txn_date, :same_or_corrected_txn_type,
        :corrected_qty, FALSE, :original_txn_id, ...
    );

Step 3 — Run forward simulation guard (Section 10).
Step 4 — If guard passes: COMMIT. If guard fails: ROLLBACK both steps.
```

### EV-02 — What Can Be Edited

| Field | Editable? | How |
|---|---|---|
| qty | Yes | Void + reissue |
| txn_date | Yes | Void + reissue with new date |
| txn_type | Yes (with caution) | Void + reissue |
| godown_id | Yes | Void + reissue; guard runs on both godowns |
| product_id | No | Create a new transaction; the old one was for a different product |
| is_void | Set to TRUE only | Never set back to FALSE |

### EV-03 — Editing a Transfer (paired rows)

```
To edit a transfer, void both legs atomically:
    Void TRANSFER_OUT (pair_id = X)
    Void TRANSFER_IN  (pair_id = X)
    Insert corrected TRANSFER_OUT (new pair_id = Y, ref_txn_id = old OUT id)
    Insert corrected TRANSFER_IN  (pair_id = Y, ref_txn_id = old IN id)
    Run forward simulation guard on both godown_A and godown_B from txn_date.
```

### EV-04 — Voiding Without Replacement
A transaction may be voided with no replacement row (i.e. the entry was entirely
wrong and should not exist at all).

```
Step 1: SET is_void=TRUE, void_reason=:reason on the row.
Step 2: Run forward simulation guard from that txn_date.
Step 3: If guard fails → ROLLBACK void.
        Error: "Voiding this entry would make txn #X on [date] invalid."
```

---

## 10. Forward Simulation Guard (Recalculation Engine)

This is the most critical algorithm in the system. It runs before every edit,
void, or back-dated entry that could affect any future stock balance.

### FSG-01 — Algorithm Definition

```
INPUT:
    product_id       = the product being affected
    godown_id        = the godown being affected
    from_date        = the earliest date affected by the change
    hypothetical_rows = the set of rows as they will look AFTER the proposed change
                        (voided rows excluded, new correction rows included)

ALGORITHM:
    1. Fetch all non-voided transactions for (product_id, godown_id)
       where txn_date >= from_date, ordered by (txn_date ASC, created_at ASC).

    2. Replace / remove / add rows as per the proposed change.

    3. Fetch the balance as of (from_date - 1 day) using Formula RB-02.
       This is the "anchor balance" before the affected window.

    4. Walk rows from Step 2 in order:
       running_balance = anchor_balance
       FOR EACH row:
           IF txn_type IN ('OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'):
               running_balance += row.qty
           ELSE:
               running_balance -= row.qty

           IF running_balance < 0
              AND product.allow_negative_stock = FALSE:
               → FAIL. Record: (txn_id, txn_date, running_balance)
               → Return error FSG-ERR-01 with the failing row details.

    5. If loop completes without failure → PASS. Proceed with commit.
```

### FSG-02 — When to Run FSG

| Action | Run FSG? | from_date |
|---|---|---|
| New IN_FACTORY entry, today | No (adds stock, cannot break chain) | — |
| New OUT_GODOWN entry, today | Yes | today |
| New TRANSFER_OUT, today | Yes | today |
| Back-dated IN entry | No (adds stock) | — |
| Back-dated OUT entry | Yes | back-dated txn_date |
| Edit/void any entry | Yes | MIN(old_txn_date, new_txn_date) |
| Edit opening stock | Yes | OPEN_STOCK txn_date |
| Void a transfer leg | Yes | txn_date; run on both godowns |

### FSG-03 — Handling Transfers in the Simulation

When simulating a change that affects a TRANSFER, run FSG separately for both
the source godown and the destination godown.

```
If TRANSFER_OUT from G1 to G2 is edited:
    Run FSG(product_id, G1, from_date)   ← ensures G1 never goes negative
    Run FSG(product_id, G2, from_date)   ← ensures G2 never goes negative
    Both must PASS before committing.
```

### FSG-04 — Performance Optimisation

For large ledgers, avoid scanning all rows. Use the snapshot as the anchor:

```
anchor_balance = daily_snapshots.closing_stock
    WHERE snapshot_date = MAX(snapshot_date) < from_date

Then scan only transactions WHERE txn_date >= (that snapshot_date + 1 day).
This bounds the scan to days since the last snapshot.
```

---

## 11. Negative Stock Scenarios & Handling

### NS-01 — Scenario: Edit reduces qty, downstream entry now invalid

```
Situation:
    May 27 txn #4: IN_FACTORY +10  (original)
    May 28 txn #5: OUT_GODOWN −100 (valid when stock was 70)
    Edit: change txn #4 qty from 10 → 0

FSG simulation finds: after edit, stock before #5 = 60, after #5 = −40.
Result: BLOCK edit. Return:
    "Edit would make txn #5 (OUT_GODOWN −100 on 28 May) invalid.
     Balance would reach −40. Please reduce txn #5 first,
     or do not reduce txn #4 below 40."
```

### NS-02 — Scenario: Stock is 0, user enters Stock Out

```
available_stock = godown_stock[product_id][godown_id]   ← query view

IF available_stock = 0:
    IF allow_negative_stock = FALSE:
        → BLOCK. Return NS-ERR-01.
    IF allow_negative_stock = TRUE:
        → ALLOW. Insert with warning flag. Alert manager.
        → Tag row: negative_at_entry = TRUE
```

### NS-03 — Scenario: Stock appears 0 but physical stock exists (missed IN entry)

```
Diagnosis: back_dated IN entry has not been entered yet.

Correct flow:
    Step 1: Enter the missing IN_FACTORY entry with the correct txn_date.
    Step 2: FSG runs (no failure — IN adds stock).
    Step 3: Now re-attempt the OUT_GODOWN entry.
    Step 4: FSG runs from the OUT date — should now pass.
```

### NS-04 — Scenario: −30 then +30 gives 0, but the +30 was real

```
This is the "phantom balance" problem. The system must NOT accept this silently.

WRONG logic: allow OUT that causes −30 because a later +30 "fixes" it.
CORRECT logic: the FSG checks balance AT EACH ROW, not at the end.
               The −30 row fails the guard regardless of what comes after it.

Implementation:
    FSG checks running_balance < 0 at EVERY row in the loop.
    If any single row causes a negative → FAIL immediately.
    The system never looks ahead to see if it "recovers."
```

---

## 12. Back-Dated Entry Rules

### BD-01 — Detection

```
back_dated = TRUE  when  txn_date < CURRENT_DATE at time of insert
             FALSE when  txn_date = CURRENT_DATE
```

### BD-02 — Back-Dated IN Entry (factory receipt, adjustment in)

```
Pre-conditions:
    txn_date >= product's OPEN_STOCK txn_date
    txn_date <= CURRENT_DATE

On insert:
    back_dated = TRUE
    Snapshot for txn_date and all dates to CURRENT_DATE are now stale.
    Flag daily_snapshots rows WHERE snapshot_date >= txn_date as stale = TRUE.
    Trigger snapshot rebuild job for affected date range.
```

### BD-03 — Back-Dated OUT Entry

```
Pre-conditions: same as BD-02, PLUS:
    Run FSG from txn_date forward before committing.

If FSG passes: insert with back_dated = TRUE.
If FSG fails: BLOCK with exact error.
```

### BD-04 — How Far Back Is Allowed

```
Configurable per business:
    max_back_date_days = N   (e.g. 30 days, stored in settings table)
    
    IF CURRENT_DATE - txn_date > max_back_date_days:
        → BLOCK. Return: "Entry date is more than N days in the past.
          Contact a manager to unlock."

Manager unlock:
    Override flag per entry: manager_override = TRUE (requires manager auth).
```

---

## 13. New Product Mid-Year Addition

### NP-01 — Product Creation Flow

```
Step 1: User fills product master form:
            name, unit, allow_negative_stock
            opening_stock_entries[] = [
                { godown_id: G1, qty: 80 },
                { godown_id: G2, qty: 40 },
            ]
            as_of_date = :go_live_date

Step 2: Application atomically:
    a. INSERT INTO products (...)
    b. FOR EACH entry in opening_stock_entries:
           INSERT INTO transactions (
               product_id   = new product's id,
               godown_id    = entry.godown_id,
               txn_date     = as_of_date,
               txn_type     = 'OPEN_STOCK',
               qty          = entry.qty,
               is_void      = FALSE,
               ref_txn_id   = NULL
           )

Step 3: COMMIT. Product is now live with correct stock in each godown.
```

### NP-02 — Zero Opening Stock Product

```
If a product is created with opening stock = 0 (new product, not yet received):
    Do NOT insert any OPEN_STOCK row.
    The godown_stock view returns NULL / 0 for this product — both are correct.
    The first real stock will arrive via IN_FACTORY.

    Optional: insert OPEN_STOCK with qty=0 if your reporting requires
    explicit zero-balance rows. Both approaches are valid.
```

### NP-03 — Migrating Existing Products

```
Context: Business switches to this software mid-year. Products exist with
physical stock. Historical transactions are NOT being migrated.

Rule:
    OPEN_STOCK txn_date = go-live date
    qty = physical count on go-live date (from stocktake)
    All transactions entered going forward use txn_date >= go-live date.
    No back-dating before go-live date is allowed.
    
    OPEN_STOCK represents the verified physical count — it is not derived
    from any prior ledger.
```

---

## 14. Daily Snapshot Rules

### DS-01 — Snapshot Formula

```
For each (product_id, godown_id) combination:

closing_stock(snapshot_date) = Balance(product_id, godown_id, snapshot_date)
                               [using Formula RB-02]

INSERT INTO daily_snapshots (snapshot_date, product_id, godown_id, closing_stock, created_at)
SELECT :snapshot_date, product_id, godown_id,
    SUM(CASE WHEN txn_type IN ('OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN')
             THEN qty ELSE -qty END) AS closing_stock,
    NOW()
FROM transactions
WHERE txn_date <= :snapshot_date AND is_void = FALSE
GROUP BY product_id, godown_id;
```

### DS-02 — When to Run Snapshots

```
Primary: nightly job at EOD for the previous business date.
Trigger rebuild when:
    - A back-dated transaction is inserted (for that date and all later dates)
    - An edit/void affects a past date (for that date and all later dates)
    - A snapshot row is marked stale = TRUE
```

### DS-03 — Snapshot Invalidation & Rebuild

```
On any edit/void affecting txn_date = D:
    UPDATE daily_snapshots SET stale = TRUE
    WHERE snapshot_date >= D
      AND product_id = :product_id
      AND godown_id  = :godown_id;

Rebuild job:
    For each stale snapshot ordered by snapshot_date ASC:
        Recompute using DS-01 formula.
        Set stale = FALSE.
```

### DS-04 — Using Snapshots for Historical Queries

```
IF daily_snapshots row exists for (product_id, godown_id, requested_date)
   AND stale = FALSE:
    → Use snapshot.closing_stock directly. Fast O(1) lookup.

ELSE:
    → Fall back to Formula RB-02 with as_of_date = requested_date.
```

---

## 15. Godown-Level Stock Isolation

### GL-01 — Stock is Tracked Per (Product × Godown)

```
The fundamental unit of stock is (product_id, godown_id), not just product_id.
A product with 150 units across 5 godowns has 5 separate balances.
Moving 50 units from G1 to G2 changes both balances but not the total.
```

### GL-02 — Godown Balance Formula

```
godown_balance(P, G) = SUM(+IN contributions) - SUM(-OUT contributions)
                       for rows WHERE product_id=P AND godown_id=G AND is_void=FALSE
```

### GL-03 — Cross-Godown Balance Check (before transfer)

```
Before TRANSFER_OUT of qty Q from G_source:
    IF godown_balance(product_id, G_source) < Q
       AND allow_negative_stock = FALSE:
        → BLOCK. Return GT-ERR-01.
```

---

## 16. Company-Level (Cross-Godown) Stock Formula

### CL-01 — Total Company Stock

```
total_stock(product_id) =
    SUM over all godowns: godown_balance(product_id, godown_id)

SQL:
    SELECT SUM(CASE WHEN txn_type IN ('OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN')
                    THEN qty ELSE -qty END)
    FROM transactions
    WHERE product_id = :product_id AND is_void = FALSE;

NOTE: TRANSFER_IN and TRANSFER_OUT always appear in equal-and-opposite pairs,
      so they contribute 0 net to this total. Only IN_FACTORY, OUT_GODOWN,
      OPEN_STOCK, and ADJUSTMENT types affect the company total.
```

### CL-02 — Verifying Transfer Integrity

```
For any transfer pair (pair_id = X):
    SELECT qty FROM transactions WHERE pair_id = X AND txn_type = 'TRANSFER_OUT' AND is_void=FALSE
    SELECT qty FROM transactions WHERE pair_id = X AND txn_type = 'TRANSFER_IN'  AND is_void=FALSE

    These two must be equal. If not → data integrity violation. Alert and investigate.
```

---

## 17. Audit Trail Rules

### AT-01 — Every State Change is Queryable

```
Full history of a transaction:
    SELECT * FROM transactions
    WHERE txn_id = :original_id OR ref_txn_id = :original_id
    ORDER BY created_at ASC;

This returns: original row + every correction that was made to it.
```

### AT-02 — Ledger for a Product Between Two Dates

```sql
SELECT
    txn_date, txn_id, txn_type, qty, godown_id,
    is_void, void_reason, ref_txn_id, created_by, created_at,
    back_dated,
    SUM(CASE WHEN txn_type IN ('OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN')
             THEN qty ELSE -qty END)
        OVER (PARTITION BY godown_id
              ORDER BY txn_date ASC, created_at ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        AS running_balance
FROM transactions
WHERE product_id = :product_id
  AND txn_date BETWEEN :from_date AND :to_date
ORDER BY godown_id, txn_date ASC, created_at ASC;
```

### AT-03 — Voided Rows Must Remain Visible in Audit Mode

```
Normal ledger view:  WHERE is_void = FALSE
Audit ledger view:   No is_void filter — show all rows, highlight voided ones.
                     Show void_reason and link to replacement row via ref_txn_id.
```

---

## 18. Transaction Ordering Rules

### TO-01 — Canonical Sort Order

When computing running balances, rows within the same date must be ordered
consistently. The canonical order is:

```
ORDER BY txn_date ASC, created_at ASC

Tie-breaking rule:
    On the same txn_date AND same created_at (theoretically impossible
    with TIMESTAMP precision, but if it occurs):
        OPEN_STOCK first, then IN types, then OUT types.
        Reason: opening balance must anchor the day before any movement.
```

### TO-02 — Batch Entry Ordering

When multiple transactions are entered for the same date in one batch
(e.g. importing 10 transactions for May 27), use a `batch_seq` column
to preserve the intended order:

```
batch_seq = 1, 2, 3, ... (user-defined order within the batch)

Extended sort order:  ORDER BY txn_date ASC, created_at ASC, batch_seq ASC
```

### TO-03 — OPEN_STOCK is Always First

```
RULE: An OPEN_STOCK row for a (product, godown) has the earliest
      effective position in that godown's ledger — regardless of created_at.

Implementation: When displaying or computing the running balance,
    always sort OPEN_STOCK rows before any other txn_type
    on the same txn_date.

    ORDER BY txn_date ASC,
             CASE WHEN txn_type = 'OPEN_STOCK' THEN 0 ELSE 1 END ASC,
             created_at ASC
```

---

## 19. Recalculation After Snapshot Invalidation

### RI-01 — Full Recalculation Flow After a Historical Edit

```
Trigger: Edit/void of any transaction with txn_date = D

Step 1 — Determine scope:
    affected_product  = :product_id
    affected_godown   = :godown_id
    recalc_from_date  = MIN(old_txn_date, new_txn_date)   ← earliest affected date

Step 2 — Run FSG (Section 10) with recalc_from_date.
    If FSG fails → stop. Do not proceed.

Step 3 — Commit the void + correction rows.

Step 4 — Invalidate snapshots:
    UPDATE daily_snapshots SET stale = TRUE
    WHERE product_id    = affected_product
      AND godown_id     = affected_godown
      AND snapshot_date >= recalc_from_date;

Step 5 — Trigger async rebuild job:
    For each stale snapshot in ascending date order, recompute using DS-01.
    Mark each as stale = FALSE after recomputing.

Step 6 — The godown_stock view is always live — no rebuild needed for it.
         Reports that depend on daily_snapshots will use stale data until
         the rebuild job completes (typically seconds to minutes).
```

### RI-02 — Minimum Rebuild Scope

```
Only rebuild snapshots for the affected (product_id, godown_id) combination.
Do not rebuild unaffected products or godowns.

Exception: if the edit was to a TRANSFER row, rebuild BOTH godowns.
```

---

## 20. Edge Case Decision Matrix

| Scenario | available_stock | allow_negative | Action |
|---|---|---|---|
| New OUT entry, sufficient stock | ≥ qty | any | Allow |
| New OUT entry, insufficient stock | < qty | FALSE | BLOCK — NS-ERR-01 |
| New OUT entry, insufficient stock | < qty | TRUE | Allow with warning flag |
| New OUT, stock = 0 | 0 | FALSE | BLOCK — NS-ERR-01 |
| New OUT, stock = 0 | 0 | TRUE | Allow with warning flag |
| Edit reduces IN qty, chain stays positive | — | any | Allow after FSG pass |
| Edit reduces IN qty, chain goes negative | — | FALSE | BLOCK — FSG-ERR-01 |
| Edit reduces IN qty, chain goes negative | — | TRUE | Allow with manager warning |
| Void IN entry, chain breaks | — | FALSE | BLOCK — FSG-ERR-01 |
| Back-dated OUT, chain stays positive | — | any | Allow, mark back_dated=TRUE |
| Back-dated OUT, chain breaks | — | FALSE | BLOCK — FSG-ERR-01 |
| New product, opening stock = 0 | — | — | No OPEN_STOCK row needed |
| New product, opening stock > 0 | — | — | Auto-insert OPEN_STOCK rows |
| Correct OPEN_STOCK qty upward | — | — | Allow after FSG pass (trivially passes) |
| Correct OPEN_STOCK qty downward | — | FALSE | FSG from OPEN_STOCK date |
| Transfer OUT, source sufficient | ≥ qty | any | Allow |
| Transfer OUT, source insufficient | < qty | FALSE | BLOCK — GT-ERR-01 |
| Void transfer, destination goes negative | — | FALSE | BLOCK — FSG-ERR-01 on destination |

---

## 21. Database Constraints Checklist

These constraints must exist at the database level — not just in application code.

```sql
-- 1. qty is always non-negative and whole number
ALTER TABLE transactions ADD CONSTRAINT chk_qty_positive CHECK (qty >= 0);
ALTER TABLE transactions ADD CONSTRAINT chk_qty_integer CHECK (qty = FLOOR(qty));

-- 2. is_void can only go FALSE → TRUE (enforced via trigger or application)
-- No DB constraint for this; enforce in app layer (EV-02).

-- 3. One non-voided OPEN_STOCK per (product, godown)
CREATE UNIQUE INDEX ux_one_opening
    ON transactions (product_id, godown_id)
    WHERE txn_type = 'OPEN_STOCK' AND is_void = FALSE;

-- 4. Transfer pairs must have matching qty (enforced via trigger)
CREATE OR REPLACE FUNCTION check_transfer_pair_qty() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.txn_type IN ('TRANSFER_IN', 'TRANSFER_OUT') AND NEW.pair_id IS NOT NULL THEN
        PERFORM 1 FROM transactions
        WHERE pair_id = NEW.pair_id AND txn_id != NEW.txn_id
          AND qty != NEW.qty AND is_void = FALSE;
        IF FOUND THEN
            RAISE EXCEPTION 'Transfer pair qty mismatch for pair_id %', NEW.pair_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. txn_date cannot be in the future
ALTER TABLE transactions ADD CONSTRAINT chk_no_future_date
    CHECK (txn_date <= CURRENT_DATE);

-- 6. ref_txn_id must point to a different row
ALTER TABLE transactions ADD CONSTRAINT chk_no_self_reference
    CHECK (ref_txn_id IS NULL OR ref_txn_id != txn_id);

-- 7. void_reason required when is_void = TRUE
ALTER TABLE transactions ADD CONSTRAINT chk_void_reason
    CHECK (is_void = FALSE OR (is_void = TRUE AND void_reason IS NOT NULL));
```

---

## 22. Application-Layer Validation Checklist

Run these checks in the application before any DB write.

### Before any OUT or TRANSFER_OUT:

```
[ ] product_id exists and is active
[ ] godown_id exists and is active
[ ] qty > 0
[ ] txn_date <= CURRENT_DATE
[ ] txn_date >= product's OPEN_STOCK date
[ ] godown_stock[product_id][godown_id] >= qty
    OR allow_negative_stock = TRUE (with warning)
[ ] If back-dated: txn_date >= (CURRENT_DATE - max_back_date_days)
    OR manager_override = TRUE
[ ] FSG passes from txn_date
```

### Before any edit/void:

```
[ ] Original txn_id exists
[ ] Original txn is not already voided (is_void = FALSE)
[ ] void_reason is provided and non-empty
[ ] If changing txn_type: new type is valid for the context
[ ] If changing godown_id: both old and new godowns exist and are active
[ ] FSG passes from MIN(old_date, new_date) on affected godown(s)
[ ] If voiding a transfer leg: void both legs atomically
```

### Before saving a new product with opening stock:

```
[ ] At least one godown is selected for opening stock
[ ] All opening stock qtys >= 0
[ ] as_of_date <= CURRENT_DATE
[ ] as_of_date is a valid business date (not a weekend/holiday if applicable)
[ ] No duplicate godown entries in the opening stock list
```

---

## 23. Error Messages Reference

| Code | Trigger | Message |
|---|---|---|
| NS-ERR-01 | OUT when stock = 0 or insufficient | "Insufficient stock in [Godown Name]. Available: [X], Requested: [Y]. Entry blocked." |
| GT-ERR-01 | Transfer OUT exceeds source stock | "Cannot transfer [Y] units from [Godown A]. Available stock: [X]." |
| FSG-ERR-01 | Forward simulation fails | "This change would make txn #[ID] ([type] of [qty] on [date]) invalid — balance would reach [negative value]. Please resolve that entry first." |
| BD-ERR-01 | Back-date exceeds limit | "Entry date [D] is more than [N] days in the past. Manager approval required." |
| OP-ERR-01 | Duplicate OPEN_STOCK attempt | "An opening stock entry already exists for [Product] in [Godown]. Void the existing entry before creating a new one." |
| TXN-ERR-01 | qty <= 0 or decimal | "Quantity must be greater than zero." |
| TXN-ERR-04 | qty has decimals | "Quantity must be a whole number." |
| TXN-ERR-02 | Future date | "Transaction date cannot be in the future." |
| TXN-ERR-03 | Date before opening stock | "Transaction date [D] is before the opening stock date [D2] for this product." |
| VOID-ERR-01 | Already voided | "This transaction has already been voided and cannot be modified." |
| VOID-ERR-02 | Missing void reason | "A reason is required to void a transaction." |
| PAIR-ERR-01 | Transfer qty mismatch | "Transfer IN and OUT quantities must be equal. Found mismatch on pair [pair_id]." |

---

*End of RULES.md*
*Version 1.0 — covers multi-godown, multi-product inventory with*
*append-only ledger, historical editing, opening stock, and recalculation.*
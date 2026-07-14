# STUDIO_ERP_PLAN.md — Studio as the Business Knowledge Hub

This document specifies the technical design, database schemas, API routes, and AI reasoning changes required to turn **Studio** into the centralized **Business Knowledge Hub & ERP Operating Center** for the Zuri Relationship OS.

---

## 1. Vision & Architecture

Studio is the single source of truth for the entire platform. Every other module—Inbox, CRM, Documents, Relationship Engine, Automation, and the AI Advisor—consumes business facts and specifications defined in Studio.

```
+---------------------------------------------------------------------------------+
|                                    STUDIO                                       |
|                           (Business Knowledge Hub)                              |
+---------------------------------------------------------------------------------+
                                       |
        +------------------------------+------------------------------+
        |                              |                              |
+-------v-------+              +-------v-------+              +-------v-------+
|  Suppliers    |              |  Catalog Items|              |Business Facts |
|  - Company    |              |  - Products   |              |  - Policies   |
|  - Reliability|              |  - Services   |              |  - Hours      |
|  - Delivery   |              |  - Bundles    |              |  - Rules      |
+-------+-------+              +-------+-------+              +-------+-------+
        |                              |                              |
        +------------------------------+------------------------------+
                                       |
                        +--------------v--------------+
                        |  AI Inference Engine        |
                        |  - Suggested Replies        |
                        |  - Business Advisor         |
                        |  - Pricing Simulator        |
                        +-----------------------------+
```

---

## 2. Database Changes

### 2.1 Suppliers Table
A new `suppliers` table for vendor management:

```sql
CREATE TABLE IF NOT EXISTS suppliers (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company                    VARCHAR(255) NOT NULL,
  contact                    VARCHAR(255),
  phone                      VARCHAR(50),
  whatsapp                   VARCHAR(50),
  email                      VARCHAR(255),
  average_delivery_time      INT NOT NULL DEFAULT 5, -- in days
  reliability_score          DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  minimum_order              DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payment_terms              TEXT,
  outstanding_balance        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  notes                      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_user ON suppliers(user_id);
```

### 2.2 Rich Product Columns
We add the following columns to the `products` table to support rich cataloging:

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS item_type VARCHAR(30) NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'service', 'bundle', 'subscription', 'package', 'digital_product'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS videos JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INT NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved INT NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS available INT NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_stock INT NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS maximum_stock INT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time INT NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_lead_time INT NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin DECIMAL(5,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cross_sell JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS upsell JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS replacement_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS related_products JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS manual TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- Extension JSONBs for module specific configs
ALTER TABLE products ADD COLUMN IF NOT EXISTS service_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_notes TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketing_copy TEXT;
```

### 2.3 Business Facts
Widen the category check constraint on `business_facts` to include `'business_rule'`:

```sql
ALTER TABLE business_facts DROP CONSTRAINT IF EXISTS business_facts_category_check;
ALTER TABLE business_facts ADD CONSTRAINT business_facts_category_check CHECK (category IN (
  'product', 'pricing', 'shipping', 'refund_policy', 'faq',
  'hours', 'inventory', 'promotion', 'supplier', 'tax',
  'bank_details', 'wa_template', 'brand_voice', 'objection', 'other',
  'pricing_benchmark', 'business_rule'
));
```

### 2.4 Advisor Sessions
Add `session_category` column to separate relationship advisors from business advisors:

```sql
ALTER TABLE advisor_sessions ADD COLUMN IF NOT EXISTS session_category VARCHAR(30) NOT NULL DEFAULT 'relationship' CHECK (session_category IN ('relationship', 'business'));
CREATE INDEX IF NOT EXISTS idx_advisor_sessions_category ON advisor_sessions(user_id, session_category);
```

---

## 3. API Endpoints

### 3.1 Suppliers Endpoints
- `GET /api/suppliers`
- `POST /api/suppliers` (body: company, contact, phone, whatsapp, email, average_delivery_time, reliability_score, minimum_order, payment_terms, notes)
- `PATCH /api/suppliers/:id`
- `DELETE /api/suppliers/:id`

### 3.2 Expanded Catalog Endpoints (`/api/products`)
Ensure `price` maps to `selling_price` and `quantity` maps to `stock` to maintain compatibility with other modules (such as invoicing/document generator):
- Get / Create / Update endpoints accept and return all rich columns.

### 3.3 Business Advisor Endpoints (`/api/advisor`)
- Expand `GET /api/advisor/sessions?category=business|relationship`
- Expand `POST /api/advisor/sessions` to accept `category` (defaults to `relationship`).

---

## 4. AI & Context Architecture

### 4.1 Catalog Context in suggested replies (`reply_gen.py`)
During suggested reply generation, retrieve the user's active products and filter them (if catalog is large, by checking if product names are mentioned in the incoming message). Format the matching items:

```
Catalog items (Products/Services):
- [PRODUCT] iPhone 15 Pro Max (SKU: AAPL-IP15PM) | Price: 15000 ZMW | Stock: 4 (Available: 3) | Desc: 256GB, Black Titanium, 12 month warranty
- [SERVICE] Consultation | Duration: 60 mins | Price: 500 ZMW | Assigned: Sales Team
```

This lets the LLM answer queries about pricing, stock availability, and service booking requirements correctly.

### 4.2 Business Rules
All entries in `business_facts` of type `'business_rule'` are retrieved and formatted:
`- business_rule: Always collect 50% deposit for orders above K10,000`
`- business_rule: Do not offer discounts on Apple products`

This guides prompt constraint enforcement, preventing Zuri from making promises that break policies.

### 4.3 Conversational AI Business Advisor (`/internal/studio/ask`)
For business operation chats, we retrieve:
- All active catalog items (up to 50)
- All active rules and facts (up to 30)
- Supplier stats and reliability scores
- Recent sales invoices totals (from `documents` table)

---

## 5. UI Layout: The 10 Modules

The Next.js `/studio` route will contain a modular tab layout:

1. **Overview**: KPI cards (Inventory, rules count, active vendors, stock values), stock reorder alerts, and **AI Business Advisor** chat pane.
2. **Catalog**: Lists Products, Services, Bundles, Subscriptions, Packages, and Digital Products. Detailed side drawer for specifications, costs, and an AI Copywriting generator.
3. **Inventory**: Grid of stock levels (Reserved vs Available), supplier order status, monthly sales rate, replenishment speed, and conversational **AI Inventory Assistant**.
4. **Pricing**: Cost vs retail price matrices, pricing rules manager, and **AI Pricing Intelligence simulator** to forecast conversion lifts.
5. **Suppliers**: Full list of suppliers, delivery timelines, reliability grading, payment terms, and outstanding balances.
6. **Rules**: Plaintext rules input board ("Returns are accepted within 14 days") which registers directly to `'business_rule'` facts.
7. **Brand**: Synchronized color codes (primary, accent), uploaded logo, signature, brand voice statements, and company values.
8. **Knowledge**: Existing RAG PDF/URL uploader and search queries test block.
9. **Marketing**: Content campaign dashboard, content scheduler calendar, and caption creator.

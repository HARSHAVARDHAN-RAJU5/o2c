import psycopg2
import json
import os
import zipfile
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

# ─── CONFIG ───────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 5433)),
    "dbname":   os.getenv("DB_NAME", "sap_o2c"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "936158")
}

ZIP_PATH = os.getenv("ZIP_PATH", "sap-order-to-cash-dataset.zip")

# ─── LOAD FROM ZIP ────────────────────────────────────────
def load_all_from_zip():
    z = zipfile.ZipFile(ZIP_PATH)
    all_data = {}

    for name in sorted(z.namelist()):
        if not name.endswith('.jsonl'):
            continue
        entity = name.split('/')[1]
        try:
            raw = z.read(name).decode('utf-8')
            lines = [json.loads(l) for l in raw.strip().split('\n') if l.strip()]
            if entity not in all_data:
                all_data[entity] = []
            all_data[entity].extend(lines)
        except Exception as e:
            print(f"⚠️  Skipped {name}: {e}")

    print("📂 Loaded from zip:")
    for entity, records in all_data.items():
        print(f"   {entity}: {len(records)} records")

    return all_data

def connect():
    return psycopg2.connect(**DB_CONFIG)

# ─── CREATE TABLES ────────────────────────────────────────
def create_tables(cur):
    cur.execute("""
        DROP TABLE IF EXISTS
            customers, business_partner_addresses,
            sales_order_headers, sales_order_items, sales_order_schedule_lines,
            billing_document_headers, billing_document_items, billing_document_cancellations,
            outbound_delivery_headers, outbound_delivery_items,
            journal_entries, payments,
            products, product_descriptions, product_plants, product_storage_locations,
            plants, customer_company_assignments, customer_sales_area_assignments
        CASCADE;
    """)

    cur.execute("""
        CREATE TABLE customers (
            business_partner    TEXT PRIMARY KEY,
            customer            TEXT,
            full_name           TEXT,
            partner_name        TEXT,
            industry            TEXT,
            is_blocked          BOOLEAN,
            creation_date       TEXT
        );

        CREATE TABLE business_partner_addresses (
            business_partner    TEXT,
            address_id          TEXT,
            city_name           TEXT,
            country             TEXT,
            postal_code         TEXT,
            region              TEXT,
            street_name         TEXT,
            PRIMARY KEY (business_partner, address_id)
        );

        CREATE TABLE sales_order_headers (
            sales_order                 TEXT PRIMARY KEY,
            sales_order_type            TEXT,
            sales_organization          TEXT,
            sold_to_party               TEXT,
            creation_date               TEXT,
            total_net_amount            NUMERIC,
            overall_delivery_status     TEXT,
            overall_billing_status      TEXT,
            transaction_currency        TEXT,
            requested_delivery_date     TEXT,
            customer_payment_terms      TEXT
        );

        CREATE TABLE sales_order_items (
            sales_order             TEXT,
            sales_order_item        TEXT,
            material                TEXT,
            requested_quantity      NUMERIC,
            requested_quantity_unit TEXT,
            net_amount              NUMERIC,
            transaction_currency    TEXT,
            production_plant        TEXT,
            storage_location        TEXT,
            PRIMARY KEY (sales_order, sales_order_item)
        );

        CREATE TABLE sales_order_schedule_lines (
            sales_order             TEXT,
            sales_order_item        TEXT,
            schedule_line           TEXT,
            confirmed_delivery_date TEXT,
            order_quantity_unit     TEXT,
            confirmed_order_qty     NUMERIC,
            PRIMARY KEY (sales_order, sales_order_item, schedule_line)
        );

        CREATE TABLE billing_document_headers (
            billing_document                TEXT PRIMARY KEY,
            billing_document_type           TEXT,
            creation_date                   TEXT,
            billing_document_date           TEXT,
            is_cancelled                    BOOLEAN,
            cancelled_billing_document      TEXT,
            total_net_amount                NUMERIC,
            transaction_currency            TEXT,
            company_code                    TEXT,
            fiscal_year                     TEXT,
            accounting_document             TEXT,
            sold_to_party                   TEXT
        );

        CREATE TABLE billing_document_items (
            billing_document        TEXT,
            billing_document_item   TEXT,
            material                TEXT,
            billing_quantity        NUMERIC,
            billing_quantity_unit   TEXT,
            net_amount              NUMERIC,
            transaction_currency    TEXT,
            reference_sd_document   TEXT,
            reference_sd_doc_item   TEXT,
            PRIMARY KEY (billing_document, billing_document_item)
        );

        CREATE TABLE billing_document_cancellations (
            billing_document                TEXT PRIMARY KEY,
            billing_document_type           TEXT,
            creation_date                   TEXT,
            billing_document_date           TEXT,
            is_cancelled                    BOOLEAN,
            cancelled_billing_document      TEXT,
            total_net_amount                NUMERIC,
            transaction_currency            TEXT,
            company_code                    TEXT,
            fiscal_year                     TEXT,
            accounting_document             TEXT,
            sold_to_party                   TEXT
        );

        CREATE TABLE outbound_delivery_headers (
            delivery_document               TEXT PRIMARY KEY,
            creation_date                   TEXT,
            actual_goods_movement_date      TEXT,
            overall_goods_movement_status   TEXT,
            overall_picking_status          TEXT,
            shipping_point                  TEXT,
            delivery_block_reason           TEXT,
            header_billing_block_reason     TEXT
        );

        CREATE TABLE outbound_delivery_items (
            delivery_document       TEXT,
            delivery_document_item  TEXT,
            actual_delivery_qty     NUMERIC,
            delivery_quantity_unit  TEXT,
            plant                   TEXT,
            storage_location        TEXT,
            reference_sd_document   TEXT,
            reference_sd_doc_item   TEXT,
            batch                   TEXT,
            PRIMARY KEY (delivery_document, delivery_document_item)
        );

        CREATE TABLE journal_entries (
            accounting_document         TEXT,
            accounting_document_item    TEXT,
            company_code                TEXT,
            fiscal_year                 TEXT,
            gl_account                  TEXT,
            reference_document          TEXT,
            transaction_currency        TEXT,
            amount_in_txn_currency      NUMERIC,
            posting_date                TEXT,
            document_date               TEXT,
            accounting_document_type    TEXT,
            customer                    TEXT,
            clearing_date               TEXT,
            clearing_accounting_doc     TEXT,
            PRIMARY KEY (accounting_document, accounting_document_item)
        );

        CREATE TABLE payments (
            accounting_document             TEXT,
            accounting_document_item        TEXT,
            company_code                    TEXT,
            fiscal_year                     TEXT,
            clearing_date                   TEXT,
            clearing_accounting_document    TEXT,
            amount_in_txn_currency          NUMERIC,
            transaction_currency            TEXT,
            customer                        TEXT,
            invoice_reference               TEXT,
            sales_document                  TEXT,
            posting_date                    TEXT,
            gl_account                      TEXT,
            PRIMARY KEY (accounting_document, accounting_document_item)
        );

        CREATE TABLE products (
            product             TEXT PRIMARY KEY,
            product_type        TEXT,
            cross_plant_status  TEXT,
            creation_date       TEXT,
            gross_weight        NUMERIC,
            net_weight          NUMERIC,
            weight_unit         TEXT,
            product_group       TEXT,
            base_unit           TEXT,
            division            TEXT,
            industry_sector     TEXT
        );

        CREATE TABLE product_descriptions (
            product     TEXT,
            language    TEXT,
            description TEXT,
            PRIMARY KEY (product, language)
        );

        CREATE TABLE product_plants (
            product                 TEXT,
            plant                   TEXT,
            country_of_origin       TEXT,
            region_of_origin        TEXT,
            profit_center           TEXT,
            mrp_type                TEXT,
            availability_check_type TEXT,
            PRIMARY KEY (product, plant)
        );

        CREATE TABLE product_storage_locations (
            product          TEXT,
            plant            TEXT,
            storage_location TEXT,
            PRIMARY KEY (product, plant, storage_location)
        );

        CREATE TABLE plants (
            plant               TEXT PRIMARY KEY,
            plant_name          TEXT,
            valuation_area      TEXT,
            sales_organization  TEXT,
            factory_calendar    TEXT
        );

        CREATE TABLE customer_company_assignments (
            customer        TEXT,
            company_code    TEXT,
            PRIMARY KEY (customer, company_code)
        );

        CREATE TABLE customer_sales_area_assignments (
            customer                TEXT,
            sales_organization      TEXT,
            distribution_channel    TEXT,
            division                TEXT,
            currency                TEXT,
            PRIMARY KEY (customer, sales_organization, distribution_channel, division)
        );
    """)
    print("✅ All 19 tables created")

# ─── INSERT DATA ──────────────────────────────────────────
def insert_data(cur, DATA):

    rows = DATA.get("business_partners", [])
    execute_values(cur, "INSERT INTO customers VALUES %s ON CONFLICT DO NOTHING", [(
        r["businessPartner"], r.get("customer"), r.get("businessPartnerFullName"),
        r.get("businessPartnerName"), r.get("industry"),
        r.get("businessPartnerIsBlocked"), r.get("creationDate")
    ) for r in rows])
    print(f"✅ customers — {len(rows)} rows")

    rows = DATA.get("business_partner_addresses", [])
    execute_values(cur, "INSERT INTO business_partner_addresses VALUES %s ON CONFLICT DO NOTHING", [(
        r["businessPartner"], r.get("addressId"), r.get("cityName"),
        r.get("country"), r.get("postalCode"), r.get("region"), r.get("streetName")
    ) for r in rows])
    print(f"✅ business_partner_addresses — {len(rows)} rows")

    rows = DATA.get("sales_order_headers", [])
    execute_values(cur, "INSERT INTO sales_order_headers VALUES %s ON CONFLICT DO NOTHING", [(
        r["salesOrder"], r.get("salesOrderType"), r.get("salesOrganization"),
        r.get("soldToParty"), r.get("creationDate"),
        float(r["totalNetAmount"]) if r.get("totalNetAmount") else None,
        r.get("overallDeliveryStatus"), r.get("overallOrdReltdBillgStatus"),
        r.get("transactionCurrency"), r.get("requestedDeliveryDate"),
        r.get("customerPaymentTerms")
    ) for r in rows])
    print(f"✅ sales_order_headers — {len(rows)} rows")

    rows = DATA.get("sales_order_items", [])
    execute_values(cur, "INSERT INTO sales_order_items VALUES %s ON CONFLICT DO NOTHING", [(
        r["salesOrder"], r.get("salesOrderItem"), r.get("material"),
        float(r["requestedQuantity"]) if r.get("requestedQuantity") else None,
        r.get("requestedQuantityUnit"),
        float(r["netAmount"]) if r.get("netAmount") else None,
        r.get("transactionCurrency"), r.get("productionPlant"), r.get("storageLocation")
    ) for r in rows])
    print(f"✅ sales_order_items — {len(rows)} rows")

    rows = DATA.get("sales_order_schedule_lines", [])
    execute_values(cur, "INSERT INTO sales_order_schedule_lines VALUES %s ON CONFLICT DO NOTHING", [(
        r["salesOrder"], r.get("salesOrderItem"), r.get("scheduleLine"),
        r.get("confirmedDeliveryDate"), r.get("orderQuantityUnit"),
        float(r["confdOrderQtyByMatlAvailCheck"]) if r.get("confdOrderQtyByMatlAvailCheck") else None
    ) for r in rows])
    print(f"✅ sales_order_schedule_lines — {len(rows)} rows")

    rows = DATA.get("billing_document_headers", [])
    execute_values(cur, "INSERT INTO billing_document_headers VALUES %s ON CONFLICT DO NOTHING", [(
        r["billingDocument"], r.get("billingDocumentType"), r.get("creationDate"),
        r.get("billingDocumentDate"), r.get("billingDocumentIsCancelled"),
        r.get("cancelledBillingDocument"),
        float(r["totalNetAmount"]) if r.get("totalNetAmount") else None,
        r.get("transactionCurrency"), r.get("companyCode"), r.get("fiscalYear"),
        r.get("accountingDocument"), r.get("soldToParty")
    ) for r in rows])
    print(f"✅ billing_document_headers — {len(rows)} rows")

    rows = DATA.get("billing_document_items", [])
    execute_values(cur, "INSERT INTO billing_document_items VALUES %s ON CONFLICT DO NOTHING", [(
        r["billingDocument"], r.get("billingDocumentItem"), r.get("material"),
        float(r["billingQuantity"]) if r.get("billingQuantity") else None,
        r.get("billingQuantityUnit"),
        float(r["netAmount"]) if r.get("netAmount") else None,
        r.get("transactionCurrency"), r.get("referenceSdDocument"), r.get("referenceSdDocumentItem")
    ) for r in rows])
    print(f"✅ billing_document_items — {len(rows)} rows")

    rows = DATA.get("billing_document_cancellations", [])
    execute_values(cur, "INSERT INTO billing_document_cancellations VALUES %s ON CONFLICT DO NOTHING", [(
        r["billingDocument"], r.get("billingDocumentType"), r.get("creationDate"),
        r.get("billingDocumentDate"), r.get("billingDocumentIsCancelled"),
        r.get("cancelledBillingDocument"),
        float(r["totalNetAmount"]) if r.get("totalNetAmount") else None,
        r.get("transactionCurrency"), r.get("companyCode"), r.get("fiscalYear"),
        r.get("accountingDocument"), r.get("soldToParty")
    ) for r in rows])
    print(f"✅ billing_document_cancellations — {len(rows)} rows")

    rows = DATA.get("outbound_delivery_headers", [])
    execute_values(cur, "INSERT INTO outbound_delivery_headers VALUES %s ON CONFLICT DO NOTHING", [(
        r["deliveryDocument"], r.get("creationDate"), r.get("actualGoodsMovementDate"),
        r.get("overallGoodsMovementStatus"), r.get("overallPickingStatus"),
        r.get("shippingPoint"), r.get("deliveryBlockReason"), r.get("headerBillingBlockReason")
    ) for r in rows])
    print(f"✅ outbound_delivery_headers — {len(rows)} rows")

    rows = DATA.get("outbound_delivery_items", [])
    execute_values(cur, "INSERT INTO outbound_delivery_items VALUES %s ON CONFLICT DO NOTHING", [(
        r["deliveryDocument"], r.get("deliveryDocumentItem"),
        float(r["actualDeliveryQuantity"]) if r.get("actualDeliveryQuantity") else None,
        r.get("deliveryQuantityUnit"), r.get("plant"), r.get("storageLocation"),
        r.get("referenceSdDocument"), r.get("referenceSdDocumentItem"), r.get("batch")
    ) for r in rows])
    print(f"✅ outbound_delivery_items — {len(rows)} rows")

    rows = DATA.get("journal_entry_items_accounts_receivable", [])
    execute_values(cur, "INSERT INTO journal_entries VALUES %s ON CONFLICT DO NOTHING", [(
        r.get("accountingDocument"), str(r.get("accountingDocumentItem", "")),
        r.get("companyCode"), r.get("fiscalYear"), r.get("glAccount"),
        r.get("referenceDocument"), r.get("transactionCurrency"),
        float(r["amountInTransactionCurrency"]) if r.get("amountInTransactionCurrency") else None,
        r.get("postingDate"), r.get("documentDate"), r.get("accountingDocumentType"),
        r.get("customer"), r.get("clearingDate"), r.get("clearingAccountingDocument")
    ) for r in rows])
    print(f"✅ journal_entries — {len(rows)} rows")

    rows = DATA.get("payments_accounts_receivable", [])
    execute_values(cur, "INSERT INTO payments VALUES %s ON CONFLICT DO NOTHING", [(
        r.get("accountingDocument"), str(r.get("accountingDocumentItem", "")),
        r.get("companyCode"), r.get("fiscalYear"), r.get("clearingDate"),
        r.get("clearingAccountingDocument"),
        float(r["amountInTransactionCurrency"]) if r.get("amountInTransactionCurrency") else None,
        r.get("transactionCurrency"), r.get("customer"), r.get("invoiceReference"),
        r.get("salesDocument"), r.get("postingDate"), r.get("glAccount")
    ) for r in rows])
    print(f"✅ payments — {len(rows)} rows")

    rows = DATA.get("products", [])
    execute_values(cur, "INSERT INTO products VALUES %s ON CONFLICT DO NOTHING", [(
        r["product"], r.get("productType"), r.get("crossPlantStatus"), r.get("creationDate"),
        float(r["grossWeight"]) if r.get("grossWeight") else None,
        float(r["netWeight"]) if r.get("netWeight") else None,
        r.get("weightUnit"), r.get("productGroup"), r.get("baseUnit"),
        r.get("division"), r.get("industrySector")
    ) for r in rows])
    print(f"✅ products — {len(rows)} rows")

    rows = DATA.get("product_descriptions", [])
    execute_values(cur, "INSERT INTO product_descriptions VALUES %s ON CONFLICT DO NOTHING", [(
        r["product"], r.get("language"), r.get("productDescription")
    ) for r in rows])
    print(f"✅ product_descriptions — {len(rows)} rows")

    rows = DATA.get("product_plants", [])
    execute_values(cur, "INSERT INTO product_plants VALUES %s ON CONFLICT DO NOTHING", [(
        r["product"], r.get("plant"), r.get("countryOfOrigin"), r.get("regionOfOrigin"),
        r.get("profitCenter"), r.get("mrpType"), r.get("availabilityCheckType")
    ) for r in rows])
    print(f"✅ product_plants — {len(rows)} rows")

    rows = DATA.get("product_storage_locations", [])
    execute_values(cur, "INSERT INTO product_storage_locations VALUES %s ON CONFLICT DO NOTHING", [(
        r["product"], r.get("plant"), r.get("storageLocation")
    ) for r in rows])
    print(f"✅ product_storage_locations — {len(rows)} rows")

    rows = DATA.get("plants", [])
    execute_values(cur, "INSERT INTO plants VALUES %s ON CONFLICT DO NOTHING", [(
        r["plant"], r.get("plantName"), r.get("valuationArea"),
        r.get("salesOrganization"), r.get("factoryCalendar")
    ) for r in rows])
    print(f"✅ plants — {len(rows)} rows")

    rows = DATA.get("customer_company_assignments", [])
    execute_values(cur, "INSERT INTO customer_company_assignments VALUES %s ON CONFLICT DO NOTHING", [(
        r["customer"], r.get("companyCode")
    ) for r in rows])
    print(f"✅ customer_company_assignments — {len(rows)} rows")

    rows = DATA.get("customer_sales_area_assignments", [])
    execute_values(cur, "INSERT INTO customer_sales_area_assignments VALUES %s ON CONFLICT DO NOTHING", [(
        r["customer"], r.get("salesOrganization"), r.get("distributionChannel"),
        r.get("division"), r.get("currency")
    ) for r in rows])
    print(f"✅ customer_sales_area_assignments — {len(rows)} rows")

# ─── BUILD GRAPH ──────────────────────────────────────────
# FIX: normalise SOI item IDs to strip leading zeros so node IDs
# (built from sales_order_items.sales_order_item) always match edge targets
# (built from outbound_delivery_items.reference_sd_doc_item).
# Raw DB values can be "000010" or "10" – we store the integer string "10".

def norm_item(val):
    """Strip leading zeros: '000010' -> '10', '10' -> '10'"""
    if val is None:
        return val
    try:
        return str(int(val))
    except (ValueError, TypeError):
        return val

def build_graph(cur):
    nodes = []
    edges = []

    # ── Customers ──────────────────────────────────────────
    cur.execute("SELECT business_partner, customer, full_name, industry FROM customers")
    for row in cur.fetchall():
        nodes.append({"id": f"customer_{row[0]}", "type": "Customer", "data": {
            "label": row[2] or row[1] or row[0],
            "entity": "Customer", "businessPartner": row[0],
            "customer": row[1], "industry": row[3]
        }})

    # ── Sales Orders ───────────────────────────────────────
    cur.execute("""
        SELECT sales_order, sold_to_party, total_net_amount,
               overall_delivery_status, overall_billing_status, creation_date
        FROM sales_order_headers
    """)
    for row in cur.fetchall():
        nodes.append({"id": f"so_{row[0]}", "type": "SalesOrder", "data": {
            "label": f"SO {row[0]}", "entity": "SalesOrder",
            "salesOrder": row[0], "totalNetAmount": str(row[2]),
            "deliveryStatus": row[3], "billingStatus": row[4], "creationDate": row[5]
        }})
        if row[1]:
            edges.append({
                "id": f"e_cust_so_{row[0]}",
                "source": f"customer_{row[1]}",
                "target": f"so_{row[0]}",
                "label": "PLACED"
            })

    # ── Sales Order Items ──────────────────────────────────
    # FIX: normalise item IDs with norm_item() so they match delivery edges
    cur.execute("""
        SELECT sales_order, sales_order_item, material, net_amount
        FROM sales_order_items
    """)
    for row in cur.fetchall():
        item_norm = norm_item(row[1])
        node_id = f"soi_{row[0]}_{item_norm}"
        nodes.append({"id": node_id, "type": "SalesOrderItem", "data": {
            "label": f"Item {item_norm}", "entity": "SalesOrderItem",
            "salesOrder": row[0], "item": item_norm,
            "material": row[2], "netAmount": str(row[3])
        }})
        edges.append({
            "id": f"e_so_soi_{row[0]}_{item_norm}",
            "source": f"so_{row[0]}",
            "target": node_id,
            "label": "HAS_ITEM"
        })
        if row[2]:
            edges.append({
                "id": f"e_soi_prod_{row[0]}_{item_norm}",
                "source": node_id,
                "target": f"product_{row[2]}",
                "label": "FOR_PRODUCT"
            })

    # ── Products ───────────────────────────────────────────
    cur.execute("""
        SELECT p.product, p.product_type, p.product_group, pd.description
        FROM products p
        LEFT JOIN product_descriptions pd ON p.product = pd.product AND pd.language = 'EN'
    """)
    for row in cur.fetchall():
        nodes.append({"id": f"product_{row[0]}", "type": "Product", "data": {
            "label": row[3] or row[0], "entity": "Product",
            "product": row[0], "productType": row[1], "productGroup": row[2]
        }})

    # ── Deliveries ─────────────────────────────────────────
    cur.execute("""
        SELECT delivery_document, creation_date,
               overall_goods_movement_status, shipping_point
        FROM outbound_delivery_headers
    """)
    for row in cur.fetchall():
        nodes.append({"id": f"delivery_{row[0]}", "type": "Delivery", "data": {
            "label": f"Delivery {row[0]}", "entity": "Delivery",
            "deliveryDocument": row[0], "creationDate": row[1],
            "goodsMovementStatus": row[2], "shippingPoint": row[3]
        }})

    # ── Delivery → SalesOrderItem edges ───────────────────
    # FIX: normalise reference_sd_doc_item with norm_item() to match SOI node IDs
    cur.execute("""
        SELECT delivery_document, delivery_document_item,
               reference_sd_document, reference_sd_doc_item
        FROM outbound_delivery_items
        WHERE reference_sd_document IS NOT NULL
    """)
    for row in cur.fetchall():
        ref_item_norm = norm_item(row[3])
        edges.append({
            "id": f"e_del_soi_{row[0]}_{row[1]}",
            "source": f"delivery_{row[0]}",
            "target": f"soi_{row[2]}_{ref_item_norm}",
            "label": "DELIVERS"
        })

    # ── Billing Documents ──────────────────────────────────
    cur.execute("""
        SELECT billing_document, sold_to_party, total_net_amount,
               billing_document_date, is_cancelled
        FROM billing_document_headers
    """)
    for row in cur.fetchall():
        nodes.append({"id": f"billing_{row[0]}", "type": "BillingDoc", "data": {
            "label": f"Bill {row[0]}", "entity": "BillingDoc",
            "billingDocument": row[0], "soldToParty": row[1],
            "totalNetAmount": str(row[2]), "billingDate": row[3],
            "isCancelled": row[4]
        }})

    # ── Billing → Delivery edges ───────────────────────────
    # FIX: billing items reference sales order docs, not delivery docs directly.
    # We join via outbound_delivery_items to get the actual delivery document.
    cur.execute("""
        SELECT DISTINCT
            bdi.billing_document,
            odi.delivery_document
        FROM billing_document_items bdi
        JOIN outbound_delivery_items odi
          ON odi.reference_sd_document = bdi.reference_sd_document
         AND odi.reference_sd_doc_item  = bdi.reference_sd_doc_item
        WHERE bdi.reference_sd_document IS NOT NULL
    """)
    for row in cur.fetchall():
        edges.append({
            "id": f"e_bill_del_{row[0]}_{row[1]}",
            "source": f"billing_{row[0]}",
            "target": f"delivery_{row[1]}",
            "label": "BILLED_FROM"
        })

    # ── Journal Entries ────────────────────────────────────
    cur.execute("""
        SELECT accounting_document, accounting_document_item,
               reference_document, customer, amount_in_txn_currency
        FROM journal_entries
    """)
    for row in cur.fetchall():
        nodes.append({"id": f"journal_{row[0]}_{row[1]}", "type": "JournalEntry", "data": {
            "label": f"Journal {row[0]}", "entity": "JournalEntry",
            "accountingDocument": row[0], "referenceDocument": row[2],
            "customer": row[3], "amount": str(row[4])
        }})
        if row[2]:
            edges.append({
                "id": f"e_journal_bill_{row[0]}_{row[1]}",
                "source": f"journal_{row[0]}_{row[1]}",
                "target": f"billing_{row[2]}",
                "label": "RECORDS"
            })

    # ── Payments ───────────────────────────────────────────
    cur.execute("""
        SELECT accounting_document, accounting_document_item,
               customer, amount_in_txn_currency, posting_date
        FROM payments
    """)
    for row in cur.fetchall():
        nodes.append({"id": f"payment_{row[0]}_{row[1]}", "type": "Payment", "data": {
            "label": f"Payment {row[0]}", "entity": "Payment",
            "accountingDocument": row[0], "customer": row[2],
            "amount": str(row[3]), "postingDate": row[4]
        }})
        if row[2]:
            edges.append({
                "id": f"e_pay_cust_{row[0]}_{row[1]}",
                "source": f"payment_{row[0]}_{row[1]}",
                "target": f"customer_{row[2]}",
                "label": "PAID_BY"
            })

    # ── Validate and write ─────────────────────────────────
    node_id_set = set(n["id"] for n in nodes)
    valid_edges = [
        e for e in edges
        if e["source"] in node_id_set and e["target"] in node_id_set
    ]
    dropped = len(edges) - len(valid_edges)
    if dropped:
        print(f"⚠️  Dropped {dropped} edges with missing source/target nodes")

    out_dir = os.path.dirname(__file__)
    with open(os.path.join(out_dir, "graph_nodes.json"), "w") as f:
        json.dump(nodes, f, indent=2)
    with open(os.path.join(out_dir, "graph_edges.json"), "w") as f:
        json.dump(valid_edges, f, indent=2)

    print(f"\n✅ graph_nodes.json — {len(nodes)} nodes")
    print(f"✅ graph_edges.json — {len(valid_edges)} valid edges (0 dangling)")

# ─── MAIN ─────────────────────────────────────────────────
def main():
    print("📦 Loading data from zip...")
    DATA = load_all_from_zip()

    print("\n🔌 Connecting to PostgreSQL...")
    conn = connect()
    cur = conn.cursor()

    print("\n🏗️  Creating tables...")
    create_tables(cur)

    print("\n📥 Inserting data...")
    insert_data(cur, DATA)

    print("\n🕸️  Building graph...")
    build_graph(cur)

    conn.commit()
    cur.close()
    conn.close()
    print("\n✅ Done! Database ready.")

if __name__ == "__main__":
    main()
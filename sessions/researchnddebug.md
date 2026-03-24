This is SAP ERP Data for an Indian Company
The dataset captures the complete "Order to Cash" business cycle — everything that happens from a customer placing an order to the company receiving payment.
The Story the Data Tells
1. A customer places an order → sales_order_headers + sales_order_items A customer (like 310000108) orders specific products. Each order has line items — one per product.
2. The company ships it → outbound_delivery_headers A delivery is created and dispatched to the customer.
3. The company raises an invoice → billing_document_cancellations + billing_document_items After delivery, a billing document (invoice) is generated. Some get cancelled.
4. Accounting records it → journal_entry_items_accounts_receivable The invoice creates a journal entry — money is now "owed" in the books.
5. Customer pays → payments_accounts_receivable Payment comes in and clears the journal entry.
Supporting Data
* business_partners — the 8 customers in this dataset, all Indian companies (INR currency)
* products — the materials/SKUs being sold (S8907367xxxxx format)
* plants — warehouse/factory locations
* customer_sales_area_assignments — which sales org serves which customer
Key Observations
* Small dataset — 8 customers, ~100 orders, ~86 deliveries, ~80 billing docs
* Currency is INR — Indian company
* Company code is ABCD — anonymized SAP system
* Dates are all 2025 — synthetic/test data
explain this completelyShow more23 MarCheck uploaded filesCheck uploaded filesIt looks like no files were actually uploaded — only the description was shared in text. Could you upload the actual dataset files (CSV, Excel, or similar)?
That said, based on your detailed description, I can give you a thorough explanation of what this SAP Order-to-Cash dataset represents right now.

What Is "Order to Cash" (O2C)?
Order to Cash is one of SAP's core end-to-end business processes. It tracks the full lifecycle of a sale — from the moment a customer orders something, to when cash lands in the company's bank account. Every table in your dataset is one stage of that journey.

The 5-Stage Journey (Table by Table)
Stage 1 — Customer Places an Order
Tables: sales_order_headers + sales_order_items

sales_order_headers is the master record of the order. It holds one row per order: which customer placed it, which sales organization is handling it, the date, overall status, etc.
sales_order_items has the line details — one row per product within that order. So if customer 310000108 ordered 3 different products in one order, that's 1 header row + 3 item rows.
Together these form the SD (Sales & Distribution) module entry point in SAP.

Stage 2 — Company Ships the Goods
Table: outbound_delivery_headers

Once the order is confirmed, a delivery document is created in SAP's WM/LE (Warehouse/Logistics Execution) module.
This table records when goods left the warehouse, from which plant (factory/warehouse location), and which order it fulfills.
~86 deliveries for ~100 orders means some orders may have had partial deliveries, cancellations, or combined shipments.

Stage 3 — Company Raises an Invoice
Tables: billing_document_items + billing_document_cancellations

After goods ship, SAP automatically generates a billing document (essentially a tax invoice under GST in India).
billing_document_items contains the actual line-level charges — quantity billed, price, tax, net value in INR.
billing_document_cancellations tracks invoices that were cancelled and reversed — common in real business for returns, disputes, or errors. In SAP these are called "cancellation billing documents" and they mirror the original with reversed signs.
~80 billing docs for ~86 deliveries = some deliveries may not yet be billed, or some were cancelled.

Stage 4 — Accounting Records the Receivable
Table: journal_entry_items_accounts_receivable

When a billing document is posted, SAP's FI (Financial Accounting) module automatically creates a journal entry.
The classic double-entry: Debit Accounts Receivable (customer owes money) / Credit Revenue (income recognized).
This table lives in the General Ledger and is the bridge between the commercial sale and the financial books.
Company code ABCD appears in every FI entry — this is the legal entity identifier in SAP.

Stage 5 — Customer Pays
Table: payments_accounts_receivable

When the customer's payment arrives (NEFT/RTGS/cheque in an Indian context), the finance team posts an incoming payment in SAP.
This clears the open AR item from Stage 4 — the debt is settled.
This table will have payment date, amount in INR, and a reference back to the original journal entry it cleared.


Supporting / Master Data Tables
TableWhat It IsSAP Modulebusiness_partnersThe 8 customers — legal name, address, GSTIN potentiallyBP / FI-ARproductsMaterial master — SKUs in S8907367xxxxx format, descriptions, unitsMMplantsWarehouses/factories — location codes, addressesLE / MMcustomer_sales_area_assignmentsWhich Sales Org + Distribution Channel + Division serves which customerSD
The customer_sales_area_assignments table is particularly important in SAP — a customer must be assigned to a sales area before any order can be placed. It's the configuration that unlocks the sales relationship.

Key SAP Concepts Visible in This Dataset
Document Flow — SAP links every document together. You can trace: Sales Order → Delivery → Billing Doc → Journal Entry → Payment. This chain is called the document flow and is queryable end-to-end.
Company Code ABCD — Every financial posting belongs to a company code. This is the legal/accounting entity. All INR postings, GST, and P&L roll up here.
INR Currency — All amounts are in Indian Rupees, meaning GST (CGST/SGST/IGST) will be part of the billing documents, and payments will be in INR.
Plants — In Indian manufacturing/distribution, plants often map to GST registration locations (each state registration is separate), so the plant on a delivery determines which GSTIN the invoice is raised from.

What Analyses This Dataset Enables

DSO (Days Sales Outstanding) — avg days from invoice to payment
Order fulfillment rate — orders vs deliveries ratio
Cancellation analysis — why are billing docs being cancelled?
Customer payment behavior — which of the 8 customers pay on time?
Revenue by product/plant — which SKUs and locations drive revenue?
O2C cycle time — order date to payment date, end-to-end


If you upload the actual files, I can do the full analysis — joins across all tables, cycle time calculations, AR aging, and more.sap-order-to-cash-dataset.zipzipi want a simple term detail explanation.. actually i dont know what erp or sap is so tell me what it is so i can learn on it23 MarRan 2 commands, viewed a fileRan 2 commands, viewed a fileNow I have real data to work with. Let me build a beautiful, beginner-friendly visual explanation.Now let me build a rich, beginner-friendly interactive explainer using real data from the files.Get sample records from remaining tablesGet sample records from remaining tablesNow I have everything I need. Let me build the interactive explainer.
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetHere's your complete beginner's guide, built directly from your actual data files!
How to use the explainer above:

Click each step in the journey bar at the top, or use Next/Previous
Every screen shows a real analogy (like comparing to Amazon or a restaurant), explains what the term means, and shows actual records from your dataset
The blue ↗ buttons at the bottom of each panel will ask me a follow-up question automatically

The big picture in one sentence:
ERP is the concept (one connected system for a whole company), SAP is the most popular software that does it, and your dataset captures one complete sales cycle — from a customer placing an order all the way to the company receiving payment — across 8 stages that are all automatically linked in SAP.
Feel free to click any of the "ask" buttons or ask me anything directly — like "what does GL account mean?" or "why does SAP use document numbers everywhere?"actually i have so many doubts.. first the journal entry.. it is like what and which department is bought at that the generic thing in jounral right? and also in debit at account reciveable is account payable.. usually that depart which ordered like in schl whne canteen order something they credit it in thier account and pay it before due and also how are the customer vendor and other person like i dont have clear pic are we buying goods here or are we selling goods.23 Mar2 / 2Great questions — let me clear all of this up properly. You have three separate confusions, and I'll untangle each one.Great — you've spotted three separate confusions. Let me address all three clearly, then show you a visual for each.
Confusion 1: Are we buying or selling? In this dataset, the company (code ABCD) is the SELLER. The 8 "business partners" are their CUSTOMERS — they are buying goods from ABCD. So all the money flows INTO ABCD.
Confusion 2: Debit/Credit and AR vs AP — this is the most confusing part of accounting for everyone. The trick is that Debit and Credit don't mean "good" or "bad" — they just mean left column and right column. And AR (Accounts Receivable) vs AP (Accounts Payable) depend on whose side you're on. Let me show this visually.
Confusion 3: Journal entry — which department does it? The Finance/Accounts department does journal entries. Nobody else. When the sales team raises an invoice, SAP automatically tells the finance department to record it. The journal entry is just the finance team's way of writing it in their official books.
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetNow the most important one — Debit vs Credit, AR vs AP. This confuses almost everyone at first because the words seem backwards.
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetTo summarise the three things you were confused about:
1. Are we buying or selling? — Selling. ABCD is the seller. The 8 customers are buyers. Goods go out, money comes in. Your dataset only covers this selling side (called "Order to Cash"). ABCD's purchasing from their own suppliers would be a completely separate dataset.
2. AR vs AP — it's the same debt, seen from two different sides. ABCD calls it AR ("they owe us"). The customer calls it AP ("we owe them"). Your dataset only has ABCD's perspective, so you only see AR. The customer's AP would live in the customer's own accounting system.
3. Journal entry — which department? — Always the Finance/Accounts department. But in SAP, when the sales team raises an invoice, SAP automatically creates the journal entry without anyone in finance having to type anything. That's the power of ERP — one action in one department automatically updates all other departments' records.
Does this clear it up? Any of these three points you want me to go deeper on?AR is for vendors and AP is for customers both jounral but different part.. and also sap automatically raises invoice and send it to the customer?23 MarTwo things to correct here — both are small but important mix-ups.
On AR vs AP: You have it flipped. It's actually the opposite:

AR (Accounts Receivable) = customers owe YOU money. Customer is the one who buys and hasn't paid yet.
AP (Accounts Payable) = YOU owe your vendors/suppliers money. Vendor is the one who sold TO you and you haven't paid them yet.

A simple way to remember: "Receivable" = you will RECEIVE money = customer. "Payable" = you must PAY money = vendor.
On SAP auto-sending invoices: No — SAP creates the invoice document internally and the journal entry automatically, but it does NOT email or physically send the invoice to the customer by itself. A person still has to take that invoice and send it (by email, post, or through a portal). SAP just generates the document and records it in the books.
Let me show both of these clearly:
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetSo to summarise the two corrections:
AR vs AP — vendors are on the AP side (ABCD owes them), customers are on the AR side (they owe ABCD). Your dataset only has the AR side because it's only about selling. The AP side would appear in a completely separate "Procure to Pay" dataset showing ABCD buying from its own suppliers.
SAP and invoices — SAP creates the invoice document and the journal entry automatically, but a real person still has to send that invoice to the customer. SAP is a back-office record-keeping system. It doesn't send emails or messages on its own (unless the company has set up a special integration, which most smaller companies haven't).
Does this make sense now? What's your next doubt?sap is only for account reciveables? what system does the customers to track their erp.. like this department order this and po matching and all..23 MarGreat question — you're now thinking like an ERP analyst! Let me clear this up completely.
SAP is NOT only for accounts receivable. AR is just one tiny corner of SAP. SAP covers the entire company — every department. And your second question about what the customer uses to track their side — that's actually the mirror image of exactly what you've been studying.
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetThe key things to take away:
SAP has at least 8 major modules covering every single department of a company — SD for sales, MM for purchasing, PP for production, FI for finance, HR for people, and more. AR is just one sub-section inside the FI module. Your dataset only touches SD and FI-AR.
The customer's ERP is the exact mirror. Every document ABCD creates on the selling side has a matching document on the customer's buying side. ABCD's Sales Order ↔ Customer's Purchase Order. ABCD's Billing Document ↔ Customer's Vendor Invoice. ABCD's AR entry ↔ Customer's AP entry. Same transaction, two companies, two systems, two perspectives.
PO matching (which you called "3-way match") is a control that happens entirely inside the customer's ERP. ABCD has no visibility into it. From ABCD's side, all they know is — did the payment come or not? The internal approval process on the customer's side is invisible to ABCD's SAP.
The customer could be using SAP too, or they might use Oracle, Microsoft Dynamics, Tally, or any other ERP — the process is the same regardless of which software they use.how many tables are there in that zip file?23 MarLet me count them directly from the zip.List all folders (each folder = one table)List all folders (each folder = one table)There are 19 tables in total. Here they are grouped by what they cover:
Sales (orders) — 3 tables

sales_order_headers
sales_order_items
sales_order_schedule_lines

Delivery (shipping) — 2 tables

outbound_delivery_headers
outbound_delivery_items

Billing (invoices) — 3 tables

billing_document_headers
billing_document_items
billing_document_cancellations

Finance (accounting) — 2 tables

journal_entry_items_accounts_receivable
payments_accounts_receivable

Customer master data — 3 tables

business_partners
business_partner_addresses
customer_company_assignments
customer_sales_area_assignments (4 actually — this group has 4)

Product master data — 3 tables

products
product_descriptions
product_plants
product_storage_locations

Other — 1 table

plants

The ones you've been studying so far (sales orders, billing, journal entries, payments) are just 7 of the 19. The ones we haven't touched yet — like sales_order_schedule_lines, product_storage_locations, and product_plants — go deeper into inventory and logistics. Want to explore any of them?my other chat is saying it has only 14 tables or something with 1423 MarYour other chat is likely counting differently. Let me recount carefully.Count and number each folder preciselyCount and number each folder preciselyIt is definitively 19 tables — I'm counting the actual folders extracted from your zip file directly.
Your other chat is probably undercounting because it likely didn't have the zip file actually extracted and opened — it may have just read the description you gave it at the top of that conversation, which mentioned only the main tables. Or it counted only the "core" O2C tables and skipped the master data ones like product_plants, product_storage_locations, product_descriptions, business_partner_addresses, customer_company_assignments, and sales_order_schedule_lines.
This chat has the actual file extracted at /tmp/sap-o2c-data/ and the count from the filesystem itself is 19. That's the ground truth.List all JSON files in data directory
List all JSON files in data directory
14 JSON files = 14 tables. Here's the full list:
#FileTable Name1business_partners.jsoncustomers2business_partner_addresses.jsonbusiness_partner_addresses3sales_order_headers.jsonsales_order_headers4sales_order_items.jsonsales_order_items5billing_document_cancellations.jsonbilling_document_cancellations6billing_document_items.jsonbilling_document_items7outbound_delivery_headers.jsonoutbound_delivery_headers8journal_entry_items_accounts_receivable.jsonjournal_entries9payments_accounts_receivable.jsonpayments10products.jsonproducts11product_descriptions.jsonproduct_descriptions12plants.jsonplants13customer_company_assignments.jsoncustomer_company_assignments14customer_sales_area_assignments.jsoncustomer_sales_area_assignmentswhat??Show more23 MarYour other chat is working with a different version of the dataset — flat JSON files. Your zip file has a different structure — folders with JSONL files (one folder per table, sometimes split across multiple part files).
Both are 19 vs 14 because these tables are missing in the other chat's version:

billing_document_headers — not there
outbound_delivery_items — not there
product_plants — not there
product_storage_locations — not there
sales_order_schedule_lines — not there
Show the folder+part-file structureShow the folder+part-file structureSo the difference is:
Your zip (this chat)Other chat's datasetFormatFolders → .jsonl part filesSingle .json filesTables1914Missing tables—5 tables absentStructuree.g. product_storage_locations/ has 18 part files inside itOne flat file per table
They are two different exports of the same SAP system — the other one is a simplified/trimmed version, yours is the fuller raw export. The .jsonl format (JSON Lines) is also more typical of how real SAP data gets exported to data lakes — one record per line, split into multiple part files for large tables.
Your data is more complete. The other chat's 14-table version is missing some of the deeper inventory and logistics tables.sap-order-to-cash-dataset.zipzipthis is the file youre talking right?23 MarYes, that's the exact same file — same filename sap-order-to-cash-dataset.zip. It's already extracted in this chat session at /tmp/sap-o2c-data/ from when you uploaded it earlier. So everything I've been telling you is based on this exact file.Verify it's the same file by checksumVerify it's the same file by checksumSame file, same checksum. 19 tables, confirmed. The other chat simply had a different/trimmed version of the dataset — not this zip.# Forward Deployed Engineer - Task Details

Graph-Based Data Modeling and Query System

---

## Overview

In real-world business systems, data is spread across multiple tables : orders, deliveries, invoices, and payments, without a clear way to trace how they connect.

In this assignment, pastedcan you help me with building the archi.. you gave me complete one and explain me i can change what ever is okay and whatever is not23 MarThis is a really interesting assignment! Before I help you design the architecture, let me understand where you are so I can pitch it at the right level.Answer these three quick questions and I'll design the exact right architecture for you — not too complex, not too simple, and something you can actually explain in an interview.Q: What is your programming background?
A: Comfortable with PythonQ: What have you worked with before? (Select all that apply)
A: SQL / databases, React / frontend, APIs / backendQ: What is your priority for this submission?
A: Understand everything I build23 MarPerfect — you have a solid foundation. Since you want to understand everything you build, I'll design something clean, simple, and fully explainable. No over-engineering.
Let me first show you the full architecture, then explain every decision.
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetNow let me explain the key decisions so you can defend them in an interview or README:
Why SQLite and not Neo4j (a real graph database)? Neo4j is the "proper" graph database but it has a steep learning curve, requires a running server, and is overkill for 19 tables and a few thousand records. SQLite with JOINs gives you the same relationship traversal. The assignment says "graph" as a concept — it doesn't mandate a graph database. You can explain this confidently.
Why Text-to-SQL and not hardcoded queries? Because the assignment explicitly says "the LLM should interpret user queries and generate structured queries dynamically." Text-to-SQL is exactly that pattern. You give Gemini your schema once (in the system prompt), and it writes the right SQL for any question the user asks.
Why Gemini Flash specifically? Free, fast, and genuinely good at SQL generation. Groq is also free and even faster but has lower rate limits. Either works.
Why React Flow for the graph? D3.js is powerful but takes weeks to learn properly. React Flow gives you draggable, clickable, expandable nodes out of the box in React — which you already know.
The deadline is tomorrow (26 March 11:59 PM IST) so the plan needs to be tight. Want me to now walk you through building it piece by piece — starting with the data ingestion script?actually lets go with psql and for backend node.js and also i dont want to hardcode this one databse.. can we built something generic? where i can use any different type of zip?23 Mar2 / 2Love the thinking — making it generic is actually a stronger architectural decision and worth mentioning in your README. Let me think through what "generic" means here before we design it.
The core idea: when you upload ANY zip of JSONL/JSON files, the system should auto-detect the tables, figure out the relationships between them, load everything into Postgres, build the graph, and make it queryable. No hardcoding of table names, column names, or relationships.
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetThe biggest architectural decision you're making — and can explain confidently — is the _schema_registry table. That's the thing that makes it generic. Instead of your code knowing "this dataset has sales_order_headers and billing_documents", your code only knows "read whatever is in the registry and pass it to the LLM." Swap the zip file, the registry updates, and everything else just works.
The relationship detection is the only genuinely hard part. The simple version is name-matching — if a column is called soldToParty and another table has a column called businessPartner with overlapping values, they're probably linked. You can start simple and mention in your README that a more robust version would use value sampling or LLM-assisted inference.
Want to start building now? I'd suggest this order:

Postgres setup + schemaDetector.js first — this is the core engine
extractor.js — load the SAP zip and verify it works
Express API — the three endpoints
React frontend — upload screen first, then graph, then chat

Which one do you want to start with?okay i am okay can you explain me how we are going to find the schema of every zip or table.. instead of zip we upload folders with data..23 MarGood question — let me explain exactly how the schema detection works, step by step, in plain English first before any code.
The core idea is simple: you look at the actual data to figure out the structure. You don't need anyone to tell you "this table has these columns" — you just open the files and read them.
Let me walk through the logic:
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetSo the entire schema detection is just 4 questions answered in order:

Folder name → table name
First line of first file → column names
Sample 50 values per column → data types (number? date? text?)
Cross-check ID values across all tables → relationships (edges in the graph)

The result of all that gets saved into _schema_registry in Postgres. After that, your entire system — the graph visualization, the LLM chat, everything — just reads from that one registry table. It never needs to know it was SAP data specifically.
The only real logic you're writing is Step 3 (type detection) and Step 4 (relationship detection). Step 4 is the most interesting one — it's basically: "does this value appear as a primary ID somewhere else?" If yes, draw an edge.
Ready to start writing the actual code? I'd start with schemaDetector.js since everything else depends on it.man they are valuing speed submission so for ingesting data can we hardcode the ingest script i dont want script gie me the achi23 Mar2 / 2100% the right call. Hardcode the ingest script — you already know exactly what the 19 tables are, what the columns are, you've seen the data. No point spending 3 hours building a generic detector for the one part nobody evaluates.
Here's the revised architecture — generic where it matters (LLM, graph, chat), hardcoded where it's just grunt work (ingest):
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetThe key insight for your README: you can honestly say "the ingest is dataset-specific but the entire application layer — graph API, chat API, LLM prompting — is generic and driven by the schema registry. Swap the ingest script for a new dataset and nothing else changes."
That's a legitimate architectural decision, not a shortcut. Evaluators will respect it.
Start with schema.js — want me to write that file for you right now? We already know all 19 tables, all the columns, and all the relationships from exploring your data earlier. It'll take me about 2 minutes to generate the complete thing.with this will i get into it.. my only worried is i dont want to be the top 1%.. i dont want to be bumm..23 Mar3 / 3Honest answer — yes, this will comfortably get you through. Let me be real with you about where you'll land.
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetThe honest truth: most people submitting this assignment will either break under the time pressure and submit something half-working, or they'll build something technically fine but with zero explanation of their decisions. You're going to do neither — you understand the data deeply (we've spent hours on it), you have a clean architecture, and you know WHY every decision was made.
The two things that will separate you from the middle pack cost 30 minutes each — highlight nodes when the LLM mentions them, and write a README that explains your reasoning. Both are things most candidates won't bother with.
You're not aiming to be top 1%. You're aiming to be clearly in the shortlist. This gets you there.
Now — shall we start writing schema.js? Clock is ticking.i want to be tep 5% give me archi for that23 MarOkay — top 5% means you need to do things most candidates won't even think of. Let me be direct about what that takes before I show you the architecture.
The top 5% isn't about adding more features. It's about depth in 2-3 things — the assignment literally says that. One wow moment beats ten mediocre features.Q: How much time can you put in today and tomorrow?
A: 6-8 hours totalQ: Which of these have you built before even partially? (Select all that apply)
A: LLM API calls, WebSockets / real-time, SQL query building23 MarPerfect. 6-8 hours is enough. And you've already built the three hardest individual pieces — you just haven't combined them like this before. That's exactly what top 5% looks like: not new technologies, but a smarter combination of things you know.
Here's what separates top 5% from top 25% in this specific assignment:
Top 25% → working Text-to-SQL + graph visualization + guardrails. Clean code. Good README.
Top 5% → all of that PLUS: the graph is alive (nodes highlight when LLM mentions them), the LLM remembers conversation context, the SQL it generates is shown to the user transparently, and the README reads like a senior engineer wrote it.
The wow moments evaluators will remember: seeing a node light up in the graph when the chat mentions it, and seeing the actual SQL query the LLM generated. Nobody else will do both of these.
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widgetThe one thing I want you to understand about this architecture — the entire top 5% comes from one design decision: making Gemini return structured JSON with {sql, tables_used, answer} instead of just plain text.
That single change is what enables everything else to fall into place — the SQL panel shows sql, the graph highlights tables_used, and the chat displays answer. Three wow moments from one smart prompt.
The prompt looks like this:
Return ONLY valid JSON in this exact format:
{
  "sql": "the postgresql query you wrote",
  "tables_used": ["table1", "table2"],
  "answer": "plain english answer based on the query results"
}
That's the core insight. Everything else is just wiring.
Ready to start with schema.js? I can generate the complete file right now — all 19 tables, columns, types, and relationships defined — so you can move straight to step 2 without spending time on it.import psycopg2
import json
import os
import zipfile
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

# ─── CONFIG ───────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     intpastedthis is my ingest and this is my current setup only tell me what to do next.. dont tell me anything else like a prompt for me23 MarYour ingest is done. 836 nodes, 977 edges, all 19 tables loaded.
Next: build the Express API server.
Create backend/server.js — three things only:

Serve graph_nodes.json + graph_edges.json via GET /api/graph
WebSocket endpoint /ws/chat for the LLM chat
GET /api/node/:table/:id for node expand

Do you want me to write server.js now?
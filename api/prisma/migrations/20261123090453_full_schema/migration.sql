-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_by" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "event_type" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(80),
    "old_data" JSONB,
    "new_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "group_id" UUID NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(255),
    "address" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(150),
    "phone" VARCHAR(30),
    "email" VARCHAR(255),
    "address" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_no" VARCHAR(50) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "receipt_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_receipt_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "supplier_id" UUID,
    "lot_code" VARCHAR(80) NOT NULL,
    "manufactured_date" DATE,
    "expiry_date" DATE NOT NULL,
    "received_at" DATE NOT NULL,
    "initial_quantity" DECIMAL(14,3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lot_balances" (
    "lot_id" UUID NOT NULL,
    "on_hand_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_lot_balances_pkey" PRIMARY KEY ("lot_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" BIGSERIAL NOT NULL,
    "lot_id" UUID NOT NULL,
    "movement_type" VARCHAR(20) NOT NULL,
    "quantity_delta" DECIMAL(14,3) NOT NULL,
    "balance_after" DECIMAL(14,3) NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,
    "source_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "count_no" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "counted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "count_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "system_qty" DECIMAL(14,3) NOT NULL,
    "counted_qty" DECIMAL(14,3) NOT NULL,
    "variance_qty" DECIMAL(14,3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_no" VARCHAR(50) NOT NULL,
    "agency_id" UUID NOT NULL,
    "order_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "requested_qty" DECIMAL(14,3) NOT NULL,
    "fulfilled_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lot_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "allocated_qty" DECIMAL(14,3) NOT NULL,
    "allocation_rank" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'allocated',
    "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_lot_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outbound_no" VARCHAR(50) NOT NULL,
    "outbound_type" VARCHAR(30) NOT NULL,
    "order_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_receipt_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outbound_id" UUID NOT NULL,
    "order_item_id" UUID,
    "lot_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiry_thresholds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "warning_days" INTEGER NOT NULL,
    "critical_days" INTEGER NOT NULL DEFAULT 0,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expiry_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiry_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lot_id" UUID NOT NULL,
    "threshold_id" UUID,
    "evaluation_date" DATE NOT NULL,
    "days_remaining" INTEGER NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "on_hand_qty" DECIMAL(14,3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expiry_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_type" VARCHAR(20) NOT NULL,
    "trigger_type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
    "requested_by" UUID,
    "model_version" VARCHAR(50),
    "metrics" JSONB,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demand_forecasts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysis_run_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "forecast_date" DATE NOT NULL,
    "forecast_qty" DECIMAL(14,3) NOT NULL,
    "baseline_qty" DECIMAL(14,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demand_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_risk_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysis_run_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "forecast_id" UUID,
    "on_hand_snapshot" DECIMAL(14,3) NOT NULL,
    "estimated_demand_before_expiry" DECIMAL(14,3) NOT NULL,
    "estimated_surplus_qty" DECIMAL(14,3) NOT NULL,
    "risk_level" VARCHAR(20) NOT NULL,
    "basis" JSONB NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "risk_assessment_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "action_type" VARCHAR(30) NOT NULL,
    "proposed_qty" DECIMAL(14,3) NOT NULL,
    "rationale" TEXT NOT NULL,
    "source_run_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'new',
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "treatment_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_explanations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proposal_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "model_name" VARCHAR(80) NOT NULL,
    "prompt_version" VARCHAR(30) NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "explanation_text" TEXT NOT NULL,
    "validation_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proposal_id" UUID NOT NULL,
    "decision" VARCHAR(20) NOT NULL,
    "decided_by" UUID NOT NULL,
    "reason" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proposal_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'planned',
    "planned_qty" DECIMAL(14,3) NOT NULL,
    "actual_qty" DECIMAL(14,3),
    "responsible_user_id" UUID NOT NULL,
    "linked_outbound_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_execution_updates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execution_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "actual_qty" DECIMAL(14,3),
    "note" TEXT,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_execution_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_groups_code_key" ON "product_groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_code_key" ON "agencies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_receipts_receipt_no_key" ON "inbound_receipts"("receipt_no");

-- CreateIndex
CREATE INDEX "lots_product_id_expiry_date_idx" ON "lots"("product_id", "expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "lots_product_id_lot_code_key" ON "lots"("product_id", "lot_code");

-- CreateIndex
CREATE INDEX "stock_movements_lot_id_occurred_at_idx" ON "stock_movements"("lot_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_source_type_source_id_idx" ON "stock_movements"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_count_no_key" ON "stock_counts"("count_no");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_items_count_id_lot_id_key" ON "stock_count_items"("count_id", "lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "agency_orders_order_no_key" ON "agency_orders"("order_no");

-- CreateIndex
CREATE UNIQUE INDEX "order_lot_allocations_order_item_id_lot_id_key" ON "order_lot_allocations"("order_item_id", "lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_receipts_outbound_no_key" ON "outbound_receipts"("outbound_no");

-- CreateIndex
CREATE UNIQUE INDEX "expiry_alerts_lot_id_evaluation_date_key" ON "expiry_alerts"("lot_id", "evaluation_date");

-- CreateIndex
CREATE UNIQUE INDEX "demand_forecasts_analysis_run_id_product_id_forecast_date_key" ON "demand_forecasts"("analysis_run_id", "product_id", "forecast_date");

-- CreateIndex
CREATE UNIQUE INDEX "lot_risk_assessments_analysis_run_id_lot_id_key" ON "lot_risk_assessments"("analysis_run_id", "lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_decisions_proposal_id_key" ON "proposal_decisions"("proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_executions_proposal_id_key" ON "treatment_executions"("proposal_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_receipts" ADD CONSTRAINT "inbound_receipts_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_receipt_items" ADD CONSTRAINT "inbound_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inbound_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_receipt_items" ADD CONSTRAINT "inbound_receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_receipt_items" ADD CONSTRAINT "inbound_receipt_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lot_balances" ADD CONSTRAINT "inventory_lot_balances_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_orders" ADD CONSTRAINT "agency_orders_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_orders" ADD CONSTRAINT "agency_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_orders" ADD CONSTRAINT "agency_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_order_items" ADD CONSTRAINT "agency_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "agency_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_order_items" ADD CONSTRAINT "agency_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lot_allocations" ADD CONSTRAINT "order_lot_allocations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "agency_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lot_allocations" ADD CONSTRAINT "order_lot_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_receipts" ADD CONSTRAINT "outbound_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "agency_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_receipts" ADD CONSTRAINT "outbound_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_receipts" ADD CONSTRAINT "outbound_receipts_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_receipt_items" ADD CONSTRAINT "outbound_receipt_items_outbound_id_fkey" FOREIGN KEY ("outbound_id") REFERENCES "outbound_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_receipt_items" ADD CONSTRAINT "outbound_receipt_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "agency_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_receipt_items" ADD CONSTRAINT "outbound_receipt_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiry_thresholds" ADD CONSTRAINT "expiry_thresholds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_threshold_id_fkey" FOREIGN KEY ("threshold_id") REFERENCES "expiry_thresholds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demand_forecasts" ADD CONSTRAINT "demand_forecasts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_risk_assessments" ADD CONSTRAINT "lot_risk_assessments_analysis_run_id_fkey" FOREIGN KEY ("analysis_run_id") REFERENCES "analysis_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_risk_assessments" ADD CONSTRAINT "lot_risk_assessments_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_risk_assessments" ADD CONSTRAINT "lot_risk_assessments_forecast_id_fkey" FOREIGN KEY ("forecast_id") REFERENCES "demand_forecasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_proposals" ADD CONSTRAINT "treatment_proposals_risk_assessment_id_fkey" FOREIGN KEY ("risk_assessment_id") REFERENCES "lot_risk_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_proposals" ADD CONSTRAINT "treatment_proposals_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_proposals" ADD CONSTRAINT "treatment_proposals_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "analysis_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_explanations" ADD CONSTRAINT "llm_explanations_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "treatment_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_decisions" ADD CONSTRAINT "proposal_decisions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "treatment_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_decisions" ADD CONSTRAINT "proposal_decisions_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_executions" ADD CONSTRAINT "treatment_executions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "treatment_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_executions" ADD CONSTRAINT "treatment_executions_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_executions" ADD CONSTRAINT "treatment_executions_linked_outbound_id_fkey" FOREIGN KEY ("linked_outbound_id") REFERENCES "outbound_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_execution_updates" ADD CONSTRAINT "treatment_execution_updates_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "treatment_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_execution_updates" ADD CONSTRAINT "treatment_execution_updates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Manual SQL: CHECK constraints & Partial Unique Indexes (D-004, D-010..D-015)
-- ============================================================================

-- AUTH
ALTER TABLE "users"
    ADD CONSTRAINT "chk_users_status"
    CHECK ("status" IN ('active', 'locked', 'disabled'));

ALTER TABLE "roles"
    ADD CONSTRAINT "chk_roles_status"
    CHECK ("status" IN ('active', 'inactive'));

-- CATALOG
ALTER TABLE "product_groups"
    ADD CONSTRAINT "chk_product_groups_status"
    CHECK ("status" IN ('active', 'inactive'));

ALTER TABLE "products"
    ADD CONSTRAINT "chk_products_status"
    CHECK ("status" IN ('active', 'inactive'));

ALTER TABLE "suppliers"
    ADD CONSTRAINT "chk_suppliers_status"
    CHECK ("status" IN ('active', 'inactive'));

ALTER TABLE "agencies"
    ADD CONSTRAINT "chk_agencies_status"
    CHECK ("status" IN ('active', 'inactive'));

-- INBOUND
ALTER TABLE "inbound_receipts"
    ADD CONSTRAINT "chk_inbound_receipts_status"
    CHECK ("status" IN ('draft', 'confirmed', 'cancelled')),
    ADD CONSTRAINT "chk_inbound_receipts_confirmed_fields"
    CHECK (("status" <> 'confirmed') OR ("confirmed_by" IS NOT NULL AND "confirmed_at" IS NOT NULL));

ALTER TABLE "inbound_receipt_items"
    ADD CONSTRAINT "chk_inbound_receipt_items_quantity"
    CHECK ("quantity" > 0);

ALTER TABLE "lots"
    ADD CONSTRAINT "chk_lots_initial_quantity"
    CHECK ("initial_quantity" > 0),
    ADD CONSTRAINT "chk_lots_expiry_after_mfg"
    CHECK ("manufactured_date" IS NULL OR "expiry_date" > "manufactured_date"),
    ADD CONSTRAINT "chk_lots_status"
    CHECK ("status" IN ('active', 'blocked', 'closed'));

-- INVENTORY
ALTER TABLE "inventory_lot_balances"
    ADD CONSTRAINT "chk_inventory_lot_balances_on_hand_qty"
    CHECK ("on_hand_qty" >= 0);

ALTER TABLE "stock_movements"
    ADD CONSTRAINT "chk_stock_movements_type"
    CHECK ("movement_type" IN ('INBOUND', 'OUTBOUND', 'ADJUSTMENT', 'RETURN', 'DISPOSAL')),
    ADD CONSTRAINT "chk_stock_movements_quantity_delta"
    CHECK ("quantity_delta" <> 0),
    ADD CONSTRAINT "chk_stock_movements_balance_after"
    CHECK ("balance_after" >= 0),
    ADD CONSTRAINT "chk_stock_movements_source_type"
    CHECK ("source_type" IN ('INBOUND_RECEIPT', 'OUTBOUND_RECEIPT', 'STOCK_COUNT'));

ALTER TABLE "stock_counts"
    ADD CONSTRAINT "chk_stock_counts_status"
    CHECK ("status" IN ('draft', 'submitted', 'approved', 'cancelled'));

ALTER TABLE "stock_count_items"
    ADD CONSTRAINT "chk_stock_count_items_counted_qty"
    CHECK ("counted_qty" >= 0),
    ADD CONSTRAINT "chk_stock_count_items_variance_qty"
    CHECK ("variance_qty" = "counted_qty" - "system_qty");

-- OUTBOUND
ALTER TABLE "agency_orders"
    ADD CONSTRAINT "chk_agency_orders_status"
    CHECK ("status" IN ('draft', 'confirmed', 'partial', 'fulfilled', 'cancelled'));

ALTER TABLE "agency_order_items"
    ADD CONSTRAINT "chk_agency_order_items_requested_qty"
    CHECK ("requested_qty" > 0),
    ADD CONSTRAINT "chk_agency_order_items_fulfilled_qty"
    CHECK ("fulfilled_qty" >= 0 AND "fulfilled_qty" <= "requested_qty"),
    ADD CONSTRAINT "chk_agency_order_items_status"
    CHECK ("status" IN ('pending', 'partial', 'fulfilled', 'cancelled'));

ALTER TABLE "order_lot_allocations"
    ADD CONSTRAINT "chk_order_lot_allocations_qty"
    CHECK ("allocated_qty" > 0),
    ADD CONSTRAINT "chk_order_lot_allocations_status"
    CHECK ("status" IN ('allocated', 'consumed', 'released'));

ALTER TABLE "outbound_receipts"
    ADD CONSTRAINT "chk_outbound_receipts_type"
    CHECK ("outbound_type" IN ('ORDER', 'RETURN_TO_SUPPLIER', 'DISPOSAL', 'OTHER')),
    ADD CONSTRAINT "chk_outbound_receipts_order_link"
    CHECK (("outbound_type" = 'ORDER') = ("order_id" IS NOT NULL)),
    ADD CONSTRAINT "chk_outbound_receipts_status"
    CHECK ("status" IN ('draft', 'confirmed', 'cancelled')),
    ADD CONSTRAINT "chk_outbound_receipts_confirmed_fields"
    CHECK (("status" <> 'confirmed') OR ("confirmed_by" IS NOT NULL AND "confirmed_at" IS NOT NULL));

ALTER TABLE "outbound_receipt_items"
    ADD CONSTRAINT "chk_outbound_receipt_items_quantity"
    CHECK ("quantity" > 0);

-- EXPIRY
ALTER TABLE "expiry_thresholds"
    ADD CONSTRAINT "chk_expiry_thresholds_warning_days"
    CHECK ("warning_days" >= 0),
    ADD CONSTRAINT "chk_expiry_thresholds_critical_days"
    CHECK ("critical_days" >= 0 AND "critical_days" <= "warning_days"),
    ADD CONSTRAINT "chk_expiry_thresholds_effective_range"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

ALTER TABLE "expiry_alerts"
    ADD CONSTRAINT "chk_expiry_alerts_severity"
    CHECK ("severity" IN ('normal', 'warning', 'critical', 'expired')),
    ADD CONSTRAINT "chk_expiry_alerts_on_hand_qty"
    CHECK ("on_hand_qty" >= 0),
    ADD CONSTRAINT "chk_expiry_alerts_status"
    CHECK ("status" IN ('open', 'acknowledged', 'closed'));

-- AI
ALTER TABLE "analysis_runs"
    ADD CONSTRAINT "chk_analysis_runs_run_type"
    CHECK ("run_type" IN ('FORECAST', 'RISK', 'FULL')),
    ADD CONSTRAINT "chk_analysis_runs_trigger_type"
    CHECK ("trigger_type" IN ('MANUAL', 'SCHEDULED', 'STOCK_CHANGE')),
    ADD CONSTRAINT "chk_analysis_runs_status"
    CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed'));

CREATE UNIQUE INDEX "uq_analysis_runs_single_running"
    ON "analysis_runs" ((1))
    WHERE "status" = 'running';

ALTER TABLE "demand_forecasts"
    ADD CONSTRAINT "chk_demand_forecasts_qty"
    CHECK ("forecast_qty" >= 0),
    ADD CONSTRAINT "chk_demand_forecasts_baseline_qty"
    CHECK ("baseline_qty" IS NULL OR "baseline_qty" >= 0);

ALTER TABLE "lot_risk_assessments"
    ADD CONSTRAINT "chk_lot_risk_assessments_on_hand"
    CHECK ("on_hand_snapshot" >= 0),
    ADD CONSTRAINT "chk_lot_risk_assessments_surplus"
    CHECK ("estimated_surplus_qty" >= 0),
    ADD CONSTRAINT "chk_lot_risk_assessments_risk_level"
    CHECK ("risk_level" IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE "treatment_proposals"
    ADD CONSTRAINT "chk_treatment_proposals_action_type"
    CHECK ("action_type" IN ('PRIORITIZE_FEFO', 'CONTACT_AGENCY', 'RETURN_TO_SUPPLIER', 'DISPOSE', 'CONSIDER_PROMOTION')),
    ADD CONSTRAINT "chk_treatment_proposals_proposed_qty"
    CHECK ("proposed_qty" > 0),
    ADD CONSTRAINT "chk_treatment_proposals_status"
    CHECK ("status" IN ('new', 'pending', 'approved', 'rejected', 'in_progress', 'completed'));

CREATE UNIQUE INDEX "uq_treatment_proposals_active_lot_action"
    ON "treatment_proposals" ("lot_id", "action_type")
    WHERE "status" IN ('new', 'pending', 'approved', 'in_progress');

ALTER TABLE "llm_explanations"
    ADD CONSTRAINT "chk_llm_explanations_validation_status"
    CHECK ("validation_status" IN ('pending', 'valid', 'invalid', 'failed'));

ALTER TABLE "proposal_decisions"
    ADD CONSTRAINT "chk_proposal_decisions_decision"
    CHECK ("decision" IN ('approved', 'rejected')),
    ADD CONSTRAINT "chk_proposal_decisions_reject_reason"
    CHECK ("decision" <> 'rejected' OR ("reason" IS NOT NULL AND length(trim("reason")) > 0));

ALTER TABLE "treatment_executions"
    ADD CONSTRAINT "chk_treatment_executions_status"
    CHECK ("status" IN ('planned', 'in_progress', 'completed', 'failed', 'cancelled')),
    ADD CONSTRAINT "chk_treatment_executions_planned_qty"
    CHECK ("planned_qty" > 0),
    ADD CONSTRAINT "chk_treatment_executions_actual_qty"
    CHECK ("actual_qty" IS NULL OR "actual_qty" >= 0);

ALTER TABLE "treatment_execution_updates"
    ADD CONSTRAINT "chk_treatment_execution_updates_status"
    CHECK ("status" IN ('planned', 'in_progress', 'completed', 'failed', 'cancelled')),
    ADD CONSTRAINT "chk_treatment_execution_updates_actual_qty"
    CHECK ("actual_qty" IS NULL OR "actual_qty" >= 0);

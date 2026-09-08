ALTER TABLE "ai_usage_logs" ADD COLUMN "billing_snapshot" JSONB;
ALTER TABLE "ai_usage_logs" ADD COLUMN "usage_source" VARCHAR(24);
ALTER TABLE "ai_usage_logs" ADD COLUMN "billing_status" VARCHAR(24);
ALTER TABLE "ai_usage_logs" ADD COLUMN "billing_retry_at" TIMESTAMP(3);
CREATE INDEX "ai_usage_logs_billing_status_billing_retry_at_idx" ON "ai_usage_logs"("billing_status", "billing_retry_at");

-- A price change creates a new operation. Existing prices, including retired
-- versions, cannot be rewritten by a later settlement or admin configuration.
CREATE FUNCTION protect_usage_price_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.billing_snapshot IS NOT NULL AND NEW.billing_snapshot IS DISTINCT FROM OLD.billing_snapshot THEN
    RAISE EXCEPTION 'Usage price snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER usage_price_snapshot_immutable BEFORE UPDATE ON "ai_usage_logs"
FOR EACH ROW EXECUTE FUNCTION protect_usage_price_snapshot();

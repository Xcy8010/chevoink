ALTER TABLE "ai_usage_logs" ADD COLUMN "reserved_credit_milli" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage_logs" ADD COLUMN "reservation_expires_at" TIMESTAMP(3);
ALTER TABLE "ai_usage_logs" ADD COLUMN "billing_evidence" JSONB;
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "usage_reservation_nonnegative" CHECK ("reserved_credit_milli" >= 0);
CREATE INDEX "ai_usage_logs_user_id_reservation_expires_at_idx" ON "ai_usage_logs"("user_id", "reservation_expires_at");

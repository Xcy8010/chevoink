-- Agent 3.0 公测 Credits 与模型路由基础。
-- 统一使用 milli-credit（1000 milli = 1 Credit），避免小数累计误差。

ALTER TABLE "ai_usage_logs"
  ADD COLUMN "model_tier" VARCHAR(24),
  ADD COLUMN "multiplier_bps" INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN "credit_charge_milli" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "agent_runs"
  ADD COLUMN "model_tier" VARCHAR(24) NOT NULL DEFAULT 'speed';
ALTER TABLE "agent_runs"
  ADD COLUMN "custom_model_id" VARCHAR(64);
ALTER TABLE "agent_runs"
  ADD COLUMN "reasoning_effort" VARCHAR(16) NOT NULL DEFAULT 'high';

CREATE TABLE "credit_accounts" (
  "user_id" VARCHAR(64) NOT NULL,
  "daily_allowance_milli" INTEGER NOT NULL DEFAULT 800000,
  "daily_used_milli" INTEGER NOT NULL DEFAULT 0,
  "bonus_balance_milli" INTEGER NOT NULL DEFAULT 0,
  "period_started_at" TIMESTAMP(3) NOT NULL,
  "period_ends_at" TIMESTAMP(3) NOT NULL,
  "suspended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "credit_ledger_entries" (
  "id" VARCHAR(64) NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "delta_milli" INTEGER NOT NULL,
  "daily_delta_milli" INTEGER NOT NULL DEFAULT 0,
  "bonus_delta_milli" INTEGER NOT NULL DEFAULT 0,
  "kind" VARCHAR(32) NOT NULL,
  "source_type" VARCHAR(40) NOT NULL,
  "reference_id" VARCHAR(96),
  "idempotency_key" VARCHAR(160) NOT NULL,
  "model_tier" VARCHAR(24),
  "multiplier_bps" INTEGER NOT NULL DEFAULT 10000,
  "request_tokens" INTEGER,
  "response_tokens" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referral_codes" (
  "user_id" VARCHAR(64) NOT NULL,
  "code" VARCHAR(24) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "referral_redemptions" (
  "id" VARCHAR(64) NOT NULL,
  "code" VARCHAR(24) NOT NULL,
  "inviter_user_id" VARCHAR(64) NOT NULL,
  "invitee_user_id" VARCHAR(64) NOT NULL,
  "inviter_reward_milli" INTEGER NOT NULL DEFAULT 300000,
  "invitee_reward_milli" INTEGER NOT NULL DEFAULT 120000,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_system_settings" (
  "id" VARCHAR(32) NOT NULL,
  "globally_paused" BOOLEAN NOT NULL DEFAULT false,
  "daily_allowance_milli" INTEGER NOT NULL DEFAULT 800000,
  "reset_hour_utc8" INTEGER NOT NULL DEFAULT 15,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_system_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_model_configs" (
  "id" VARCHAR(64) NOT NULL,
  "owner_user_id" VARCHAR(64),
  "key" VARCHAR(96) NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "display_name" VARCHAR(80) NOT NULL,
  "model_name" VARCHAR(160) NOT NULL,
  "base_url" VARCHAR(512),
  "api_key_ciphertext" TEXT,
  "tier" VARCHAR(24),
  "multiplier_bps" INTEGER NOT NULL DEFAULT 10000,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "selectable" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_model_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_ledger_entries_idempotency_key_key" ON "credit_ledger_entries"("idempotency_key");
CREATE INDEX "credit_ledger_entries_user_id_created_at_idx" ON "credit_ledger_entries"("user_id", "created_at");
CREATE INDEX "credit_ledger_entries_source_type_created_at_idx" ON "credit_ledger_entries"("source_type", "created_at");
CREATE INDEX "credit_accounts_period_ends_at_idx" ON "credit_accounts"("period_ends_at");
CREATE INDEX "credit_accounts_suspended_at_idx" ON "credit_accounts"("suspended_at");
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");
CREATE UNIQUE INDEX "referral_redemptions_invitee_user_id_key" ON "referral_redemptions"("invitee_user_id");
CREATE INDEX "referral_redemptions_inviter_user_id_created_at_idx" ON "referral_redemptions"("inviter_user_id", "created_at");
CREATE INDEX "referral_redemptions_code_idx" ON "referral_redemptions"("code");
CREATE UNIQUE INDEX "ai_model_configs_key_key" ON "ai_model_configs"("key");
CREATE INDEX "ai_model_configs_owner_user_id_enabled_idx" ON "ai_model_configs"("owner_user_id", "enabled");
CREATE INDEX "ai_model_configs_tier_enabled_selectable_idx" ON "ai_model_configs"("tier", "enabled", "selectable");

ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_code_fkey"
  FOREIGN KEY ("code") REFERENCES "referral_codes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_inviter_user_id_fkey"
  FOREIGN KEY ("inviter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_redemptions" ADD CONSTRAINT "referral_redemptions_invitee_user_id_fkey"
  FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "credit_system_settings" ("id", "globally_paused", "daily_allowance_milli", "reset_hour_utc8", "updated_at")
VALUES ('global', false, 800000, 15, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ai_model_configs"
  ("id", "key", "provider", "display_name", "model_name", "tier", "multiplier_bps", "enabled", "selectable", "is_default", "metadata", "created_at", "updated_at")
VALUES
  ('builtin-speed', 'builtin:speed', 'deepseek', '极速', 'deepseek-v4-flash', 'speed', 10000, true, true, true, '{"reasoningEfforts":["low","high","max"],"defaultReasoningEffort":"high","visionEnabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('builtin-standard', 'builtin:standard', 'unconfigured', '标准', 'unconfigured', 'standard', 11000, false, false, false, '{"reasoningEfforts":["high"],"defaultReasoningEffort":"high","visionEnabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('builtin-performance', 'builtin:performance', 'unconfigured', '性能', 'unconfigured', 'performance', 18000, false, false, false, '{"reasoningEfforts":["high"],"defaultReasoningEffort":"high","visionEnabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('builtin-ultimate', 'builtin:ultimate', 'unconfigured', '极致', 'unconfigured', 'ultimate', 48000, false, false, false, '{"reasoningEfforts":["high"],"defaultReasoningEffort":"high","visionEnabled":false}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

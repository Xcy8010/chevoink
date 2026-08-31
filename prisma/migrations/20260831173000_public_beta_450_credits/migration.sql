ALTER TABLE "credit_accounts" ALTER COLUMN "daily_allowance_milli" SET DEFAULT 450000;
ALTER TABLE "credit_system_settings" ALTER COLUMN "daily_allowance_milli" SET DEFAULT 450000;

UPDATE "credit_system_settings"
SET "daily_allowance_milli" = 450000,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'global';

UPDATE "credit_accounts"
SET "daily_allowance_milli" = 450000,
    "updated_at" = CURRENT_TIMESTAMP;

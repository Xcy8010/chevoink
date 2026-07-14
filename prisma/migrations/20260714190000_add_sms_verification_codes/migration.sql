-- CreateEnum
CREATE TYPE "public"."SmsVerificationPurpose" AS ENUM ('login', 'register');

-- CreateTable
CREATE TABLE "public"."sms_verification_codes" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64),
    "phone" VARCHAR(32) NOT NULL,
    "purpose" "public"."SmsVerificationPurpose" NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider" VARCHAR(32) NOT NULL DEFAULT 'tencentcloud',
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_verification_codes_phone_purpose_created_at_idx" ON "public"."sms_verification_codes"("phone", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "sms_verification_codes_user_id_idx" ON "public"."sms_verification_codes"("user_id");

-- CreateIndex
CREATE INDEX "sms_verification_codes_expires_at_idx" ON "public"."sms_verification_codes"("expires_at");

-- AddForeignKey
ALTER TABLE "public"."sms_verification_codes" ADD CONSTRAINT "sms_verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

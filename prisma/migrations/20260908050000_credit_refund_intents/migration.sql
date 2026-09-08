CREATE TABLE "credit_refund_intents" (
  "original_entry_id" VARCHAR(64) PRIMARY KEY,
  "reason" VARCHAR(64) NOT NULL,
  "evidence" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMP(3),
  CONSTRAINT "credit_refund_intents_original_entry_id_fkey" FOREIGN KEY ("original_entry_id")
    REFERENCES "credit_ledger_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "credit_refund_intents_settled_at_next_attempt_at_idx"
  ON "credit_refund_intents"("settled_at", "next_attempt_at");

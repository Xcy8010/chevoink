-- 后台管理系统：用户封禁字段 + 管理操作审计日志表

ALTER TABLE "users" ADD COLUMN "banned_at" TIMESTAMP(3);

CREATE INDEX "users_banned_at_idx" ON "users" ("banned_at");

CREATE TABLE "admin_audit_logs" (
    "id" VARCHAR(64) NOT NULL,
    "admin_id" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(32),
    "target_id" VARCHAR(64),
    "detail" JSONB NOT NULL DEFAULT '{}',
    "ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs" ("created_at");

CREATE INDEX "admin_audit_logs_target_type_target_id_idx" ON "admin_audit_logs" ("target_type", "target_id");

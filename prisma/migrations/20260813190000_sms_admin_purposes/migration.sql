-- 短信验证码用途新增：管理后台手机号登录 / 管理员绑定手机号
ALTER TYPE "SmsVerificationPurpose" ADD VALUE IF NOT EXISTS 'admin_login';
ALTER TYPE "SmsVerificationPurpose" ADD VALUE IF NOT EXISTS 'admin_bind';

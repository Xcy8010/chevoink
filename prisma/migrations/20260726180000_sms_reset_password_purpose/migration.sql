-- 短信验证码用途新增：重置密码
ALTER TYPE "SmsVerificationPurpose" ADD VALUE IF NOT EXISTS 'reset_password';

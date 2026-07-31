-- 用户隐私设置：粉丝/关注/获赞/喜欢/已回复 的可见级别（公开/仅自己/仅互关）
CREATE TYPE "PrivacyLevel" AS ENUM ('public', 'private', 'mutual');

ALTER TABLE "users"
  ADD COLUMN "privacy_followers" "PrivacyLevel" NOT NULL DEFAULT 'public',
  ADD COLUMN "privacy_following" "PrivacyLevel" NOT NULL DEFAULT 'public',
  ADD COLUMN "privacy_likes" "PrivacyLevel" NOT NULL DEFAULT 'public',
  ADD COLUMN "privacy_favorites" "PrivacyLevel" NOT NULL DEFAULT 'public',
  ADD COLUMN "privacy_replies" "PrivacyLevel" NOT NULL DEFAULT 'public';

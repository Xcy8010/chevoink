DROP INDEX IF EXISTS "chapters_search_fts_idx";
DROP INDEX IF EXISTS "chapters_content_trgm_idx";
DROP INDEX IF EXISTS "chapters_summary_trgm_idx";
DROP INDEX IF EXISTS "chapters_title_trgm_idx";
DROP TABLE IF EXISTS "change_set_patches";
DROP TABLE IF EXISTS "change_sets";
DROP TYPE IF EXISTS "ChangeSetStatus";

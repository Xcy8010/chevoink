CREATE TABLE credit_rate_cards (
  id VARCHAR(64) PRIMARY KEY,
  model_tier VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  price JSONB NOT NULL,
  price_hash VARCHAR(64) NOT NULL,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revision INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT credit_rate_card_status CHECK (status IN ('draft','shadow','approved','active','retired')),
  CONSTRAINT credit_rate_card_revision CHECK (revision >= 0)
);
CREATE INDEX credit_rate_cards_model_tier_status_idx ON credit_rate_cards(model_tier,status);
CREATE UNIQUE INDEX credit_rate_cards_one_active_tier ON credit_rate_cards(model_tier) WHERE status='active';
CREATE TABLE credit_rate_card_events (
  id VARCHAR(64) PRIMARY KEY,
  rate_card_id VARCHAR(64) NOT NULL REFERENCES credit_rate_cards(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL,
  status VARCHAR(24) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  evidence JSONB NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX credit_rate_card_events_rate_card_id_revision_key ON credit_rate_card_events(rate_card_id,revision);
CREATE FUNCTION protect_credit_rate_card_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price OR NEW.price_hash IS DISTINCT FROM OLD.price_hash
    OR NEW.id IS DISTINCT FROM OLD.id OR NEW.model_tier IS DISTINCT FROM OLD.model_tier
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Rate-card price is immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credit_rate_card_immutable_price BEFORE UPDATE ON credit_rate_cards
  FOR EACH ROW EXECUTE FUNCTION protect_credit_rate_card_price();

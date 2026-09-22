-- License keys a Vlumetech admin issues for one client, which the client admin
-- redeems in their own console to apply the tier and seat limit and activate
-- the account. Previously activation was a Vlumetech action taken at a moment
-- only the client knew was right.
--
-- Only the SHA-256 of the key is stored: the plaintext is shown once at
-- generation, so a leak of this table cannot be redeemed. display_hint holds
-- the last four characters so staff can tell issued keys apart.
CREATE TABLE "license_tokens" (
  "id"            UUID PRIMARY KEY,
  "token_hash"    TEXT NOT NULL,
  "display_hint"  TEXT NOT NULL,
  "tenant_id"     UUID NOT NULL,
  "license_tier"  TEXT NOT NULL,
  "seat_limit"    INTEGER,
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"    TIMESTAMP(3) NOT NULL,
  "redeemed_at"   TIMESTAMP(3),
  "redeemed_by"   TEXT,
  "revoked_at"    TIMESTAMP(3),
  CONSTRAINT "license_tokens_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique so a hash collision or a repeated insert cannot create two keys that
-- both redeem; the lookup at redemption is by this column.
CREATE UNIQUE INDEX "license_tokens_token_hash_key" ON "license_tokens"("token_hash");
CREATE INDEX "license_tokens_tenant_id_idx" ON "license_tokens"("tenant_id");

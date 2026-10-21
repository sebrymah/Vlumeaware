-- Whether a console user has ever chosen a password.
--
-- Accounts created by an administrator start with a random, unknowable hash and
-- receive a one-time link; until that link is followed the account has no usable
-- password, yet it is neither deactivated nor locked, so the console used to show
-- it as "active". Admins then chased a password problem instead of sending a new
-- link.
--
-- Null for every existing row: we cannot know retroactively which of them chose a
-- password, and guessing would be worse than admitting the gap. The console only
-- says "no password yet" where an invitation was sent and no password has been
-- recorded since, so old rows are unaffected.

ALTER TABLE "tenant_users" ADD COLUMN "password_set_at" TIMESTAMP(3);

-- The deny feature and the untranslatable condition operators are removed: every rule is
-- now a grant whose conditions compile exactly into the list queries' WHERE clauses
-- (see `abilityWhere` in the backend). Stored rules that can no longer be expressed are
-- deleted rather than kept or loosened — removing a rule only ever *revokes* access,
-- which is the safe direction; keeping a deny as a grant, or a condition the API can no
-- longer evaluate, would widen someone's access silently.

-- Deny rules: with the feature gone they would stop denying, and a deny surviving as a
-- plain grant would *invert its own meaning*. Deleted outright.
DELETE FROM "role_permissions" WHERE "inverted" = true;--> statement-breakpoint

-- Rules whose conditions use an operator with no exact SQL translation. Matched against
-- the jsonb text form, where an operator appears as a quoted key. A string *value* that
-- happens to equal one of these names would match too — accepted, since a false positive
-- deletes a grant rather than widening one.
DELETE FROM "role_permissions"
WHERE "conditions" IS NOT NULL
  AND "conditions"::text ~ '"[$](regex|options|exists|not|nor|all|size|elemMatch|where|mod)"';--> statement-breakpoint

-- Conditions on an `all` rule: there is no single table to compile them against, so the
-- API now refuses to store them. Deleted rather than made unconditional — dropping the
-- condition would turn a narrowed wildcard into full access, the one direction a
-- migration must never widen. The operator re-grants per subject, conditions intact.
DELETE FROM "role_permissions" rp
USING "permissions" p
WHERE rp."permission_id" = p."id" AND p."subject" = 'all' AND rp."conditions" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "role_permissions" DROP COLUMN "inverted";--> statement-breakpoint
ALTER TABLE "role_permissions" DROP COLUMN "reason";

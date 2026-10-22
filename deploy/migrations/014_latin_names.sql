-- v0.3: aliases and club names are written in Latin letters (packages/shared/src/game-rules/aliases.ts,
-- LATIN_NAME_RE). The code step of this migration (database/codeSteps.ts) transliterates the aliases
-- already taken («Петя Уникум» → «Petya Unikum», a taken result gets a number) and the names, tags and
-- mottos of clubs. Nothing to change in the tables themselves.
SELECT 1;

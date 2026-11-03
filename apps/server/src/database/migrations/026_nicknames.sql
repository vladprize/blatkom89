-- v0.2.19: aliases are one word of small Latin letters, digits and _ . - (the owner: «никнеймы меняем на
-- маленькие буквы и цифры + спец символы, английский, слитно»). Adds only: the column that keeps the alias
-- an account had before (old_display_name); the code step of this migration (database/codeSteps.ts)
-- rewrites every living alias that doesn't fit («Seasoned Badger» → «seasoned_badger», the oldest account
-- keeping a name both would come to) and fills old_display_name for each one it changes. Nothing is deleted.
ALTER TABLE users ADD COLUMN IF NOT EXISTS old_display_name text CHECK (old_display_name IS NULL OR char_length(old_display_name) BETWEEN 1 AND 64);

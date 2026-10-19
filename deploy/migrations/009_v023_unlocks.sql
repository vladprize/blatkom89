-- v0.23: only the rooster and the panther stay free; the wolf (uchastkovy), the bear (mihalych) and
-- the sawn-off (obrez) are now bought with talons. Everyone who had an account keeps them — nobody
-- loses what they already played with. (Free items are implicit and never stored; these become
-- stored grants.)
INSERT INTO user_items (user_id, item_id, kind, source)
SELECT u.id, c.item_id, c.kind, 'grant'
FROM users u
CROSS JOIN (VALUES ('uchastkovy', 'character'), ('mihalych', 'character'), ('obrez', 'weapon')) AS c(item_id, kind)
WHERE u.deleted_at IS NULL
ON CONFLICT (user_id, kind, item_id) DO NOTHING;

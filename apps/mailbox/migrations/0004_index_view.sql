-- Home's index is a view, not a record (owner, 2026-10-31,
-- https://github.com/paulgsc/server/issues/509#issuecomment-6547096403):
-- home recomputes it from records it keeps, so the mailbox holds only the
-- latest per routine. When home puts a new one, `store.ts` drops the ones
-- before it in the same batch (MB1).
--
-- An item still never changes, and it still leaves `item` only into
-- `archived`, with one exception: an `index` item may go once a newer index
-- of the same routine is live. An index's name is
-- `index-<routine>-YYYYMMDDTHHMMSSmmmZ.json` (`core.ts`), so its routine is
-- the name less its last 24 characters (the stamp and `.json`), and the
-- greater name is the newer. The newest of each routine can never go, so
-- one always stays once home has put one.
DROP TRIGGER item_leaves_only_into_archived;
CREATE TRIGGER item_leaves_only_into_archived BEFORE DELETE ON item
  WHEN NOT EXISTS (
    SELECT 1 FROM archived
    WHERE archived.seq = OLD.seq AND archived.folder = OLD.folder
      AND archived.name = OLD.name AND archived.sha256 = OLD.sha256
  )
  AND NOT (
    OLD.folder = 'index' AND EXISTS (
      SELECT 1 FROM item AS newer
      WHERE newer.folder = 'index' AND newer.name > OLD.name
        AND substr(newer.name, 1, length(newer.name) - 24)
          = substr(OLD.name, 1, length(OLD.name) - 24)
    )
  )
  BEGIN SELECT RAISE(ABORT, 'an item leaves only into archived'); END;

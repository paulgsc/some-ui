-- The site's pictures (`site-assets`) are a view, as home's index is: home
-- photographs its dashboards again whenever they are wanted (#3415, C1071),
-- so the mailbox keeps only the newest picture of each kind (`server`,
-- `cores`). When home puts a new one, `store.ts` drops the ones before it in
-- the same batch (MB5).
--
-- An item still never changes, and it still leaves `item` only into
-- `archived`, with one exception per view folder: an item may go once a
-- newer item of its kind is live in the same folder. A kind is the name less
-- its stamp and extension: 24 characters for an index
-- (`YYYYMMDDTHHMMSSmmmZ.json`), 23 for a picture (`YYYYMMDDTHHMMSSmmmZ.png`
-- or `.mp4`), as `VIEWS` in `store.ts` says. The greater name is the newer,
-- so the newest of each kind can never go.
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
  AND NOT (
    OLD.folder = 'site-assets' AND EXISTS (
      SELECT 1 FROM item AS newer
      WHERE newer.folder = 'site-assets' AND newer.name > OLD.name
        AND substr(newer.name, 1, length(newer.name) - 23)
          = substr(OLD.name, 1, length(OLD.name) - 23)
    )
  )
  BEGIN SELECT RAISE(ABORT, 'an item leaves only into archived'); END;

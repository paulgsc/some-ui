-- The site's pictures (`site-assets`) are gone from the mailbox: the owner
-- moved that story (paulgsc/some-ui#3401, comment of 2026-11-23). A GitHub
-- job now draws the server and cores pictures from mock telemetry, so home
-- no longer photographs its dashboards and nothing carries them here. That
-- moves C1071, which added the folder and 0005's case for it; home never put
-- a picture, so no item is in the folder.
--
-- 0005 stays as it was applied. This recreates the delete trigger exactly as
-- 0005 has it, less the `site-assets` case: an item still never changes, and
-- it still leaves `item` only into `archived`, with one exception, home's
-- index, which may go once a newer index of its routine is live (0004, MB5).
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

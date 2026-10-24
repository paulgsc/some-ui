-- The folders are `FOLDERS` in `src/core.ts`; the table no longer repeats the
-- list, so a folder is added in code (owner, 2026-10-23: the routine's word
-- sets and dramas go through the mailbox, as `scene` and `drama`).
--
-- SQLite cannot change a CHECK in place, so `item` is rebuilt with every row,
-- seq and byte as it was, and its triggers recreated (MB1). The next seq
-- continues from the highest the old table ever handed out (every archived
-- seq among them), so no new item can take an archived item's seq.
CREATE TABLE item_next (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,  -- the cursor readers page by
  folder       TEXT NOT NULL,                      -- one of core.ts's FOLDERS
  name         TEXT NOT NULL,
  sha256       TEXT NOT NULL,                      -- hex of body
  size         INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  body         BLOB NOT NULL,
  put_by       TEXT NOT NULL CHECK (put_by IN ('routine','home')),
  put_at       TEXT NOT NULL,                      -- RFC3339 ms Z
  UNIQUE (folder, name)
);
INSERT INTO item_next (seq, folder, name, sha256, size, content_type, body, put_by, put_at)
  SELECT seq, folder, name, sha256, size, content_type, body, put_by, put_at FROM item;
UPDATE sqlite_sequence
  SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'item'), 0))
  WHERE name = 'item_next';
DROP TABLE item;
ALTER TABLE item_next RENAME TO item;

CREATE TRIGGER item_is_append_only_update BEFORE UPDATE ON item
  BEGIN SELECT RAISE(ABORT, 'item is append-only'); END;
CREATE TRIGGER item_leaves_only_into_archived BEFORE DELETE ON item
  WHEN NOT EXISTS (
    SELECT 1 FROM archived
    WHERE archived.seq = OLD.seq AND archived.folder = OLD.folder
      AND archived.name = OLD.name AND archived.sha256 = OLD.sha256
  )
  BEGIN SELECT RAISE(ABORT, 'an item leaves only into archived'); END;
CREATE TRIGGER item_keeps_an_archived_name BEFORE INSERT ON item
  WHEN EXISTS (
    SELECT 1 FROM archived
    WHERE archived.folder = NEW.folder AND archived.name = NEW.name
      AND archived.sha256 <> NEW.sha256
  )
  BEGIN SELECT RAISE(ABORT, 'an archived name keeps its bytes'); END;

-- Archiving: README.md, "Archiving: home keeps the record", and MB1.

-- One row per item archived, keyed by the seq it had while it was live. A
-- restored item gets a new seq, so archiving it again adds a new row. Never
-- updated or deleted.
CREATE TABLE archived (
  seq          INTEGER PRIMARY KEY,
  folder       TEXT NOT NULL,
  name         TEXT NOT NULL,
  sha256       TEXT NOT NULL,
  size         INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  put_by       TEXT NOT NULL,
  put_at       TEXT NOT NULL,                      -- when it was first put
  archived_at  TEXT NOT NULL                       -- RFC3339 ms Z
);
CREATE INDEX archived_name ON archived (folder, name);
CREATE INDEX archived_folder_seq ON archived (folder, seq);
CREATE TRIGGER archived_is_append_only_update BEFORE UPDATE ON archived
  BEGIN SELECT RAISE(ABORT, 'archived is append-only'); END;
CREATE TRIGGER archived_is_append_only_delete BEFORE DELETE ON archived
  BEGIN SELECT RAISE(ABORT, 'archived is append-only'); END;

-- One row per item put back from home: its new seq, and when. Never updated
-- or deleted.
CREATE TABLE restored (
  seq          INTEGER PRIMARY KEY,
  restored_at  TEXT NOT NULL                       -- RFC3339 ms Z
);
CREATE TRIGGER restored_is_append_only_update BEFORE UPDATE ON restored
  BEGIN SELECT RAISE(ABORT, 'restored is append-only'); END;
CREATE TRIGGER restored_is_append_only_delete BEFORE DELETE ON restored
  BEGIN SELECT RAISE(ABORT, 'restored is append-only'); END;

-- The routine's open asks for an archived item. A request, not a record: its
-- row goes when the item is back.
CREATE TABLE wanted (
  folder       TEXT NOT NULL,
  name         TEXT NOT NULL,
  asked_at     TEXT NOT NULL,                      -- RFC3339 ms Z
  PRIMARY KEY (folder, name)
);

-- An item still never changes, and it leaves `item` only once `archived`
-- holds its row: same seq, folder, name and hash.
DROP TRIGGER item_is_append_only_delete;
CREATE TRIGGER item_leaves_only_into_archived BEFORE DELETE ON item
  WHEN NOT EXISTS (
    SELECT 1 FROM archived
    WHERE archived.seq = OLD.seq AND archived.folder = OLD.folder
      AND archived.name = OLD.name AND archived.sha256 = OLD.sha256
  )
  BEGIN SELECT RAISE(ABORT, 'an item leaves only into archived'); END;

-- An archived name keeps its bytes: only the same ones go back in.
CREATE TRIGGER item_keeps_an_archived_name BEFORE INSERT ON item
  WHEN EXISTS (
    SELECT 1 FROM archived
    WHERE archived.folder = NEW.folder AND archived.name = NEW.name
      AND archived.sha256 <> NEW.sha256
  )
  BEGIN SELECT RAISE(ABORT, 'an archived name keeps its bytes'); END;

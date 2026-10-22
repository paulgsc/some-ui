CREATE TABLE item (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,  -- the cursor readers page by
  folder       TEXT NOT NULL CHECK (folder IN ('brief','decisions','scout')),
  name         TEXT NOT NULL,
  sha256       TEXT NOT NULL,                      -- hex of body
  size         INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  body         BLOB NOT NULL,
  put_by       TEXT NOT NULL CHECK (put_by IN ('routine','home')),
  put_at       TEXT NOT NULL,                      -- RFC3339 ms Z
  UNIQUE (folder, name)
);
CREATE TRIGGER item_is_append_only_update BEFORE UPDATE ON item
  BEGIN SELECT RAISE(ABORT, 'item is append-only'); END;
CREATE TRIGGER item_is_append_only_delete BEFORE DELETE ON item
  BEGIN SELECT RAISE(ABORT, 'item is append-only'); END;

-- Allow neighborhood renames after combine (absorbed soft-deleted rows used to
-- keep the old unique name and block survivor rename).
DROP INDEX IF EXISTS "Neighborhood_name_key";

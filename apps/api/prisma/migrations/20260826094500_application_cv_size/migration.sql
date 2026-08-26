-- The card names the CV by filename and size (hiring 04 §07.32). The size is recorded
-- at upload rather than read back out of storage on every page load; rows booked before
-- this column existed keep a null, which the card renders as a filename with no size.
-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "cvSizeBytes" INTEGER;

-- Add stitch job type for chunk stitching worker
ALTER TYPE "job_type" ADD VALUE IF NOT EXISTS 'stitch';

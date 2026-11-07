-- Account settings: password change invalidates older sign-ins; temporary passwords must be replaced.
ALTER TABLE "User"
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

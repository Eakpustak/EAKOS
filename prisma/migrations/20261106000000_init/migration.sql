-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DEACTIVATED');
CREATE TYPE "SystemRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "MembershipType" AS ENUM ('HEAD', 'MEMBER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "systemRole" "SystemRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DepartmentMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "type" "MembershipType" NOT NULL DEFAULT 'MEMBER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DepartmentMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "outcome" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");
CREATE UNIQUE INDEX "Department_slug_key" ON "Department"("slug");
CREATE INDEX "DepartmentMembership_departmentId_idx" ON "DepartmentMembership"("departmentId");
CREATE UNIQUE INDEX "DepartmentMembership_userId_departmentId_key" ON "DepartmentMembership"("userId", "departmentId");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

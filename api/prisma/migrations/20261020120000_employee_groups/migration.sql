-- Employee groups: named, tenant-scoped sets of employees for segmented /
-- targeted phishing (and later, targeted training). Many-to-many so an employee
-- can belong to several groups. tenant_id is denormalised onto both tables so
-- the query-layer tenant guard can scope them.

-- CreateTable
CREATE TABLE "employee_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_group_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_groups_tenant_id_idx" ON "employee_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_groups_tenant_id_name_key" ON "employee_groups"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "employee_group_members_tenant_id_idx" ON "employee_group_members"("tenant_id");

-- CreateIndex
CREATE INDEX "employee_group_members_group_id_idx" ON "employee_group_members"("group_id");

-- CreateIndex
CREATE INDEX "employee_group_members_employee_id_idx" ON "employee_group_members"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_group_members_group_id_employee_id_key" ON "employee_group_members"("group_id", "employee_id");

-- AddForeignKey
ALTER TABLE "employee_groups" ADD CONSTRAINT "employee_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_group_members" ADD CONSTRAINT "employee_group_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_group_members" ADD CONSTRAINT "employee_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "employee_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_group_members" ADD CONSTRAINT "employee_group_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

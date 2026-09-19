-- Campaign recipient targeting: empty array = all employees.
ALTER TABLE "campaigns" ADD COLUMN "target_employee_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

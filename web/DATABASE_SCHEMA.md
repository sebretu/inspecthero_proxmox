# Complete Database Schema
Generated: 2026-02-06T06:06:05.501Z

## Tables Summary

| Table | Column Count | Description |
|-------|--------------|-------------|
| profiles | 9 | ✅ Exists |
| tasks | 23 | ✅ Exists |
| task_photos | 8 | ✅ Exists |
| task_comments | 0 | ✅ Exists |
| companies | 6 | ✅ Exists |
| projects | 9 | ✅ Exists |


## Detailed Column Listing


### profiles

**Columns:** 9

- `id`
- `company_id`
- `email`
- `full_name`
- `role`
- `language`
- `is_active`
- `created_at`
- `updated_at`

### tasks

**Columns:** 23

- `id`
- `project_id`
- `plan_id`
- `x_norm`
- `y_norm`
- `title`
- `description`
- `priority`
- `status`
- `due_date`
- `assigned_company_id`
- `assigned_user_id`
- `created_by`
- `done_reported_by`
- `done_reported_at`
- `done_note`
- `approved_by`
- `approved_at`
- `rejected_by`
- `rejected_at`
- `rejection_reason`
- `created_at`
- `updated_at`

### task_photos

**Columns:** 8

- `id`
- `task_id`
- `url`
- `caption`
- `uploaded_by`
- `created_at`
- `storage_bucket`
- `storage_path`

### companies

**Columns:** 6

- `id`
- `name`
- `slug`
- `is_active`
- `created_at`
- `updated_at`

### projects

**Columns:** 9

- `id`
- `company_id`
- `name`
- `address`
- `is_archived`
- `created_by`
- `created_at`
- `updated_at`
- `description`


## Missing Tables

All required tables exist! ✅

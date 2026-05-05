-- Add parent_id to manual_entries for écheancier/amortissement sub-rows
alter table manual_entries
  add column if not exists parent_id uuid references manual_entries(id) on delete cascade;

create index if not exists idx_manual_entries_parent on manual_entries(parent_id);

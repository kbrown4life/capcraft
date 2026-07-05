# CapCraft Release 0.2.2

## Fixes

- Added a **Finish Profile** flow for users whose Supabase Auth account exists but whose `profiles` row was not created.
- Removed email fallback from the top navigation. The app now uses display name / username only.
- Changed account creation behavior for email-verification projects: users verify email, sign in, then complete public GM profile.
- Added `003_profile_recovery.sql` migration to reinforce insert/update profile RLS policies.

## Why this was needed

Supabase email verification can create an Auth user before the app is allowed to insert the matching public profile row. Release 0.2.2 handles that state instead of leaving the user stuck.

## Test checklist

- Sign in with the verified user.
- If prompted, finish profile with username + display name.
- Confirm top navigation shows display name or username, not email.
- Create a league.
- Confirm league appears on Dashboard.


## Release 0.2.3

- Removed PostgreSQL `crypt()` / `gen_salt()` dependency from league creation and joining.
- Added browser-side SHA-256 league password hashing for the MVP.
- Added `004_app_side_league_passwords.sql` migration to replace the affected RPC functions.
- Updated README troubleshooting for `.env.local` and the Supabase password patch.

Known technical note: browser-side hashing is acceptable for this MVP prototype, but a future production release should move league-password hashing/verification into a server-side API or Supabase Edge Function.

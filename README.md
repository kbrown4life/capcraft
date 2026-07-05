# CapCraft Release 0.2.1

This release adds the first Supabase-ready foundation for CapCraft.

It includes:

- Account flow with email, username, and display name
- Sign in / sign out flow
- Create League wizard
- Join League flow using League Name + League Password
- Commissioner/franchise architecture
- Scoring category checklist instead of free-text categories
- SQL migrations for Supabase
- Notifications and audit-log tables for future releases

## Should you set up Supabase now?

Yes, but only after you confirm the site still runs locally.

Do **not** do GitHub or Netlify yet.

The correct order is:

1. Run locally without Supabase
2. Set up Supabase
3. Connect Supabase locally
4. Test account creation and league creation locally
5. Then later do GitHub + Netlify

Why: GitHub and Netlify are deployment steps. Supabase is the actual app database. We should prove the app works locally with Supabase before deploying it.

---

# Part 1 — Run locally first

## Step 1 — Unzip the folder

Unzip `capcraft-release-0.2.1.zip` into Downloads or Desktop.

You should have a folder named something like:

```text
capcraft-release-0.2.1
```

## Step 2 — Open the folder in VS Code

Open VS Code.

Click:

```text
File → Open Folder
```

Select the `capcraft-release-0.2.1` folder.

## Step 3 — Open Terminal

At the top of VS Code, click:

```text
Terminal → New Terminal
```

A Terminal box opens at the bottom.

## Step 4 — Force npm to use the public registry

Copy this line into Terminal and press Enter:

```bash
npm config set registry https://registry.npmjs.org/
```

## Step 5 — Install packages

Run:

```bash
npm install
```

The first install can take several minutes. If it only shows a spinner, wait at least 5 minutes.

## Step 6 — Start the local site

Run:

```bash
npm run dev
```

Open this address in Chrome:

```text
http://localhost:5173
```

At this point the app should work in **Local Preview Mode**. Nothing saves yet.

---

# Part 2 — Create the Supabase project

## Step 1 — Go to Supabase

Open Supabase in your browser and sign in.

Create a new project.

Suggested project name:

```text
CapCraft
```

Choose a database password and save it somewhere safe. You probably will not need it often, but do not lose it.

Wait until Supabase finishes creating the project.

## Step 2 — Open the SQL Editor

Inside your Supabase project, look at the left menu.

Click:

```text
SQL Editor
```

Then click:

```text
New query
```

---

# Part 3 — Run the database migrations

The project folder has this folder:

```text
supabase/migrations
```

Inside are two SQL files:

```text
001_core_schema.sql
002_league_functions.sql
```

You need to run them in Supabase in order.

## Migration 1

In VS Code, open:

```text
supabase → migrations → 001_core_schema.sql
```

Select all the text in that file:

```text
Command + A
```

Copy it:

```text
Command + C
```

Go back to Supabase SQL Editor.

Paste it into the query box:

```text
Command + V
```

Click:

```text
Run
```

Wait for it to finish.

## Migration 2

Now open this file in VS Code:

```text
supabase → migrations → 002_league_functions.sql
```

Select all, copy it, paste it into a new Supabase SQL Editor query, and click **Run**.

Run file 1 first. Run file 2 second.

---

# Part 4 — Get your Supabase URL and anon key

In Supabase, look at the left menu.

Click:

```text
Project Settings
```

Then click:

```text
API
```

Find these two values:

```text
Project URL
anon public key
```

You need both.

Do not paste these keys into ChatGPT. They are safe to use in your local project and later Netlify, but you should not post them publicly.

---

# Part 5 — Create your .env.local file

In VS Code, make sure you are in the main project folder.

You should see files like:

```text
package.json
index.html
src
supabase
```

Right-click in the file list and choose:

```text
New File
```

Name the file exactly:

```text
.env.local
```

Important: the file name starts with a dot.

Paste this inside:

```bash
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Replace `your_project_url_here` with your actual Supabase Project URL.

Replace `your_anon_key_here` with your actual anon public key.

Save the file.

---

# Part 6 — Restart the local site

Go to the Terminal in VS Code.

Stop the current dev server:

```text
Control + C
```

Then run:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

If the Supabase keys are working, the yellow Local Preview Mode banner should disappear.

---

# Part 7 — What to test in connected mode

Test this exact flow:

1. Click **Start a League**
2. Click **Sign In / Create Account** if prompted
3. Create an account with:
   - Email
   - Username
   - Display Name
   - Password
4. Create a league
5. Choose categories from the checklist
6. Finish the league creation wizard
7. Confirm the dashboard shows your league
8. Sign out
9. Sign back in
10. Confirm your profile/league still exists

If that works, Release 0.2 is doing its job.

---

# GitHub and Netlify — not yet

Do not connect GitHub and Netlify yet.

We will do that after Supabase works locally.

The later deployment order will be:

1. Create GitHub repo
2. Upload/push CapCraft code
3. Connect Netlify to GitHub
4. Add the same Supabase environment variables in Netlify
5. Deploy
6. Update Supabase Auth URLs to include the Netlify site

That comes after this local Supabase test.

---

# Common problems

## npm install hangs

Wait at least 5 minutes first.

If it still seems stuck, stop with **Control + C** and run:

```bash
npm config set registry https://registry.npmjs.org/
npm cache clean --force
npm install
```

## Supabase says `function does not exist`

You probably did not run `002_league_functions.sql`, or it failed.

Run both migrations again, in order.

## Supabase says `table does not exist`

You probably did not run `001_core_schema.sql`, or it failed.

Run migration 1 first, then migration 2.

## Local Preview Mode banner is still showing

Check that `.env.local` is named exactly right.

Wrong examples:

```text
env.local
.env
.env.local.txt
```

Correct:

```text
.env.local
```

Then stop and restart the dev server.

## Account creation works but profile fails

The username may already be taken or may use invalid characters.

Valid username examples:

```text
kevinbrown
fresh24
kevin_brown
```

Invalid examples:

```text
kevin brown
kevin-brown
kb!
```

Usernames should be 3–20 characters using only letters, numbers, and underscores.

## Release 0.2.2 Profile Recovery Patch

If you created an account but the `profiles` table is empty, run this extra migration:

1. Open Supabase.
2. Go to **SQL Editor**.
3. Open `supabase/migrations/003_profile_recovery.sql` from this project.
4. Copy the full file into Supabase.
5. Click **Run**.
6. Go back to CapCraft and sign in.
7. The app should show **Finish Profile**. Enter username + display name and save.

After that, create league should work.

Important: your email should never be displayed publicly after the profile is saved. CapCraft should show display name first, then username.


## Release 0.2.3 database patch

If you previously saw this error while creating a league:

```text
function gen_salt(unknown) does not exist
```

run this file in Supabase SQL Editor:

```text
supabase/migrations/004_app_side_league_passwords.sql
```

This changes league password handling so the app creates a password hash before sending it to Supabase. Supabase stores the hash and compares it during Join League. You do not need to enable the `pgcrypto` extension for league password checks.

## Local environment reminder

Keep your `.env.local` file in the project folder. Do not delete it when replacing files. It should contain:

```text
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Save the file with Command + S, then restart the local server.

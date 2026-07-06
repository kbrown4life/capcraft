import React, { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { TopNav, Shell, Panel, StatusPill } from './components/Layout';
import { Field, PrimaryButton, SecondaryButton, SelectField } from './components/Forms';
import { FeedList, StandingsTable } from './components/Tables';
import { demoFeed, demoStandings, defaultCategories, optionalCategories, categoryLabels } from './data/demo';
import { formatMoney } from './lib/money';
import { PALETTE, paletteByKey, autoMonogram } from './lib/palette';


async function hashLeaguePassword(leagueName, password) {
  const normalizedLeague = leagueName.trim().toLowerCase();
  const normalizedPassword = password.trim();
  const payload = `capcraft:v1:${normalizedLeague}:${normalizedPassword}`;
  const data = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return `cc_sha256_v1_${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

const initialSettings = {
  teams: '12',
  salaryCap: '200',
  minSalary: '2.5',
  signingBonusPool: '10',
  buyoutPercent: '50',
  playoffTeams: '6',
  draftOrder: 'lottery'
};

export default function App() {
  const [route, setRoute] = useState('Home');
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState('');
  const [leagues, setLeagues] = useState([]);
  const [profileMissing, setProfileMissing] = useState(false);
  const [activeLeagueId, setActiveLeagueId] = useState(null);

  const openLeague = (id) => {
    setActiveLeagueId(id);
    setRoute('League');
  };

  const user = profile;
  const isSignedIn = Boolean(session?.user);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadProfileAndLeagues() {
      if (!isSupabaseConfigured || !session?.user) return;
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileError) {
        setMessage(profileError.message);
        return;
      }

      if (!profileData) {
        setProfile(null);
        setProfileMissing(true);
        setLeagues([]);
        setRoute((current) => (current === 'Home' || current === 'Auth' ? current : 'Finish Profile'));
        return;
      }

      setProfile(profileData);
      setProfileMissing(false);
      const { data: leagueRows } = await supabase
        .from('franchise_owners')
        .select('franchise:franchises(id,name, league:leagues(id,name,slug))')
        .eq('user_id', session.user.id);
      setLeagues((leagueRows || []).map((row) => row.franchise?.league).filter(Boolean));
    }
    loadProfileAndLeagues();
  }, [session]);

  const handleLogout = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setMessage('Signed out.');
    setRoute('Home');
  };

  return (
    <>
      <TopNav route={route} setRoute={setRoute} user={user} onLogout={handleLogout} />
      <Shell>
        {!isSupabaseConfigured && <DemoBanner />}
        {message && <div className="notice">{message}</div>}
        {route === 'Home' && <Home setRoute={setRoute} />}
        {route === 'Auth' && <AuthPage setRoute={setRoute} setMessage={setMessage} setProfile={setProfile} />}
        {route === 'Finish Profile' && <FinishProfile session={session} setProfile={setProfile} setProfileMissing={setProfileMissing} setRoute={setRoute} setMessage={setMessage} />}
        {profileMissing && route !== 'Finish Profile' && isSignedIn && <ProfileBanner setRoute={setRoute} />}
        {route === 'Create League' && <CreateLeague user={user} isSignedIn={isSignedIn} setRoute={setRoute} setMessage={setMessage} />}
        {route === 'Join League' && <JoinLeague user={user} isSignedIn={isSignedIn} setRoute={setRoute} setMessage={setMessage} />}
        {route === 'Dashboard' && <Dashboard user={user} isSignedIn={isSignedIn} leagues={leagues} setRoute={setRoute} openLeague={openLeague} />}
        {route === 'League' && <LeagueDetail leagueId={activeLeagueId} userId={session?.user?.id} setRoute={setRoute} />}
      </Shell>
    </>
  );
}

function DemoBanner() {
  return (
    <div className="demo-banner">
      <strong>Local preview mode.</strong> Supabase keys are not configured yet, so forms simulate the flow. Add keys to <code>.env.local</code> to connect real auth and league storage.
    </div>
  );
}

function Home({ setRoute }) {
  return (
    <div className="home-grid">
      <section className="hero">
        <div className="eyebrow">Dynasty Basketball • Front Office Simulator</div>
        <h1>Run an NBA franchise, not a waiver wire.</h1>
        <p>CapCraft turns fantasy basketball into a contract, salary-cap, draft-pick, and league-history game.</p>
        <div className="hero-actions">
          <PrimaryButton onClick={() => setRoute('Create League')}>Start a League</PrimaryButton>
          <SecondaryButton onClick={() => setRoute('Join League')}>Join a League</SecondaryButton>
        </div>
      </section>

      <Panel eyebrow="Product Preview" title="In-season command center" className="span-2">
        <div className="preview-grid">
          <div>
            <div className="score-strip">
              <div><span>Week 8 Matchup</span><strong>Orlando leads Chicago</strong></div>
              <div className="record-large">6-2-1</div>
            </div>
            <div className="cat-grid">
              {['PTS +42', 'REB +18', 'AST +11', 'STL -3', 'BLK +4', '3PM +9', 'FG% .491', 'FT% .812', 'TO tied'].map((cat) => <span key={cat}>{cat}</span>)}
            </div>
          </div>
          <StandingsTable rows={demoStandings.slice(0, 6)} />
        </div>
      </Panel>

      <Panel eyebrow="System Preview" title="Startup War Room" className="span-2">
        <div className="war-math">
          <div><span>Salary Cap</span><strong>{formatMoney(200)}</strong></div>
          <div><span>Signed Salary</span><strong>{formatMoney(118.5)}</strong></div>
          <div><span>Pending Offers</span><strong>{formatMoney(49.5)}</strong></div>
          <div><span>Open Spots After Pending</span><strong>9</strong></div>
          <div><span>Required Holds</span><strong>{formatMoney(22.5)}</strong></div>
          <div><span>Available To Bid</span><strong>{formatMoney(9.5)}</strong></div>
        </div>
        <p className="logic-note">Every pending offer is treated as won. Empty roster slots hold {formatMoney(2.5)} each.</p>
      </Panel>

      <Panel eyebrow="League Wire" title="Everything becomes history">
        <FeedList items={demoFeed} />
      </Panel>
    </div>
  );
}

function AuthPage({ setRoute, setMessage, setProfile }) {
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const usernameValid = /^[a-zA-Z0-9_]{3,20}$/.test(username) || mode === 'sign-in';

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!isSupabaseConfigured) {
        setProfile({ username: username || email.split('@')[0], display_name: displayName || username || 'Demo GM' });
        setMessage(mode === 'create' ? 'Demo account created.' : 'Demo sign in complete.');
        setRoute('Dashboard');
        return;
      }
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage('Signed in.');
        setRoute('Dashboard');
      } else {
        if (!usernameValid) throw new Error('Username must be 3–20 characters using letters, numbers, or underscores.');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              requested_username: username.toLowerCase(),
              requested_display_name: displayName || username
            }
          }
        });
        if (error) throw error;
        if (data.session && data.user) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            username: username.toLowerCase(),
            display_name: displayName || username
          });
          if (profileError) throw profileError;
          setMessage('Account created.');
          setRoute('Dashboard');
        } else {
          setMessage('Account created. Verify your email, then sign in and finish your profile.');
          setMode('sign-in');
        }
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <Panel eyebrow={mode === 'create' ? 'Create Account' : 'Sign In'} title="Enter the front office">
        <form className="form-stack" onSubmit={submit}>
          <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
          {mode === 'create' && (
            <>
              <Field label="Username" value={username} onChange={setUsername} placeholder="fresh24" helper="3–20 characters. Letters, numbers, underscore." />
              <Field label="Display Name" value={displayName} onChange={setDisplayName} placeholder="Kevin Brown" helper="Shown in league feed and trade screens." />
            </>
          )}
          <Field label="Password" value={password} onChange={setPassword} type="password" />
          <PrimaryButton type="submit" disabled={busy || !email || !password || !usernameValid}>{busy ? 'Working...' : mode === 'create' ? 'Create Account' : 'Sign In'}</PrimaryButton>
        </form>
        <button className="text-btn auth-toggle" onClick={() => setMode(mode === 'create' ? 'sign-in' : 'create')}>
          {mode === 'create' ? 'Already have an account? Sign in.' : 'Need an account? Create one.'}
        </button>
      </Panel>
    </div>
  );
}

function CreateLeague({ user, isSignedIn, setRoute, setMessage }) {
  const [step, setStep] = useState(1);
  const [leagueName, setLeagueName] = useState('Orlando Dynasty');
  const [leaguePassword, setLeaguePassword] = useState('');
  const [teamName, setTeamName] = useState('Orlando Sentinels');
  const [settings, setSettings] = useState(initialSettings);
  const [categories, setCategories] = useState(defaultCategories);
  const [busy, setBusy] = useState(false);

  const updateSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const toggleCategory = (category) => {
    setCategories((current) => {
      if (current.includes(category)) {
        if (current.length <= 1) return current;
        return current.filter((item) => item !== category);
      }
      return [...current, category];
    });
  };

  const createLeague = async () => {
    if (!user) { setRoute(isSignedIn ? 'Finish Profile' : 'Auth'); return; }
    setBusy(true);
    setMessage('');
    try {
      if (!isSupabaseConfigured) {
        setMessage('Demo league created. Supabase will store this for real in connected mode.');
        setRoute('Dashboard');
        return;
      }
      const leaguePasswordHash = await hashLeaguePassword(leagueName, leaguePassword);
      const { data, error } = await supabase.rpc('create_league_with_commissioner', {
        p_league_name: leagueName,
        p_league_password_hash: leaguePasswordHash,
        p_team_name: teamName,
        p_settings: settings,
        p_categories: categories
      });
      if (error) throw error;
      setMessage(`League created: ${data?.league_name || leagueName}`);
      setRoute('Dashboard');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <Gate title="Start a League" setRoute={setRoute} isSignedIn={isSignedIn} />;

  return (
    <div className="wizard">
      <Panel eyebrow={`Step ${step} of 3`} title="Create League">
        {step === 1 && <div className="form-stack">
          <Field label="League Name" value={leagueName} onChange={setLeagueName} />
          <Field label="League Password" value={leaguePassword} onChange={setLeaguePassword} type="password" helper="Managers need this to join." />
          <Field label="Your Franchise Name" value={teamName} onChange={setTeamName} />
        </div>}
        {step === 2 && <div className="settings-grid">
          <Field label="Teams" value={settings.teams} onChange={(v) => updateSetting('teams', v)} />
          <Field label="Salary Cap ($m)" value={settings.salaryCap} onChange={(v) => updateSetting('salaryCap', v)} />
          <Field label="Minimum Salary ($m)" value={settings.minSalary} onChange={(v) => updateSetting('minSalary', v)} />
          <Field label="Signing Bonus Pool ($m)" value={settings.signingBonusPool} onChange={(v) => updateSetting('signingBonusPool', v)} />
          <Field label="Buyout Percent" value={settings.buyoutPercent} onChange={(v) => updateSetting('buyoutPercent', v)} />
          <Field label="Playoff Teams" value={settings.playoffTeams} onChange={(v) => updateSetting('playoffTeams', v)} />
          <SelectField label="Draft Order" value={settings.draftOrder} onChange={(v) => updateSetting('draftOrder', v)}>
            <option value="lottery">Lottery</option>
            <option value="reverse">Reverse Standings</option>
          </SelectField>
          <CategoryChecklist selected={categories} onToggle={toggleCategory} />
        </div>}
        {step === 3 && <Review leagueName={leagueName} teamName={teamName} settings={settings} categories={categories} />}
        <div className="wizard-actions">
          {step > 1 && <SecondaryButton onClick={() => setStep(step - 1)}>Back</SecondaryButton>}
          {step < 3 && <PrimaryButton onClick={() => setStep(step + 1)}>Continue</PrimaryButton>}
          {step === 3 && <PrimaryButton onClick={createLeague} disabled={busy}>{busy ? 'Creating...' : 'Create League'}</PrimaryButton>}
        </div>
      </Panel>
    </div>
  );
}

function Review({ leagueName, teamName, settings, categories }) {
  return <div className="review-grid">
    <div><span>League</span><strong>{leagueName}</strong></div>
    <div><span>Your Franchise</span><strong>{teamName}</strong></div>
    <div><span>Teams</span><strong>{settings.teams}</strong></div>
    <div><span>Salary Cap</span><strong>{formatMoney(settings.salaryCap)}</strong></div>
    <div><span>Minimum Salary</span><strong>{formatMoney(settings.minSalary)}</strong></div>
    <div><span>Bonus Pool</span><strong>{formatMoney(settings.signingBonusPool)}</strong></div>
    <div className="review-span"><span>Categories</span><strong>{categories.join(' / ')}</strong></div>
  </div>;
}

function CategoryChecklist({ selected, onToggle }) {
  const allCategories = [...defaultCategories, ...optionalCategories];
  return (
    <div className="category-picker">
      <div className="category-header">
        <span>Scoring Categories</span>
        <small>{selected.length} selected</small>
      </div>
      <div className="category-options">
        {allCategories.map((category) => (
          <label className={selected.includes(category) ? 'category-option selected' : 'category-option'} key={category}>
            <input
              type="checkbox"
              checked={selected.includes(category)}
              onChange={() => onToggle(category)}
            />
            <strong>{category}</strong>
            <span>{categoryLabels[category]}</span>
          </label>
        ))}
      </div>
      <p className="logic-note">Standard 9-cat is selected by default. Commissioners can add specialty categories like double-doubles or minutes.</p>
    </div>
  );
}

function JoinLeague({ user, isSignedIn, setRoute, setMessage }) {
  const [leagueName, setLeagueName] = useState('');
  const [leaguePassword, setLeaguePassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [busy, setBusy] = useState(false);

  const join = async (event) => {
    event.preventDefault();
    if (!user) { setRoute(isSignedIn ? 'Finish Profile' : 'Auth'); return; }
    setBusy(true);
    try {
      if (!isSupabaseConfigured) {
        setMessage('Demo join complete. Connected mode will verify the league name and password.');
        setRoute('Dashboard');
        return;
      }
      const leaguePasswordHash = await hashLeaguePassword(leagueName, leaguePassword);
      const { data, error } = await supabase.rpc('join_league_by_name', {
        p_league_name: leagueName,
        p_league_password_hash: leaguePasswordHash,
        p_team_name: teamName
      });
      if (error) throw error;
      setMessage(`Joined ${data?.league_name || leagueName}.`);
      setRoute('Dashboard');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <Gate title="Join a League" setRoute={setRoute} isSignedIn={isSignedIn} />;

  return <div className="auth-wrap"><Panel eyebrow="Join League" title="Enter league credentials">
    <form className="form-stack" onSubmit={join}>
      <Field label="League Name" value={leagueName} onChange={setLeagueName} />
      <Field label="League Password" value={leaguePassword} onChange={setLeaguePassword} type="password" />
      <Field label="Your Franchise Name" value={teamName} onChange={setTeamName} placeholder="Orlando Sentinels" />
      <PrimaryButton type="submit" disabled={busy || !leagueName || !leaguePassword || !teamName}>{busy ? 'Joining...' : 'Join League'}</PrimaryButton>
    </form>
  </Panel></div>;
}

function Gate({ title, setRoute, isSignedIn }) {
  return <div className="auth-wrap"><Panel eyebrow={isSignedIn ? 'Profile Required' : 'Account Required'} title={title}>
    <p className="muted">{isSignedIn ? 'Finish your public GM profile before creating or joining leagues.' : 'Create an account or sign in first. Your email stays private; your username and display name appear inside leagues.'}</p>
    <PrimaryButton onClick={() => setRoute(isSignedIn ? 'Finish Profile' : 'Auth')}>{isSignedIn ? 'Finish Profile' : 'Sign In / Create Account'}</PrimaryButton>
  </Panel></div>;
}

function ProfileBanner({ setRoute }) {
  return <div className="demo-banner warning"><strong>Profile incomplete.</strong> Create your username and display name before creating or joining leagues. <button className="text-btn" onClick={() => setRoute('Finish Profile')}>Finish Profile</button></div>;
}

function FinishProfile({ session, setProfile, setProfileMissing, setRoute, setMessage }) {
  const initialUsername = session?.user?.user_metadata?.requested_username || '';
  const initialDisplayName = session?.user?.user_metadata?.requested_display_name || '';
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [busy, setBusy] = useState(false);
  const usernameValid = /^[a-zA-Z0-9_]{3,20}$/.test(username);

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!session?.user) { setRoute('Auth'); return; }
    if (!usernameValid) { setMessage('Username must be 3–20 characters using letters, numbers, or underscores.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const profileRow = {
        id: session.user.id,
        username: username.toLowerCase(),
        display_name: displayName || username
      };
      const { data, error } = await supabase
        .from('profiles')
        .upsert(profileRow, { onConflict: 'id' })
        .select('*')
        .single();
      if (error) throw error;
      setProfile(data);
      setProfileMissing(false);
      setMessage('Profile saved.');
      setRoute('Dashboard');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="auth-wrap"><Panel eyebrow="Finish Profile" title="Create your public GM identity">
    <form className="form-stack" onSubmit={saveProfile}>
      <p className="muted">Your email stays private. This is what other managers will see.</p>
      <Field label="Username" value={username} onChange={setUsername} placeholder="fresh24" helper="3–20 characters. Letters, numbers, underscore." />
      <Field label="Display Name" value={displayName} onChange={setDisplayName} placeholder="Kevin Brown" helper="Shown in league feed, standings, and trade screens." />
      <PrimaryButton type="submit" disabled={busy || !usernameValid}>{busy ? 'Saving...' : 'Save Profile'}</PrimaryButton>
    </form>
  </Panel></div>;
}

function Dashboard({ user, isSignedIn, leagues, setRoute, openLeague }) {
  return (
    <div className="dashboard-grid">
      <Panel eyebrow="GM Profile" title={user ? user.display_name || user.username : 'Not signed in'}>
        {user ? <>
          <div className="profile-card"><span>@{user.username || 'demo_gm'}</span><strong>{leagues.length} leagues active</strong><p>Career records unlock once real seasons are completed.</p></div>
          <div className="button-row"><SecondaryButton onClick={() => setRoute('Create League')}>Start a League</SecondaryButton><SecondaryButton onClick={() => setRoute('Join League')}>Join a League</SecondaryButton></div>
        </> : <Gate title="Dashboard" setRoute={setRoute} isSignedIn={isSignedIn} />}
      </Panel>
      <Panel eyebrow="My Leagues" title="Commissioner office">
        {leagues.length ? leagues.map((league) => <button className="league-row league-row-btn" key={league.id} onClick={() => openLeague(league.id)}><strong>{league.name}</strong><StatusPill>Open →</StatusPill></button>) : <p className="muted">No connected leagues yet. Create or join one to replace this empty state.</p>}
      </Panel>
      <Panel eyebrow="Preview" title="League Feed Framework">
        <FeedList items={demoFeed} />
      </Panel>
      <Panel eyebrow="Preview" title="Standings Component">
        <StandingsTable rows={demoStandings} />
      </Panel>
    </div>
  );
}

const LEAGUE_NAV = ['Overview', 'War Room', 'My Franchise', 'Standings', 'Schedule', 'League Feed', 'Members', 'History', 'Settings'];

const STATUS_LABELS = {
  setup: 'Setup',
  startup_draft: 'Startup Draft',
  in_season: 'In Season',
  offseason: 'Offseason',
  archived: 'Archived'
};

// Which roadmap phase delivers each not-yet-built tab. Keeps stubs honest.
const TAB_PHASE_NOTE = {
  Standings: 'Category standings render once the fantasy engine lands (Phase 7).',
  Schedule: 'Weekly matchup scheduling is part of the fantasy engine (Phase 7).',
  'League Feed': 'A live feed reads from audit logs and notifications in a later phase.',
  History: 'Permanent league and franchise history is Phase 6.',
  Settings: 'Commissioner settings and rule edits come with the invite/admin phase.'
};

function LeagueDetail({ leagueId, userId, setRoute }) {
  const [tab, setTab] = useState('Overview');
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isSupabaseConfigured || !leagueId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      const { data, error: loadError } = await supabase
        .from('leagues')
        .select(`
          id, name, slug, status, created_at, commissioner_id,
          league_settings ( number_of_teams, salary_cap_m, minimum_salary_m, roster_size, signing_bonus_pool_m, buyout_percent, playoff_teams, draft_order ),
          league_categories ( category_key, sort_order ),
          franchises ( id, name, abbreviation, founded_season, franchise_owners ( role, active, user_id, profiles ( username, display_name ) ) )
        `)
        .eq('id', leagueId)
        .maybeSingle();
      if (cancelled) return;
      if (loadError) {
        setError(loadError.message);
      } else if (!data) {
        setError('League not found, or you are not a member of it.');
      } else {
        setLeague(data);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [leagueId]);

  if (!isSupabaseConfigured) {
    return <div className="auth-wrap"><Panel eyebrow="League" title="Connect Supabase to view leagues">
      <p className="muted">League detail loads a real league from the database. Add Supabase keys to <code>.env.local</code> to enable it.</p>
      <SecondaryButton onClick={() => setRoute('Dashboard')}>Back to Dashboard</SecondaryButton>
    </Panel></div>;
  }

  if (loading) {
    return <div className="auth-wrap"><Panel eyebrow="League" title="Loading league…"><p className="muted">Fetching league, settings, and members.</p></Panel></div>;
  }

  if (error || !league) {
    return <div className="auth-wrap"><Panel eyebrow="League" title="Could not open league">
      <p className="muted">{error || 'Something went wrong.'}</p>
      <SecondaryButton onClick={() => setRoute('Dashboard')}>Back to Dashboard</SecondaryButton>
    </Panel></div>;
  }

  const settings = Array.isArray(league.league_settings) ? league.league_settings[0] : league.league_settings;
  const categories = [...(league.league_categories || [])].sort((a, b) => a.sort_order - b.sort_order);
  const franchises = league.franchises || [];
  const capacity = settings?.number_of_teams ?? null;
  const filled = franchises.length;
  const foundedYear = league.created_at ? new Date(league.created_at).getFullYear() : null;

  const members = franchises.map((franchise) => {
    const owner = (franchise.franchise_owners || []).find((row) => row.active) || (franchise.franchise_owners || [])[0];
    const profile = owner?.profiles;
    return {
      franchiseId: franchise.id,
      franchiseName: franchise.name,
      gm: profile?.display_name || profile?.username || 'Unknown GM',
      username: profile?.username,
      role: owner?.role || 'owner',
      primaryColor: franchise.primary_color,
      secondaryColor: franchise.secondary_color,
      monogram: franchise.monogram,
      userId: owner?.user_id
    };
  });

  const myFranchise = franchises.find((franchise) =>
    (franchise.franchise_owners || []).some((row) => row.user_id === userId && row.active)
  );

  // Accent = the viewing owner's franchise PRIMARY color (all palette primaries
  // are dark enough to read on the light cards). Secondary stays in the badge.
  const franchiseAccent = paletteByKey[myFranchise?.primary_color]?.primary || null;

  // Patch identity into local state so the UI reflects a save without a refetch.
  const applyIdentity = (franchiseId, next) => {
    setLeague((current) => {
      if (!current) return current;
      return {
        ...current,
        franchises: (current.franchises || []).map((f) =>
          f.id === franchiseId ? { ...f, ...next } : f
        )
      };
    });
  };

  return (
    <div className="league-shell">
      <aside className="league-nav">
        <button className="text-btn league-back" onClick={() => setRoute('Dashboard')}>← All Leagues</button>
        <div className="league-nav-title">{league.name}</div>
        <StatusPill>{STATUS_LABELS[league.status] || league.status}</StatusPill>
        <nav className="league-nav-links">
          {LEAGUE_NAV.map((item) => (
            <button key={item} className={tab === item ? 'league-nav-link active' : 'league-nav-link'} onClick={() => setTab(item)}>{item}</button>
          ))}
        </nav>
      </aside>

      <div
        className={franchiseAccent ? 'league-content franchise-themed' : 'league-content'}
        style={franchiseAccent ? { '--franchise': franchiseAccent } : undefined}
      >
        {tab === 'Overview' && (
          <>
            {capacity !== null && filled < capacity && (
              <div className="next-step">
                <strong>Next step:</strong> {filled} of {capacity} franchises filled. Share the league name and password so managers can join.
              </div>
            )}
            {capacity !== null && filled >= capacity && (
              <div className="next-step">
                <strong>Next step:</strong> all {capacity} franchises are in. The startup draft is the next milestone.
              </div>
            )}

            <div className="command-grid">
              <DashCard eyebrow="Your Franchise" className="dash-identity">
                {myFranchise ? (
                  <div className="dash-franchise">
                    <MonogramBadge monogram={myFranchise.monogram} primary={myFranchise.primary_color} secondary={myFranchise.secondary_color} fallback={myFranchise.name} />
                    <div>
                      <div className="identity-name">{myFranchise.name}</div>
                      <button className="text-btn inline-reset" onClick={() => setTab('My Franchise')}>Edit identity →</button>
                    </div>
                  </div>
                ) : <p className="muted">You do not own a franchise in this league.</p>}
              </DashCard>

              <DashCard eyebrow="Salary Cap">
                <div className="dash-stat"><span>Cap</span><strong>{settings ? formatMoney(settings.salary_cap_m) : '—'}</strong></div>
                <div className="dash-stat"><span>Payroll</span><strong className="pending-val">— <em>Phase C</em></strong></div>
                <div className="dash-stat"><span>Available to Bid</span><strong className="pending-val">— <em>Phase C</em></strong></div>
              </DashCard>

              <DashCard eyebrow="Roster" pending="Contracts and roster arrive in Phase C.">
                <div className="dash-stat"><span>Signed</span><strong>0{settings ? ` / ${settings.roster_size}` : ''}</strong></div>
              </DashCard>

              <DashCard eyebrow="This Week" pending="Matchups arrive with the fantasy engine (Phase 7)." />

              <DashCard eyebrow="League Feed" pending="A live transaction feed arrives in a later phase." />

              <DashCard eyebrow="Standings" pending="Category standings arrive with the fantasy engine (Phase 7).">
                <div className="dash-stat"><span>Franchises</span><strong>{filled}{capacity !== null ? ` / ${capacity}` : ''}</strong></div>
              </DashCard>

              <DashCard eyebrow="League Info" className="span-2">
                <div className="war-math">
                  <div><span>Status</span><strong>{STATUS_LABELS[league.status] || league.status}</strong></div>
                  <div><span>Founded</span><strong>{foundedYear ?? '—'}</strong></div>
                  <div><span>Draft Order</span><strong>{settings?.draft_order === 'reverse' ? 'Reverse' : 'Lottery'}</strong></div>
                  <div><span>Minimum Salary</span><strong>{settings ? formatMoney(settings.minimum_salary_m) : '—'}</strong></div>
                  <div><span>Bonus Pool</span><strong>{settings ? formatMoney(settings.signing_bonus_pool_m) : '—'}</strong></div>
                  <div><span>Playoff Teams</span><strong>{settings?.playoff_teams ?? '—'}</strong></div>
                </div>
                {categories.length > 0 && (
                  <div className="cat-grid dash-cats">
                    {categories.map((cat) => <span key={cat.category_key}>{cat.category_key}</span>)}
                  </div>
                )}
              </DashCard>
            </div>
          </>
        )}

        {tab === 'My Franchise' && (
          myFranchise
            ? <MyFranchise franchise={myFranchise} onSaved={(next) => applyIdentity(myFranchise.id, next)} />
            : <Panel eyebrow="My Franchise" title="No franchise here"><p className="muted">You do not own a franchise in this league.</p></Panel>
        )}

        {tab === 'War Room' && (
          myFranchise
            ? <WarRoom leagueId={league.id} franchise={myFranchise} minSalary={settings ? Number(settings.minimum_salary_m) : 2.5} isCommissioner={league.commissioner_id === userId} />
            : <Panel eyebrow="War Room" title="No franchise here"><p className="muted">You need a franchise in this league to bid.</p></Panel>
        )}

        {tab === 'Members' && (
          <Panel eyebrow="League" title={`Members (${members.length})`}>
            <table className="data-table members-table">
              <thead><tr><th>Franchise</th><th>GM</th><th>Role</th></tr></thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.franchiseId}>
                    <td>
                      <div className="member-franchise">
                        <MonogramBadge monogram={member.monogram} primary={member.primaryColor} secondary={member.secondaryColor} fallback={member.franchiseName} small />
                        <strong>{member.franchiseName}</strong>
                      </div>
                    </td>
                    <td>{member.gm}{member.username ? <span className="muted"> · @{member.username}</span> : null}</td>
                    <td>{member.role === 'commissioner' ? 'Commissioner' : member.role === 'co_owner' ? 'Co-owner' : 'Owner'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {TAB_PHASE_NOTE[tab] && (
          <Panel eyebrow={tab} title={`${tab} — coming soon`}>
            <p className="muted">{TAB_PHASE_NOTE[tab]}</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function MonogramBadge({ monogram, primary, secondary, fallback, small }) {
  const bg = paletteByKey[primary]?.primary || '#e6e0d2';
  const fg = paletteByKey[secondary]?.primary || '#6d6a60';
  const text = monogram || autoMonogram(fallback || 'X');
  return (
    <span className={small ? 'monogram-badge small' : 'monogram-badge'} style={{ background: bg, color: fg }}>{text}</span>
  );
}

function SwatchRow({ label, value, onChange }) {
  return (
    <div className="swatch-row">
      <span className="swatch-label">{label}</span>
      <div className="swatch-grid">
        {PALETTE.map((color) => (
          <button
            key={color.key}
            type="button"
            className={value === color.key ? 'swatch selected' : 'swatch'}
            style={{ background: color.primary }}
            onClick={() => onChange(color.key)}
            title={color.name}
            aria-label={color.name}
          >{value === color.key ? '✓' : ''}</button>
        ))}
      </div>
    </div>
  );
}

function MyFranchise({ franchise, onSaved }) {
  const autoMono = autoMonogram(franchise.name);
  const [primary, setPrimary] = useState(franchise.primary_color || 'forest');
  const [secondary, setSecondary] = useState(franchise.secondary_color || 'gold');
  const [monogram, setMonogram] = useState(franchise.monogram || autoMono);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const dirty =
    (franchise.primary_color || 'forest') !== primary ||
    (franchise.secondary_color || 'gold') !== secondary ||
    (franchise.monogram || autoMono) !== monogram;

  const save = async () => {
    setBusy(true);
    setNote('');
    try {
      const clean = monogram.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      if (!clean) throw new Error('Monogram needs at least one letter or number.');
      const { error } = await supabase.rpc('update_franchise_identity', {
        p_franchise_id: franchise.id,
        p_primary_color: primary,
        p_secondary_color: secondary,
        p_monogram: clean
      });
      if (error) throw error;
      setMonogram(clean);
      setNote('Saved.');
      onSaved({ primary_color: primary, secondary_color: secondary, monogram: clean });
    } catch (error) {
      setNote(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel eyebrow="My Franchise" title={franchise.name}>
      <div className="franchise-identity">
        <div className="identity-preview">
          <MonogramBadge monogram={monogram} primary={primary} secondary={secondary} fallback={franchise.name} />
          <div>
            <div className="identity-name">{franchise.name}</div>
            <div className="muted">Live preview</div>
          </div>
        </div>

        <SwatchRow label="Primary Color" value={primary} onChange={setPrimary} />
        <SwatchRow label="Secondary Color" value={secondary} onChange={setSecondary} />

        <label className="field">
          <span>Monogram</span>
          <input value={monogram} maxLength={3} onChange={(e) => setMonogram(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <small>1–3 letters or numbers. Auto-filled from your franchise name — edit if you like. <button type="button" className="text-btn inline-reset" onClick={() => setMonogram(autoMono)}>Reset to auto</button></small>
        </label>

        <div className="button-row">
          <PrimaryButton onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save Identity'}</PrimaryButton>
          {note && <span className="muted identity-note">{note}</span>}
        </div>
      </div>
    </Panel>
  );
}

function DashCard({ eyebrow, children, pending, className = '' }) {
  const isEmpty = pending && !children;
  return (
    <section className={`dash-card ${isEmpty ? 'pending' : ''} ${className}`.trim()}>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      {children}
      {pending && <p className="dash-pending">{pending}</p>}
    </section>
  );
}

function fmtRemaining(endsAt, now) {
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return 'ended';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function WarRoom({ leagueId, franchise, minSalary, isCommissioner }) {
  const [cap, setCap] = useState(null);
  const [players, setPlayers] = useState([]);
  const [auctions, setAuctions] = useState({});
  const [myOffers, setMyOffers] = useState({});
  const [rostered, setRostered] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bidFor, setBidFor] = useState(null);
  const [bidSalary, setBidSalary] = useState('');
  const [bidLength, setBidLength] = useState('3');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());

  async function load() {
    setError('');
    const [capRes, playersRes, auctionsRes, offersRes, contractsRes] = await Promise.all([
      supabase.rpc('can_afford', { p_franchise_id: franchise.id, p_offer_salary: minSalary, p_offer_length: 1 }),
      supabase.from('players').select('id, full_name, positions').order('full_name'),
      supabase.from('auctions').select('id, player_id, status, ends_at, phase, incumbent_franchise_id, winner_franchise_id, winner_salary_m, winner_length_years, match_deadline').eq('league_id', leagueId).neq('status', 'closed'),
      supabase.from('contract_offers').select('id, player_id, offer_salary_m, offer_length_years').eq('franchise_id', franchise.id).eq('status', 'pending'),
      supabase.from('contracts').select('player_id, franchise_id').eq('league_id', leagueId).eq('status', 'active')
    ]);

    if (capRes.error) setError(capRes.error.message);
    else setCap(capRes.data);
    if (!playersRes.error) setPlayers(playersRes.data || []);
    const aMap = {};
    (auctionsRes.data || []).forEach((a) => { aMap[a.player_id] = a; });
    setAuctions(aMap);
    const oMap = {};
    (offersRes.data || []).forEach((o) => { oMap[o.player_id] = o; });
    setMyOffers(oMap);
    const rMap = {};
    (contractsRes.data || []).forEach((c) => { rMap[c.player_id] = c.franchise_id; });
    setRostered(rMap);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leagueId, franchise.id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  function openBid(player) {
    const existing = myOffers[player.id];
    setBidFor(player.id);
    setBidSalary(existing ? String(existing.offer_salary_m) : String(minSalary));
    setBidLength(existing ? String(existing.offer_length_years) : '3');
    setError('');
  }

  async function submitBid(playerId) {
    setBusy(true);
    setError('');
    const salary = Number(bidSalary);
    if (!Number.isFinite(salary) || salary <= 0) {
      setError('Enter a valid salary.');
      setBusy(false);
      return;
    }
    const { error: bidError } = await supabase.rpc('place_bid', {
      p_franchise_id: franchise.id,
      p_player_id: playerId,
      p_offer_salary: salary,
      p_offer_length: Number(bidLength)
    });
    if (bidError) {
      setError(bidError.message);
      setBusy(false);
      return;
    }
    setBidFor(null);
    setBusy(false);
    await load();
  }

  async function resolveNow() {
    setBusy(true);
    setError('');
    const { data, error: rErr } = await supabase.rpc('resolve_due_auctions');
    setBusy(false);
    if (rErr) { setError(rErr.message); return; }
    setNotice(`Resolved ${data} auction${data === 1 ? '' : 's'}.`);
    await load();
  }

  async function submitMatch(auctionId, match) {
    setBusy(true);
    setError('');
    const { error: mErr } = await supabase.rpc('decide_match', { p_auction_id: auctionId, p_match: match });
    setBusy(false);
    if (mErr) { setError(mErr.message); return; }
    setNotice(match ? 'Player matched and kept.' : 'Declined — player released to the winner.');
    await load();
  }

  if (loading) {
    return <Panel eyebrow="War Room" title="Loading…"><p className="muted">Pulling your cap and the player pool.</p></Panel>;
  }

  const money = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(1)}m`);
  const playersById = {};
  players.forEach((p) => { playersById[p.id] = p; });
  const myMatches = Object.values(auctions).filter((a) => a.status === 'awaiting_match' && a.incumbent_franchise_id === franchise.id);

  function renderPlayer(player) {
    const offer = myOffers[player.id];
    const auction = auctions[player.id];
    const isOpen = bidFor === player.id;
    const rosterHolder = rostered[player.id];
    const mineRostered = rosterHolder && rosterHolder === franchise.id;
    const otherRostered = rosterHolder && rosterHolder !== franchise.id;

    // Blind-safe state precedence.
    let state = 'available';
    if (mineRostered) state = 'mine';
    else if (otherRostered) state = 'rostered';
    else if (offer) state = 'bidding';
    else if (auction) state = 'active';

    const total = (Number(bidSalary) || 0) * (Number(bidLength) || 0);

    return (
      <div className={`player-row state-${state}`} key={player.id}>
        <div className="player-main">
          <div className="player-name">
            <strong>{player.full_name}</strong>
            <span className="player-pos">{(player.positions || []).join(' / ')}</span>
          </div>
          <div className="player-state">
            {offer && <span className="my-bid">Your bid: ${Number(offer.offer_salary_m).toFixed(1)}m/yr · ${(Number(offer.offer_salary_m) * offer.offer_length_years).toFixed(1)}m total · {offer.offer_length_years}yr</span>}
            {mineRostered && <span className="my-bid">On your roster</span>}
            {otherRostered && <span className="muted">Signed elsewhere</span>}
            {auction && !rosterHolder && <span className="auction-timer">{fmtRemaining(auction.ends_at, now)}</span>}
            {!rosterHolder && <button className="text-btn" onClick={() => (isOpen ? setBidFor(null) : openBid(player))}>{offer ? 'Raise' : 'Bid'}</button>}
          </div>
        </div>
        {isOpen && !rosterHolder && (
          <div className="bid-form">
            <Field label="Annual salary ($m)" type="number" value={bidSalary} onChange={setBidSalary} helper={`Cap hit each year. Total value: $${total.toFixed(1)}m over ${bidLength}yr`} />
            <SelectField label="Years" value={bidLength} onChange={setBidLength}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </SelectField>
            <div className="bid-actions">
              <PrimaryButton onClick={() => submitBid(player.id)} disabled={busy}>{busy ? 'Placing…' : 'Place Bid'}</PrimaryButton>
              <SecondaryButton onClick={() => setBidFor(null)}>Cancel</SecondaryButton>
            </div>
          </div>
        )}
      </div>
    );
  }

  // On the clock → Live Auctions (soonest first). Everyone else → the pool.
  const livePlayers = players
    .filter((p) => auctions[p.id])
    .sort((a, b) => new Date(auctions[a.id].ends_at) - new Date(auctions[b.id].ends_at));
  const poolPlayers = players.filter((p) => !auctions[p.id]);

  return (
    <>
      <section className="dash-card warroom-cap">
        <div className="warroom-cap-head">
          <div className="eyebrow">War Room · {franchise.name}</div>
          {isCommissioner && (
            <button className="text-btn resolve-btn" onClick={resolveNow} disabled={busy}>{busy ? 'Resolving…' : 'Resolve now'}</button>
          )}
        </div>
        <div className="warroom-cap-grid">
          <div><span>Cap</span><strong>{money(cap?.cap)}</strong></div>
          <div><span>Payroll</span><strong>{money(cap?.payroll)}</strong></div>
          <div><span>Pending Bids</span><strong>{money(cap?.pending_sum)}</strong></div>
          <div><span>Max Bid</span><strong className="warroom-maxbid">{money(cap?.max_bid)}</strong></div>
        </div>
        <p className="muted warroom-note">Bids are blind — you only see your own. Auctions run 24h from the first bid.</p>
      </section>

      {notice && <div className="warroom-notice">{notice}</div>}
      {error && <div className="warroom-error">{error}</div>}

      {myMatches.length > 0 && (
        <Panel eyebrow="Decision required" title={`Match window (${myMatches.length})`}>
          <div className="player-list">
            {myMatches.map((a) => (
              <div className="player-row state-active" key={a.id}>
                <div className="player-main">
                  <div className="player-name">
                    <strong>{playersById[a.player_id]?.full_name || 'Player'}</strong>
                    <span className="player-pos">Winning offer: ${Number(a.winner_salary_m).toFixed(1)}m/yr · {a.winner_length_years}yr · {fmtRemaining(a.match_deadline, now)}</span>
                  </div>
                  <div className="bid-actions">
                    <PrimaryButton onClick={() => submitMatch(a.id, true)} disabled={busy}>Match &amp; keep</PrimaryButton>
                    <SecondaryButton onClick={() => submitMatch(a.id, false)} disabled={busy}>Decline</SecondaryButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="warroom-legend">
        <span className="legend-item legend-mine">On your roster</span>
        <span className="legend-item legend-bidding">Your bid in</span>
        <span className="legend-item legend-active">Auction live</span>
        <span className="legend-item legend-rostered">On another team</span>
      </div>

      {livePlayers.length > 0 && (
        <Panel eyebrow="On the clock" title={`Live auctions (${livePlayers.length})`}>
          <div className="player-list">
            {livePlayers.map((player) => renderPlayer(player))}
          </div>
        </Panel>
      )}

      <Panel eyebrow="Players" title={`Player pool (${poolPlayers.length})`}>
        <div className="player-list">
          {poolPlayers.map((player) => renderPlayer(player))}
        </div>
      </Panel>
    </>
  );
}

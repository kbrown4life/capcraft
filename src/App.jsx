import React, { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { TopNav, Shell, Panel, StatusPill } from './components/Layout';
import { Field, PrimaryButton, SecondaryButton, SelectField } from './components/Forms';
import { FeedList, StandingsTable } from './components/Tables';
import { demoFeed, demoStandings, defaultCategories, optionalCategories, categoryLabels } from './data/demo';
import { formatMoney } from './lib/money';


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
        {route === 'League' && <LeagueDetail leagueId={activeLeagueId} setRoute={setRoute} />}
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

const LEAGUE_NAV = ['Overview', 'My Franchise', 'Standings', 'Schedule', 'League Feed', 'Members', 'History', 'Settings'];

const STATUS_LABELS = {
  setup: 'Setup',
  startup_draft: 'Startup Draft',
  in_season: 'In Season',
  offseason: 'Offseason',
  archived: 'Archived'
};

// Which roadmap phase delivers each not-yet-built tab. Keeps stubs honest.
const TAB_PHASE_NOTE = {
  'My Franchise': 'Franchise identity — colors, monogram, roster — arrives in Phase B.',
  Standings: 'Category standings render once the fantasy engine lands (Phase 7).',
  Schedule: 'Weekly matchup scheduling is part of the fantasy engine (Phase 7).',
  'League Feed': 'A live feed reads from audit logs and notifications in a later phase.',
  History: 'Permanent league and franchise history is Phase 6.',
  Settings: 'Commissioner settings and rule edits come with the invite/admin phase.'
};

function LeagueDetail({ leagueId, setRoute }) {
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
          id, name, slug, status, created_at,
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
      role: owner?.role || 'owner'
    };
  });

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

      <div className="league-content">
        {tab === 'Overview' && (
          <>
            <Panel eyebrow="League Overview" title={league.name}>
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
              <div className="war-math">
                <div><span>Status</span><strong>{STATUS_LABELS[league.status] || league.status}</strong></div>
                <div><span>Franchises</span><strong>{filled}{capacity !== null ? ` / ${capacity}` : ''}</strong></div>
                <div><span>Founded</span><strong>{foundedYear ?? '—'}</strong></div>
                {settings && <>
                  <div><span>Salary Cap</span><strong>{formatMoney(settings.salary_cap_m)}</strong></div>
                  <div><span>Minimum Salary</span><strong>{formatMoney(settings.minimum_salary_m)}</strong></div>
                  <div><span>Roster Size</span><strong>{settings.roster_size}</strong></div>
                  <div><span>Signing Bonus Pool</span><strong>{formatMoney(settings.signing_bonus_pool_m)}</strong></div>
                  <div><span>Playoff Teams</span><strong>{settings.playoff_teams}</strong></div>
                  <div><span>Draft Order</span><strong>{settings.draft_order === 'reverse' ? 'Reverse Standings' : 'Lottery'}</strong></div>
                </>}
              </div>
            </Panel>
            <Panel eyebrow="Scoring" title="Categories">
              {categories.length ? (
                <div className="cat-grid">
                  {categories.map((cat) => <span key={cat.category_key}>{cat.category_key}</span>)}
                </div>
              ) : <p className="muted">No categories configured.</p>}
            </Panel>
          </>
        )}

        {tab === 'Members' && (
          <Panel eyebrow="League" title={`Members (${members.length})`}>
            <table className="data-table members-table">
              <thead><tr><th>Franchise</th><th>GM</th><th>Role</th></tr></thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.franchiseId}>
                    <td><strong>{member.franchiseName}</strong></td>
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

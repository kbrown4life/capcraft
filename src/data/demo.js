export const demoStandings = [
  { rank: 1, franchise: 'Orlando Sentinels', record: '82-42-2', gb: '—' },
  { rank: 2, franchise: 'Seattle Rain', record: '77-47-2', gb: '5.0' },
  { rank: 3, franchise: 'Chicago Rail', record: '73-50-3', gb: '8.5' },
  { rank: 4, franchise: 'Atlanta Smoke', record: '70-53-3', gb: '11.5' },
  { rank: 5, franchise: 'Miami Vice', record: '68-56-2', gb: '14.0' },
  { rank: 6, franchise: 'Dallas Oil', record: '63-60-3', gb: '18.5' }
];

export const demoFeed = [
  { time: '09:18', type: 'SIGNED', text: 'Seattle signs Shai Gilgeous-Alexander to 4/$224.5m.' },
  { time: '10:04', type: 'JOINED', text: 'Kevin Brown created Orlando Sentinels.' },
  { time: '11:32', type: 'NOTICE', text: 'Startup draft room opens when 12 franchises are filled.' }
];

export const defaultCategories = ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'FG%', 'FT%', 'TO'];

export const optionalCategories = [
  'DD',
  'TD',
  'OREB',
  'DREB',
  'FTM',
  '3P%',
  'MIN',
  'PF'
];

export const categoryLabels = {
  PTS: 'Points',
  REB: 'Rebounds',
  AST: 'Assists',
  STL: 'Steals',
  BLK: 'Blocks',
  '3PM': '3-Pointers Made',
  'FG%': 'Field Goal %',
  'FT%': 'Free Throw %',
  TO: 'Turnovers',
  DD: 'Double-Doubles',
  TD: 'Triple-Doubles',
  OREB: 'Offensive Rebounds',
  DREB: 'Defensive Rebounds',
  FTM: 'Free Throws Made',
  '3P%': '3-Point %',
  MIN: 'Minutes',
  PF: 'Personal Fouls'
};

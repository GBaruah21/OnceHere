import { ArchiveType } from '../types';

export interface SuggestionSet {
  titles: string[];
  organizations: string[];
  subtitles: string[];
  batchLabels: string[];
}

export const ARCHIVE_SUGGESTIONS: Record<ArchiveType, SuggestionSet> = {
  college: {
    titles: [
      'Riverdale Institute of Tech — Class of 2026',
      'The Golden Batch of Engineering (2022–2026)',
      'IIT Delhi — Department of Computer Science',
      'St. Stephen’s College — Economics Batch of ’26',
      'NIT Trichy — Mechanical Mavericks 2026',
      'BITS Pilani — Chronicles of Hostel 3'
    ],
    organizations: [
      'Riverdale Institute of Technology',
      'National Institute of Technology',
      'Delhi University — St. Stephen’s',
      'Indian Institute of Technology',
      'Birla Institute of Technology & Science',
      'Loyola College of Arts & Sciences'
    ],
    subtitles: [
      'Four years of late-night chai, 3 AM debugging, and friendships for a lifetime.',
      'From strangers in the orientation hall to brothers in the convocation line.',
      'Survived midterms, proxy attendances, and infinite canteen debates.',
      'The stories, inside jokes, and dreams we built between 2022 and 2026.',
      'A permanent digital vault of our college glory days.'
    ],
    batchLabels: ['Class of 2026', 'Batch 2022–2026', 'The Final Roll Call', 'Silver Jubilee Batch', 'The CSE Legends']
  },
  school: {
    titles: [
      'St. Xavier’s High School — Class of 2026',
      'Mary’s Convent — The Golden Batch',
      'Delhi Public School — Batch of 2026',
      'Bishop Cotton Boys — 12-Year Journey',
      'The Kindergarten to 12th Grade Odyssey'
    ],
    organizations: [
      'St. Xavier’s Senior Secondary School',
      'St. Mary’s Convent High School',
      'Delhi Public School, R.K. Puram',
      'The Cathedral & John Connon School',
      'Modern School, Barakhamba'
    ],
    subtitles: [
      'Twelve years of shared tiffins, scraped knees, and classroom whispers.',
      'Growing up together under the banyan tree and library bell.',
      'From morning assembly lines to final farewell tears.',
      'Every memory etched into wooden desks and school diaries.'
    ],
    batchLabels: ['Class of 2026', '12-A & 12-B Alumni', 'Batch of 2026', 'The Millennial Batch']
  },
  university: {
    titles: [
      'JNU Postgrad Scholars — 2024–2026',
      'IISc Quantum Research Cohort',
      'Master of Design — Batch of 2026',
      'University Law College — Final Docket'
    ],
    organizations: [
      'Jawaharlal Nehru University',
      'Indian Institute of Science, Bangalore',
      'National Institute of Design (NID)',
      'National Law School of India'
    ],
    subtitles: [
      'Theses defended, coffee pots drained, and discoveries made.',
      'Two intense years of research, camaraderie, and late-night conferences.'
    ],
    batchLabels: ['Cohort of 2026', 'M.Tech / M.Des 2026', 'Research Fellows 2024–26']
  },
  trip: {
    titles: [
      'The Ultimate Goa Roadtrip — Summer ’25',
      'Ladakh Bike Expedition: 18,000 Feet of Freedom',
      'Manali & Kasol Winter Chronicles',
      'Backpacking Across South India'
    ],
    organizations: [
      'The Wanderlust Seven',
      'Chai & Campfire Squad',
      'Royal Enfield Riders Club',
      'The 3 AM Travel Gang'
    ],
    subtitles: [
      'Nine flat tyres, zero regrets, and 2,000 kilometres of pure adrenaline.',
      'Sunsets over Chapora fort and endless stories by the beach shack.',
      'The trip that made it out of the WhatsApp group.'
    ],
    batchLabels: ['Summer 2025', 'The Goa Chapter', 'Ladakh ’25', 'The Weekend Escapade']
  },
  team: {
    titles: [
      'Warriors Football Club — Championship Season',
      'Inter-College Cricket Champions 2026',
      'RoboWars National Team — Battle Chronicles',
      'Formula Student Racing — Buddh Circuit Glory'
    ],
    organizations: [
      'Campus Football Club',
      'Varsity Cricket XI',
      'Robotics Racing Guild',
      'Badminton League 2026'
    ],
    subtitles: [
      'Blood, sweat, tactical drills, and trophies lifted under floodlights.',
      'United on the pitch, brothers in the locker room.'
    ],
    batchLabels: ['Champions ’26', 'Season 2025–26', 'Gold Medal Squad']
  },
  workplace: {
    titles: [
      'Founding Team Chronicles (2023–2026)',
      'The 0-to-1 Crew — Startup Days',
      'Engineering Squad — The Monolith to Microservices Era',
      'Design & Product Guild 2026'
    ],
    organizations: [
      'Stealth AI Labs',
      'HyperScale Technologies',
      'The Product Engine',
      'Studio Zero Collective'
    ],
    subtitles: [
      'Whiteboards full of arrows, pitch decks at midnight, and product launches.',
      'The incredible team who turned a napkin sketch into a company.'
    ],
    batchLabels: ['Alpha Team', 'Founding Cohort', 'Engineers & Designers']
  },
  reunion: {
    titles: [
      '10-Year Reunion — Class of 2016',
      'Silver Jubilee Homecoming — 25 Years Later',
      'Decade of Memories: 2016 to 2026',
      'Back to Where It All Began'
    ],
    organizations: [
      'Alumni Association',
      'The 2016 Batch Reunion Committee',
      'Heritage Hall Alumni'
    ],
    subtitles: [
      'A decade has passed, but it feels like yesterday when the bell rang.',
      'Reconnecting across continents, reminiscing over the good old days.'
    ],
    batchLabels: ['10-Year Reunion', 'Silver Jubilee', 'Homecoming 2026']
  },
  club: {
    titles: [
      'The College Rock Band — Farewell Tour',
      'Dramatics & Street Play Society 2026',
      'Literary & Debate Guild — Final Motion',
      'Campus Photography Society Vault'
    ],
    organizations: [
      'Acoustic Strings Band',
      'Nukkad Natak Ensemble',
      'Model UN Society',
      'Fine Arts Collective'
    ],
    subtitles: [
      'One stage, countless rehearsals, and standing ovations.',
      'Turning empty auditoriums into worlds of music and emotion.'
    ],
    batchLabels: ['2022–2026 Season', 'The Farewell Cast', 'Stage Masters']
  },
  custom: {
    titles: [
      'The Midnight Terrace Gang (2022–2026)',
      'Hostel 4 — Legends of the 3rd Floor',
      'The Chai & Samosa Circle',
      'Memories of a Lifetime'
    ],
    organizations: [
      'Our Circle of Friends',
      'Hostel Wing B Crew',
      'The Tapri Council'
    ],
    subtitles: [
      'Every inside joke, late-night confession, and unforgettable moment.',
      'A home for the moments we never want to forget.'
    ],
    batchLabels: ['Class of 2026', 'Forever Friends', 'The Core Group']
  }
};

// Suggestions for Milestones / Timeline Events
export const MILESTONE_SUGGESTIONS = [
  {
    icon: '🎒',
    year: '2022',
    title: 'Orientation & First Day On Campus',
    description: 'Lost looking for Room 302, terrified of seniors, but ended up meeting friends who would last a lifetime.'
  },
  {
    icon: '☕',
    year: '2023',
    title: 'The Great Canteen Chai & Samosa Ritual',
    description: 'When our official attendance started dropping and our Splitwise ledger started growing exponentially.'
  },
  {
    icon: '💻',
    year: '2024',
    title: '48-Hour Hackathon All-Nighter',
    description: 'Red Bull, cold pizza, and Git merge conflicts at 4 AM — our demo crashed 5 minutes before presentation, yet we won runner-up!'
  },
  {
    icon: '🎸',
    year: '2024',
    title: 'TechFest Cultural Night & Concert',
    description: '3,000 flashlights swaying in the dark as the rock band played our batch anthem under the open sky.'
  },
  {
    icon: '🏖️',
    year: '2025',
    title: 'The Goa Roadtrip That Actually Happened',
    description: 'Twenty friends, nine motorcycle breakdowns, and watching the sunrise together from the fort.'
  },
  {
    icon: '🏆',
    year: '2025',
    title: 'Inter-College Sports Championship Victory',
    description: 'Hitting the final boundary at 7 PM under floodlights as the whole campus rushed onto the pitch.'
  },
  {
    icon: '📝',
    year: '2026',
    title: 'Scribble Day & Memory Shirts',
    description: 'Covering white cotton shirts in permanent ink, funny confessions, phone numbers, and promises we will keep.'
  },
  {
    icon: '🎓',
    year: '2026',
    title: 'Convocation & Black Cap Toss',
    description: 'Tossing our graduation caps into the sky as professors cheered and parents wiped away tears of pride.'
  }
];

// Suggestions for Yearbook / Member Profiles
export const MEMBER_SUGGESTIONS = [
  {
    name: 'Aarav Sharma',
    role: 'Tech Lead & Git Wizard',
    quote: '‘I came for the degree and stayed for the 3 AM lab debugging sessions.’',
    imageUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Pooja Hegde',
    role: 'Fest Convenor & Design Head',
    quote: '‘Most of my real attendance was marked at the college canteen.’',
    imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Rohan Sengupta',
    role: 'Proxy Master General',
    quote: '‘Somehow, deadlines ended before our friendships did.’',
    imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Ananya Deshmukh',
    role: 'Class Valedictorian',
    quote: '‘I thought I would remember the grades. I only remember the laughter in the corridors.’',
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Nikhil Chawla',
    role: 'Tapri In-Charge & Chai Specialist',
    quote: '‘Every single life problem was solved over one hot cup of adrak chai.’',
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'
  },
  {
    name: 'Sneha Kulkarni',
    role: 'Assignment Savior & Library Regular',
    quote: '‘My handwritten notes got photocopied more than the official syllabus books.’',
    imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80'
  }
];

export const ROLE_SUGGESTIONS = [
  'CSE Core',
  'Tech Lead',
  'Backbench Legend',
  'Canteen Treasurer',
  'Placement Ace',
  'Fest Convenor',
  'Hostel 3 Chef',
  'Tapri In-Charge',
  'Maggi Specialist',
  'RoboWars Champion',
  'Class Valedictorian',
  'Class Representative',
  'Sports Secretary',
  'Rock Band Guitarist',
  'Design & UX Lead',
  'Library Regular'
];

export const QUOTE_SUGGESTIONS = [
  '‘I came for the degree and stayed for the people.’',
  '‘Most of my attendance came from the corner canteen.’',
  '‘Splitwise recorded more history than any college ledger.’',
  '‘The presentation worked on the final slide. Nobody knows how.’',
  '‘Somehow, the deadlines ended before our friendships did.’',
  '‘Four years of pretending to understand Fourier transforms.’',
  '‘I survived 8 AM lectures only because of adrak chai and good friends.’',
  '‘We made memories we will be laughing about when we are 80.’',
  '‘Answering roll calls in three different voices was my greatest achievement.’'
];

// Suggestions for Memory Wall / Scribble Notes
export const NOTE_SUGGESTIONS = [
  {
    category: 'Heartfelt & Nostalgic',
    text: 'To the friends who became my family away from home: thank you for making every ordinary day feel extraordinary.',
    role: 'Hostel Roommate'
  },
  {
    category: 'Funny & Inside Joke',
    text: 'If attendance was given for the hours spent sitting at the canteen tapri, we all would have topped the university!',
    role: 'Backbencher'
  },
  {
    category: 'Gratitude & Lab Savior',
    text: 'Special thanks to whoever started the group study drive thirty minutes before every semester exam. You are the real hero.',
    role: 'Lab Partner'
  },
  {
    category: 'Farewell & Reunion Promise',
    text: 'No matter which continent we end up in, let’s promise the 5-year reunion roadtrip actually makes it out of the group chat.',
    role: 'Batchmate'
  },
  {
    category: '3 AM Maggi Memories',
    text: 'Nothing will ever taste as good as 3 AM hostel kettle Maggi shared between five hungry souls during mid-term week.',
    role: 'Hostel 4 Inmate'
  },
  {
    category: 'Classroom Banter',
    text: 'Shoutout to the back row for never letting a single lecture pass without uncontrollable giggles and passed notes.',
    role: 'Last Bench Guild'
  }
];

export const AUTHOR_ROLE_SUGGESTIONS = [
  'Anonymous Backbencher',
  'Hostel 3 Inmate',
  'Your Lab Partner',
  'Canteen Regular',
  'Tapri Gang Member',
  'Batchmate for Life',
  'Hostel Maggi Chef',
  'Library Regular'
];

// Suggestions for Media Vault Captions & Tags
export const MEDIA_CAPTION_SUGGESTIONS = [
  {
    caption: 'Canteen breakfast table: hot samosas, bun maska, and steaming cutting chai before 8 AM lecture.',
    tag: 'CanteenChai'
  },
  {
    caption: 'The hackathon presentation that worked at 4 AM when everyone thought the demo was doomed.',
    tag: 'Hackathon'
  },
  {
    caption: 'Scribble Day: shirts covered in ink, signatures, phone numbers, and promises we intend to keep.',
    tag: 'ScribbleDay'
  },
  {
    caption: 'TechFest Cultural Night: 3,000 flashlights in the air during the final band performance.',
    tag: 'Concert'
  },
  {
    caption: 'Convocation Ceremony: tossing black graduation caps into the sky on the main football quad.',
    tag: 'Convocation'
  },
  {
    caption: 'Hostel rooftop jam sessions every Saturday night with two guitars and twenty off-key singers.',
    tag: 'HostelLife'
  },
  {
    caption: 'Annual sports day cricket final: celebrating the victory trophy under golden hour campus skies.',
    tag: 'SportsDay'
  }
];

// Suggestions for Closing Section Headings and Tributes
export const CLOSING_SUGGESTIONS = {
  titles: [
    'Until We Meet Again',
    'The Story Never Truly Ends',
    'To the Good Old Days and Brighter Tomorrows',
    'Signed, Sealed, and Remembered Forever',
    'To Every Friend Who Walked This Path'
  ],
  notes: [
    'Every chapter deserves a place to live. May our paths cross again on sunny days and familiar corridors.',
    'We arrived as strangers, lived as a family, and departed as legends. Keep the flame burning bright.',
    'Time will move forward and cities may change, but the memories forged in these four walls are permanent.',
    'Here is to the late nights that turned into mornings, and the friends who turned into family.'
  ]
};

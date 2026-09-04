import { config } from 'dotenv';

// Host-provided values win. Local development reads the file documented in README.
config({ path: ['.env.local', '.env'], quiet: true });

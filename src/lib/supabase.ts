import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or anonymous key. Please check your environment variables and ensure you are connected to Supabase.');
}

// Create a Supabase client with the anonymous key and additional options
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js/2.x',
    },
  },
  db: {
    schema: 'public',
  },
});

// Create a Supabase admin client with the service role key
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js/2.x',
    },
  },
  db: {
    schema: 'public',
  },
}) : null;

// Test the connection and throw a more descriptive error if it fails
const testConnection = async () => {
  try {
    // First check if we can reach the Supabase server
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Could not reach Supabase server. Please check your VITE_SUPABASE_URL.');
      } else if (response.status === 401) {
        throw new Error('Invalid Supabase credentials. Please check your VITE_SUPABASE_ANON_KEY.');
      }
      throw new Error(`Supabase server error (${response.status}): ${response.statusText}`);
    }

    // If we can reach the server, try a simple query
    const { data, error, status } = await supabase
      .from('currencies')
      .select('count', { count: 'exact', head: true });

    if (error) {
      if (status === 401) {
        throw new Error('Unauthorized: Please check your Supabase credentials and ensure you are connected to Supabase.');
      } else if (status === 403) {
        throw new Error('Forbidden: You do not have permission to access this resource.');
      } else if (error.message?.includes('relation "currencies" does not exist')) {
        throw new Error('Database table not found. Please ensure the currencies table exists in your Supabase project.');
      } else {
        throw new Error(`Database error (${status}): ${error.message}`);
      }
    }

    console.log('Supabase connection successful');
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Could not connect to Supabase. Please check your internet connection and ensure you can reach the Supabase server.');
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to connect to Supabase. Please ensure you are connected to Supabase and have the correct credentials.');
  }
};

// Initialize connection test
testConnection().catch(error => {
  console.error('Initial connection test failed:', error);
});

// Export a function to verify connection status
export const verifyConnection = testConnection;
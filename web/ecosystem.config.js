module.exports = {
  apps: [
    {
      name: 'inspecthero-web',
      script: 'npm',
      args: 'run start',
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        DEV_SUPABASE_USER_ID: process.env.DEV_SUPABASE_USER_ID,
      },
    },
  ],
};

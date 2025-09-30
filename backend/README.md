# Dorian Backend

This is the backend service for the Dorian portrait generator, designed to run on Vercel with cron jobs.

## Project Structure

```
backend/
├── api/                    # Vercel API routes
│   ├── cron.js            # Cron job endpoint
│   └── index.js           # Main API server
├── controllers/           # Business logic controllers
│   └── supabase.js       # Database operations
├── lib/                   # Core business logic
│   └── generateNano.js   # Image generation logic
├── scripts/              # Utility scripts
│   ├── test-cron.js      # Test cron job locally
│   ├── worker.js         # Legacy worker loop
│   └── log-activity.js   # Activity logging script
├── data/                 # Sample data files
├── images/               # Base images
├── config.js             # Configuration
├── prompts.json          # AI prompts
├── package.json          # Dependencies
├── vercel.json           # Vercel deployment config
└── env.template          # Environment variables template
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

```bash
cp env.template .env
# Edit .env with your actual values
```

### 3. Local Development

```bash
# Start the API server
npm start

# Test cron job locally
npm run test-cron

# Run legacy worker loop (optional)
npm run worker
```

## Deployment to Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Deploy

```bash
vercel --prod
```

### 3. Set Environment Variables

In Vercel dashboard, add these environment variables:

- `GEMINI_API_KEY`
- `RESCUETIME_API_KEY_JUSTIN`
- `RESCUETIME_API_KEY_EMILY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `CRON_SECRET` (generate with `openssl rand -hex 32`)

## API Endpoints

- `GET /` - API documentation
- `GET /health` - Health check
- `GET /api/:user/portrait-history` - Get user's portrait history
- `GET /api/:user/current-screentime` - Get user's current screentime data
- `POST /api/cron` - Cron job endpoint (secured with CRON_SECRET)

## Cron Jobs

The system runs automated image generation every minute (configurable in `vercel.json`):

- Checks RescueTime data for both users
- Generates new portraits when unproductive time thresholds are met
- Stores results in Supabase

## Scripts

- `npm start` - Start the API server
- `npm run dev` - Start with nodemon for development
- `npm run test-cron` - Test cron job locally
- `npm run worker` - Run legacy worker loop
- `npm run log-activity` - Run activity logging script

## Configuration

### Cron Schedule

Edit `vercel.json` to change the cron schedule:

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "*/5 * * * *" // Every 5 minutes
    }
  ]
}
```

### Timeouts

Function timeouts are configured in `vercel.json`:

- Cron job: 300 seconds (5 minutes)
- API endpoints: 30 seconds

## Troubleshooting

### Common Issues

1. **401 Unauthorized on cron**: Check `CRON_SECRET` environment variable
2. **Timeout errors**: Increase `maxDuration` in `vercel.json`
3. **Import errors**: Ensure all paths are relative to backend directory
4. **Missing environment variables**: Check Vercel dashboard settings

### Logs

- Check Vercel function logs in dashboard
- Use `console.log` statements for debugging
- Test locally with `npm run test-cron`

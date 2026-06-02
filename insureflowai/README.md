# InsureFlow AI

InsureFlow AI is a Next.js healthcare claims workflow app for document intake, AI extraction, validation queues, UB-04/PDF generation, and TPA submission readiness.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth
- Optional Express backend in `backend/`

## Getting Started

Install dependencies from the app folder:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

For local work, the app can run with `AI_PROVIDER=local` for deterministic extraction-based validation. Add `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` to enable LLM review over the extracted document text.

Start the frontend:

```bash
npm run dev
```

Open `http://localhost:4028`.

## Useful Scripts

```bash
npm run dev
npm run build
npm run lint
npm run type-check
npm run format
```

## Optional Backend

The `backend/` folder contains an Express API for claim validation workflows.

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

By default, the backend listens on `http://localhost:8787` and expects the frontend at `http://localhost:4028`.

## Environment Variables

Frontend variables live in `.env.example`.

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `AI_PROVIDER`
- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`

Backend variables live in `backend/.env.example`.

- `PORT`
- `CLIENT_URL`
- `MONGO_URI`
- `JWT_SECRET`
- `CLOUDINARY_*`
- AI provider keys

## Deployment

### Vercel

Deploy from this `insureflowai` folder.

- Root Directory: `insureflowai`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: leave empty

Set the required environment variables in Vercel Project Settings.

### Render

The parent repository includes a `render.yaml` blueprint with separate services for the frontend and backend. For the backend, set `MONGO_URI` to a hosted MongoDB connection string and set `CLIENT_URL` to the deployed frontend URL.

If Supabase redirects point to localhost after deployment, update Supabase Dashboard > Authentication > URL Configuration:

- Site URL: your deployed frontend URL
- Redirect URLs: `https://your-frontend-domain/auth/callback`

## Quality Gates

Before shipping changes, run:

```bash
npm run lint
npm run type-check
npm run build
```

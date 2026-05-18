# InsureFlow AI Backend

Production-style Express + MongoDB backend for the InsureFlow AI healthcare claim validation SaaS MVP.

## Stack

- Node.js + Express.js
- MongoDB + Mongoose
- JWT auth with role-based access
- Multer uploads with Cloudinary integration and local fallback
- Tesseract.js OCR pipeline
- Gemini/OpenAI integration with mock fallback for demos
- PDFKit master packet generation

## Setup

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

Default API URL:

```text
http://localhost:8787
```

Health check:

```text
GET /health
```

## Environment

```env
PORT=8787
CLIENT_URL=http://localhost:4028
MONGO_URI=mongodb://127.0.0.1:27017/insureflow_ai
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
OPENAI_API_KEY=
GEMINI_API_KEY=
AI_PROVIDER=local
MAX_FILE_SIZE_MB=20
```

Use `AI_PROVIDER=local` for deterministic validation from extracted document text without paid API keys. Switch to `openai`, `openrouter`, or `gemini` after adding the matching key for LLM review.

## Core APIs

Auth:

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me
```

Claims:

```text
POST   /claims/create
GET    /claims/all
GET    /claims/:id
PATCH  /claims/:id/status
DELETE /claims/:id
```

Documents:

```text
POST /upload/documents
GET  /documents/:id
```

AI workflow:

```text
POST /ocr/extract
POST /validate/claim
POST /detect/signature
POST /detect/blur
POST /generate/master-pdf
```

Analytics:

```text
GET /analytics/dashboard
GET /analytics/stats
```

Every route is also available under `/api`, for example `/api/auth/login`.

## Response Shape

```json
{
  "success": true,
  "message": "Human readable result",
  "data": {}
}
```

Errors use:

```json
{
  "success": false,
  "message": "Human readable error",
  "errors": []
}
```

## Recommended Frontend Flow

1. Register/login and store JWT client-side or in a secure app session wrapper.
2. Create a claim with `/claims/create`.
3. Upload categorized documents with `/upload/documents`.
4. Run `/ocr/extract` on each document.
5. Run `/detect/blur` and `/detect/signature` for scan quality.
6. Run `/validate/claim` for AI risk analysis and repair suggestions.
7. Generate export packet with `/generate/master-pdf`.
8. Pull `/analytics/dashboard` for enterprise dashboard widgets.

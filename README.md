# 🛡️ InsureFlow AI

### AI-Powered Insurance Claim Intelligence Platform

*Reduce claim rejections before submission through automated document validation, claim readiness scoring, and workflow automation.*

---

## 🚨 The Problem

Health insurance claims remain one of the most document-intensive processes in healthcare operations. A typical claim packet contains multiple complex documents that must align perfectly:

* 💳 **Insurance Card**
* 📝 **Pre-Authorization Forms**
* 🏥 **Discharge Summary**
* 🧾 **Hospital Invoice**
* 💊 **Prescriptions**
* 🔬 **Diagnostic/Lab Reports**
* 📋 **Clinical Notes & Supporting Evidence**

Reviewing these documents manually is **time-consuming**, **error-prone**, **expensive**, and **difficult to scale**. Insurance desk teams often discover issues only after claim submission, leading to:

* ⏳ Delayed approvals & payment cycles
* ❌ Avoidable claim rejections
* 📉 Revenue leakage
* 📁 Administrative overhead
* 👤 Poor patient experience

### 🔍 Common Validation Issues
* Missing patient DOB or incorrect name spelling
* Missing primary diagnosis codes (ICD-10)
* Missing physician/patient signatures
* Missing insurance ID numbers
* Invoices mismatched with clinical summaries
* Missing supporting documents/reports
* Low-quality or illegible page scans
* Missing pages in multi-page documents
* Inconsistent dates across documents

---

## 💡 The Solution

InsureFlow AI acts as an intelligent pre-submission review system. Instead of manually reviewing dozens of pages, users upload a claim packet, and the AI validation engine performs automated, multi-layered document verification.

### ⚙️ AI Workflow

```text
        Upload Claim Packet
                 │
                 ▼
      Document Classification
                 │
                 ▼
        Entity Extraction
                 │
                 ▼
        Validation Engine
                 │
                 ▼
         Risk Assessment
                 │
                 ▼
      Repair Recommendations
                 │
                 ▼
  Submission Readiness Evaluation
```

---

## 🎯 Core Features

### 📥 Smart Claim Intake
Upload insurance claim documents through a unified drag-and-drop interface. The platform supports:
- Insurance Cards
- Pre-Authorization Forms
- Hospital Invoices & Bills
- Discharge Summaries
- Prescriptions & Lab Reports
- Supporting Medical Evidence

### 🧠 AI Validation Engine
Automatically checks for:
- Missing patient information
- Missing diagnosis
- Missing signatures & stamps
- Missing insurance IDs
- Invoice discrepancies (amounts/items mismatch)
- Incomplete document sets or missing pages
- Documentation gaps & validation blockers

### 📊 Claim Health Scoring
Every claim is assessed and receives:
- **Claim Health Score (0-100)**: Quantitative completeness measure.
- **Submission Readiness Score**: Probability of frictionless approval.
- **Rejection Risk Indicator**: High/Medium/Low risk profiling.

### 🔄 Workflow Automation
Track claims as they transition through a structured lifecycle:

```text
   ┌───────────┐      ┌────────────┐      ┌──────────────┐
   │ NEW CLAIM │ ───> │ PROCESSING │ ───> │ UNDER REVIEW │
   └───────────┘      └────────────┘      └──────────────┘
                                                 │
                                                 ▼
   ┌───────────┐      ┌────────────┐      ┌──────────────┐
   │ APPROVED  │ <─── │ SUBMITTED  │ <─── │  READY FOR   │
   │/ REJECTED │      │            │      │  SUBMISSION  │
   └───────────┘      └────────────┘      └──────────────┘
```

---

## 🏗️ System Architecture

```text
       User Upload (Files)
               │
               ▼
        Next.js Frontend
               │
               ▼
    Claim Processing Engine ───> Document Classification
               │
               ▼
       Validation Engine
               │
               ▼
        Risk Assessment
               │
               ▼
      Supabase Database <───> Workflow Dashboard
```

---

## 📊 Platform Modules

* **Dashboard**: Monitor key metrics including total claims, pending reviews, submission queue, rejection risk trends, and average claim health.
* **All Claims**: A single source of truth registry tracking status, health scores, risk ratings, creation dates, and processing progress.
* **Validation Queue**: Claims requiring manual review, complete with detailed validation findings, structured repair recommendations, and resolution checklist logs.
* **Submission Queue**: Claims validated and approved for final submission. Ensures only validated claims move forward.
* **Analytics**: Detailed reports on operational processing efficiency, claim quality trends, and risk distribution.

---

## 🛠️ Tech Stack

### Frontend & Styling
* **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
* **Language**: [TypeScript](https://www.typescriptlang.org/)
* **Styling**: [Tailwind CSS](https://tailwindcss.com/)

### Backend & Database
* **Database & Authentication**: [Supabase](https://supabase.com/)
* **Backend Layer**: Next.js API Routes, Server Actions, and an optional Express server in `backend/`.
* **Database Storage**: Supabase Storage for secure PDF/Image hosting.

### AI Layer
* **LLM Workflows**: Powered by [OpenRouter](https://openrouter.ai/) and custom LLM validation workflows.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18.x or later)
- npm or yarn

### Installation
Clone the repository and install dependencies from the root directory:

```bash
npm install
```

### Environment Configuration
Create a local environment file:

```bash
cp .env.example .env
```

Define the following environment variables in `.env`:
```env
NEXT_PUBLIC_SITE_URL=http://localhost:4028
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
AI_PROVIDER=local # or openrouter / openai / gemini
OPENROUTER_API_KEY=your-key
OPENAI_API_KEY=your-key
GEMINI_API_KEY=your-key
```

*Note: For local development, setting `AI_PROVIDER=local` enables deterministic extraction-based validations without calling live LLMs.*

### Running the App
Start the development server:

```bash
npm run dev
```

Open your browser and navigate to **[http://localhost:4028](http://localhost:4028)**.

---

## ⚙️ Optional Express Backend

The `backend/` folder contains an Express API for claim validation workflows.

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

By default, the backend listens on `http://localhost:8787` and expects the frontend at `http://localhost:4028`.

#### Backend Environment Variables (`backend/.env`):
- `PORT` (e.g., `8787`)
- `CLIENT_URL` (e.g., `http://localhost:4028`)
- `MONGO_URI`
- `JWT_SECRET`
- `CLOUDINARY_*` credentials

---

## 🛠️ Useful Development Scripts

Run these commands in the root directory:

```bash
npm run dev          # Start the Next.js development server
npm run build        # Build the production bundle
npm run lint         # Run ESLint validation
npm run type-check   # Validate TypeScript types
npm run format       # Format codebase using Prettier
```

---

## ⚠️ Challenges Faced

During development, several real-world engineering hurdles were addressed:
1. **OCR & Extraction Reliability**: Medical documents arrive as low-quality scans, rotated mobile photographs, or native vector PDFs. Built robust preprocessing scripts (`ocr_pdf.py` and `layout_segmenter.py`) to structure raw text before LLM input.
2. **Workflow Consistency**: Keeping state synchronized between the main dashboard, validation queues, and submission tables required a unified state system built on top of Supabase.
3. **Template Variability**: No two hospitals generate the same layout. We shifted from rigid template-based regex parsing to layout-aware structural extraction and LLM validation.

---

## 📚 Key Learnings

* **Workflow > OCR**: The hardest part isn't extracting characters; it is designing a reliable, intuitive operations workspace where users can fix validation flags.
* **Single Source of Truth**: Moving all claim states and logs directly into Supabase simplified the app's real-time features and eliminated stale queues.
* **Product-First Iteration**: Validating business validation logic quickly creates more immediate value than over-optimizing parsing code early.

---

## 🚀 Roadmap

### 🏁 Phase 1 (Core Platform)
- [x] Claim Intake & file upload UI
- [x] AI-powered validation engine
- [x] Claim lifecycle status tracking
- [x] Dashboard analytics and visual charts

### ⚡ Phase 2 (Enhanced Extraction)
- [ ] Multi-document classification pipeline
- [ ] In-line document annotations for manual validation
- [ ] Automated repair suggestions powered by agentic loops

### 🔗 Phase 3 (Third-Party Integrations)
- [ ] TPA (Third Party Administrator) API endpoints & integrations
- [ ] UB-04 and CMS-1500 standard form generation
- [ ] Real submission APIs and approval tracking

### 🛡️ Phase 4 (Enterprise Security & Intelligence)
- [ ] Advanced claim fraud detection
- [ ] Predictive rejection prevention
- [ ] Enterprise deployment & historical patterns analytics

---

## 🌍 Vision

Build the operating system for insurance claim processing. By transforming claim reviews from manual, document-heavy operations into intelligent, AI-assisted workflows, we help healthcare providers submit cleaner claims, optimize billing, and eliminate avoidable administrative delays.

---
Built with ❤️ by [Shubham Singh](https://github.com/Shubham-singh1712) using Next.js, React, Tailwind CSS, and Supabase.

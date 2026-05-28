# StackSense 🔍

> AI-powered GitHub repository health analyzer. Paste any public repo URL and get a full security audit, dependency check, and codebase map in under 60 seconds.

## Live Demo
🔗 [stacksense-sandy.vercel.app](https://stacksense-sandy.vercel.app)

## What it does

StackSense runs 4 AI agents in parallel the moment you hit Analyze:

| Agent | Role |
|-------|------|
| **Mapper** | Walks the entire file tree and builds an interactive codebase graph |
| **Risk Detector** | Scans files for hardcoded secrets, weak crypto, and missing input validation |
| **Auditor** | Parses dependency files and flags outdated or high-risk packages |
| **Scorer** | Combines all findings into a final health score out of 100 |

## Features

- 🛡️ Real security vulnerability detection (tested on OWASP NodeGoat)
- 📦 Dependency auditing across 10+ package managers
- 🗺️ Interactive D3.js codebase visualizer
- 🌐 Supports 15+ languages including TypeScript, Python, Go, Rust, Java, and more
- ⚡ No account needed, no credit card, no code changes required

## Tech Stack

- **Framework:** Next.js 16, TypeScript
- **AI:** Meta Llama via Groq API
- **Data:** GitHub REST API (read-only)
- **Visualization:** D3.js
- **Styling:** Tailwind CSS, Radix UI
- **Deployment:** Vercel

## Getting Started

```bash
git clone https://github.com/ramsaran28/Stacksense
cd Stacksense
npm install
cp .env.example .env.local  # add your GROQ_API_KEY and GITHUB_TOKEN
npm run dev
```

## Environment Variables

# StackSense

StackSense is a free AI-powered tool that scans any public GitHub repository and gives you a full health report in under 60 seconds. No account needed, no credit card, no code changes required.

## What it does

Paste any public GitHub repo URL and StackSense will:
- Find security vulnerabilities like hardcoded secrets, weak crypto, and missing input validation
- Audit dependencies across multiple package managers and flag outdated or risky packages
- Map out your entire codebase structure as an interactive visual graph
- Give your repo an overall health score out of 100

## How it works

4 AI agents run in parallel the moment you hit Analyze:
- **Mapper** — walks the entire file tree and builds the codebase graph
- **Risk Detector** — scans files for security issues and code quality problems
- **Auditor** — parses dependency files and checks for vulnerabilities
- **Scorer** — combines all findings into a final health score

## Supported Languages
TypeScript, JavaScript, Python, Java, Go, Rust, Ruby, PHP, C/C++, Swift, Kotlin, Shell, Docker, GitHub Actions, and more

## Tech Stack
- Next.js 16, TypeScript
- Meta Llama via Groq API
- GitHub REST API (read-only)
- D3.js for codebase visualization
- Tailwind CSS, Radix UI
- Deployed on Vercel

## Live Demo
[stacksense-sandy.vercel.app](https://stacksense-sandy.vercel.app)

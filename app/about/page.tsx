"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

type Particle = { x: number; y: number; vx: number; vy: number };

export default function About() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const init = () => {
      particles = [];
      for (let i = 0; i < 120; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#04151A";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(50,95,87,${(1 - dist / 120) * 0.5})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(111,148,135,0.7)";
        ctx.fill();
      });

      animationId = requestAnimationFrame(draw);
    };

    const onResize = () => {
      resize();
      init();
    };

    resize();
    init();
    draw();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#04151A", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0 }}
      />

      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          pointerEvents: "none",
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }}
      />

      {/* Navbar */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1.5rem 2rem",
          backdropFilter: "blur(12px)",
          background: "rgba(4,21,26,0.8)",
          borderBottom: "0.5px solid rgba(50,95,87,0.2)",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              background: "#325F57",
              borderRadius: "6px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: "3px",
              padding: "5px 4px",
            }}
          >
            <span style={{ display: "block", width: "100%", height: "2.5px", background: "#04151A", borderRadius: "2px" }} />
            <span
              style={{
                display: "block",
                width: "65%",
                height: "2.5px",
                background: "#04151A",
                borderRadius: "2px",
                alignSelf: "flex-start",
              }}
            />
            <span style={{ display: "block", width: "85%", height: "2.5px", background: "#04151A", borderRadius: "2px" }} />
          </div>
          <span
            style={{
              fontSize: "17px",
              fontWeight: 600,
              color: "#ffffff",
              fontFamily: "Outfit, sans-serif",
              letterSpacing: "-0.02em",
            }}
          >
            StackSense
          </span>
        </Link>
        <div style={{ display: "flex", gap: "2rem", fontFamily: "Outfit, sans-serif", fontSize: "15px" }}>
          <Link href="/#features" style={{ color: "#c4ddd5", textDecoration: "none" }}>
            Features
          </Link>
          <Link href="/#how-it-works" style={{ color: "#c4ddd5", textDecoration: "none" }}>
            How it works
          </Link>
          <Link href="/#agents" style={{ color: "#c4ddd5", textDecoration: "none" }}>
            Agents
          </Link>
          <Link href="/about" style={{ color: "#ffffff", textDecoration: "none" }}>
            About
          </Link>
        </div>
        <Link
          href="/dashboard"
          style={{
            background: "#325F57",
            color: "#04151A",
            padding: "10px 24px",
            borderRadius: "6px",
            textDecoration: "none",
            fontFamily: "Outfit, sans-serif",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Get started free →
        </Link>
      </nav>

      {/* Status bar */}
      <div
        style={{
          position: "fixed",
          top: "73px",
          left: 0,
          right: 0,
          zIndex: 99,
          background: "#092828",
          borderBottom: "1px solid #163E3C",
          padding: "6px 2rem",
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: "11px",
          color: "#325F57",
        }}
      >
        <span>SYS:STACKSENSE-OS / BUILD 2026.05</span>
        <span>● ALL_SYSTEMS_NOMINAL · ABOUT</span>
      </div>

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: "900px",
          margin: "0 auto",
          padding: "180px 2rem 6rem",
          textAlign: "center",
        }}
      >
        {/* Hero */}
        <div
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: "11px",
            color: "#325F57",
            letterSpacing: "0.12em",
            marginBottom: "2rem",
          }}
        >
          ▸ OPEN BETA
        </div>
        <h1
          style={{
            fontFamily: "DM Serif Display, serif",
            fontSize: "clamp(52px, 8vw, 88px)",
            color: "#ffffff",
            lineHeight: 1.05,
            fontWeight: 400,
            marginBottom: "1.5rem",
          }}
        >
          We got hacked.
          <br />
          <span style={{ fontStyle: "italic" }}>So we built this.</span>
        </h1>
        <p
          style={{
            fontFamily: "Outfit, sans-serif",
            fontSize: "18px",
            color: "#b8d4c8",
            maxWidth: "580px",
            margin: "0 auto 1.5rem",
            lineHeight: 1.8,
          }}
        >
          Every hackathon, every side project — you&apos;re so deep in building that security is the last thing on your mind.
          As a young developer still learning, you skip the audit. You hardcode the key just this once. You forget to check
          your dependencies. Not because you don&apos;t care — but because nobody told you to look, and the tools that exist
          are built for enterprise teams, not for developers like us who are still figuring things out. We built StackSense
          because we kept making these mistakes ourselves. Before you deploy, before you ship, before it&apos;s too late —
          now you have somewhere to check.
        </p>
        <p
          style={{
            fontFamily: "DM Serif Display, serif",
            fontSize: "26px",
            color: "#D4AF37",
            fontStyle: "italic",
            marginBottom: "5rem",
          }}
        >
          Built by a young developer, for every developer still learning.
        </p>

        {/* 3 Problems */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "1px",
            background: "rgba(50,95,87,0.2)",
            borderRadius: "12px",
            overflow: "hidden",
            marginBottom: "5rem",
          }}
        >
          {[
            {
              num: "01",
              title: "Too expensive.",
              body: "Enterprise security tools cost $500–$2,000/month. Small teams are priced out of professional security. They ship vulnerable code not because they don't care — but because they can't afford not to.",
            },
            {
              num: "02",
              title: "Too complex.",
              body: "CVE-2024-21538. CVSS score 7.2. What does that mean for your app? Security tools give you data. Nobody gives you answers in plain English.",
            },
            {
              num: "03",
              title: "Too slow.",
              body: "Manual audits take days. By the time a vulnerability is found, it's already in production. The feedback loop between writing vulnerable code and knowing about it is completely broken.",
            },
          ].map((p, i) => (
            <div key={i} style={{ background: "#092828", padding: "2.5rem 2rem", textAlign: "left" }}>
              <div
                style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: "11px",
                  color: "#D4AF37",
                  letterSpacing: "0.12em",
                  marginBottom: "1rem",
                }}
              >
                PROBLEM {p.num}
              </div>
              <div style={{ fontFamily: "DM Serif Display, serif", fontSize: "26px", color: "#ffffff", marginBottom: "1rem" }}>
                {p.title}
              </div>
              <div style={{ fontFamily: "Outfit, sans-serif", fontSize: "14px", color: "#b8d4c8", lineHeight: 1.7 }}>{p.body}</div>
            </div>
          ))}
        </div>

        {/* Quote */}
        <div
          style={{
            borderLeft: "3px solid #D4AF37",
            paddingLeft: "1.5rem",
            textAlign: "left",
            maxWidth: "600px",
            margin: "0 auto 5rem",
          }}
        >
          <p style={{ fontFamily: "DM Serif Display, serif", fontSize: "28px", color: "#D4AF37", fontStyle: "italic", lineHeight: 1.4 }}>
            &ldquo;Security has always been a privilege.
            <br />
            We think that&apos;s wrong.&rdquo;
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", justifyContent: "center", gap: "5rem", marginBottom: "5rem", flexWrap: "wrap" }}>
          {[
            { num: "158", label: "avg vulnerabilities per codebase" },
            { num: "73%", label: "devs lack time for manual audits" },
            { num: "$0", label: "what StackSense costs. forever." },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "DM Serif Display, serif", fontSize: "72px", color: "#D4AF37", lineHeight: 1 }}>{s.num}</div>
              <div
                style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: "11px",
                  color: "#6F9487",
                  marginTop: "8px",
                  maxWidth: "160px",
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Built at */}
        <div style={{ marginBottom: "5rem" }}>
          <div
            style={{
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: "11px",
              color: "#D4AF37",
              border: "1px solid rgba(212,175,55,0.3)",
              borderRadius: "999px",
              padding: "6px 16px",
              display: "inline-block",
              marginBottom: "1.5rem",
            }}
          >
            ▸ SHIPPED FAST · STILL IMPROVING
          </div>
          <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "48px", color: "#ffffff", marginBottom: "0.5rem" }}>
            Built in 24 hours.
          </h2>
          <p
            style={{
              fontFamily: "DM Serif Display, serif",
              fontSize: "26px",
              color: "#D4AF37",
              fontStyle: "italic",
              marginBottom: "1.5rem",
            }}
          >
            With coffee and a genuine belief that this matters.
          </p>
          <p
            style={{
              fontFamily: "Outfit, sans-serif",
              fontSize: "16px",
              color: "#b8d4c8",
              maxWidth: "520px",
              margin: "0 auto 1.5rem",
              lineHeight: 1.8,
            }}
          >
            We didn&apos;t build this for the hackathon. We built this because every developer deserves to know if their code is
            safe.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            {["Meta Llama", "Groq API", "Next.js 14", "TypeScript", "D3.js", "Tailwind CSS", "Vercel"].map((t) => (
              <span
                key={t}
                style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: "12px",
                  color: "#325F57",
                  background: "#092828",
                  border: "1px solid #163E3C",
                  borderRadius: "999px",
                  padding: "6px 14px",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div style={{ paddingBottom: "4rem" }}>
          <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "64px", color: "#ffffff", marginBottom: "0.5rem" }}>
            Your codebase has secrets.
          </h2>
          <p
            style={{
              fontFamily: "DM Serif Display, serif",
              fontSize: "32px",
              color: "#D4AF37",
              fontStyle: "italic",
              marginBottom: "1rem",
            }}
          >
            Don&apos;t find out the hard way.
          </p>
          <p style={{ fontFamily: "Outfit, sans-serif", fontSize: "16px", color: "#b8d4c8", marginBottom: "2rem" }}>
            It takes 60 seconds. It costs nothing. It might save everything.
          </p>
          <Link
            href="/dashboard"
            style={{
              background: "#325F57",
              color: "#04151A",
              padding: "16px 40px",
              borderRadius: "8px",
              textDecoration: "none",
              fontFamily: "Outfit, sans-serif",
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            Scan My Repository →
          </Link>
          <div
            style={{
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: "11px",
              color: "rgba(111,148,135,0.5)",
              marginTop: "1rem",
            }}
          >
            No account · No credit card · No code changes · Just answers.
          </div>
        </div>
      </div>
    </div>
  );
}

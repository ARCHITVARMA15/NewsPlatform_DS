import Link from "next/link";
import {
  ArrowRight,
  BarChart2,
  Bot,
  FileSearch,
  Globe2,
  Newspaper,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-[#0a0f18] text-slate-100 overflow-x-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/5 bg-[#0a0f18]/80 backdrop-blur-md px-6 md:px-20 py-4">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/40">
            <Globe2 className="size-5 text-white" />
          </div>
          <span className="text-white text-xl font-bold tracking-tight">Datastraw</span>
        </div>

        <nav className="hidden md:flex items-center gap-10">
          <Link href="/dashboard" className="text-slate-300 text-sm font-medium hover:text-blue-400 transition-colors">Dashboard</Link>
          <Link href="/news"      className="text-slate-300 text-sm font-medium hover:text-blue-400 transition-colors">News Feed</Link>
          <Link href="/agent"     className="text-slate-300 text-sm font-medium hover:text-blue-400 transition-colors">News Agent</Link>
          <Link href="/rag"       className="text-slate-300 text-sm font-medium hover:text-blue-400 transition-colors">RAG Agent</Link>
        </nav>

        <Link
          href="/agent"
          className="hidden sm:flex min-w-[130px] cursor-pointer items-center justify-center rounded-lg h-10 px-5 bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/30"
        >
          Get Started
        </Link>
      </header>

      <main className="flex-1">

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden px-6">

          {/* Pulsing glow orb behind the globe */}
          <div className="glow-orb pulse-sync absolute top-1/2 left-1/2 w-[700px] h-[700px] rounded-full blur-3xl pointer-events-none" />

          {/* Rotating globe image */}
          <div className="absolute inset-0 z-0 flex items-center justify-center opacity-60 mix-blend-screen pointer-events-none">
            <div className="relative max-w-5xl w-full aspect-square flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDo-blFaVCBxES52uHsh7bXCN44uRhewQASVtYVW7GfL3IC-B0pxs5CoQiWqn8TQ5LKDXQlGaMOxrYHZCZ0BTJgK4J5WCPm08Mf3iR7b9N3u88RBJLpLDiYw2wSHqa3y9F5Kx28ih_4w9vCA9N26k-LVrWB-C6hjYRbY8mqT6DMyjkoTITuPJ9xcnD_b67usL5qKAY4iSIAWyqCeHB-EcFJoFBLOUTyl-6n74tB9hEoPfNFm8eu7jkLHeDXm9oLoChtBO4qdS3z6xdd"
                alt="Futuristic glowing 3D digital globe"
                className="w-full h-full object-contain mask-image-radial rotate-slow"
              />
            </div>
          </div>

          {/* Hero content */}
          <div className="relative z-10 max-w-[960px] text-center flex flex-col items-center gap-8">

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-600/10 border border-blue-600/30 text-blue-400 text-xs font-bold tracking-widest uppercase backdrop-blur-sm">
              <Sparkles className="size-3.5" />
              AI-Powered News Intelligence
            </div>

            {/* Headline */}
            <h1 className="text-white text-5xl md:text-8xl font-bold leading-[1.05] tracking-tighter">
              The Future of{" "}
              <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-purple-500 bg-clip-text text-transparent">
                News
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-slate-400 text-lg md:text-2xl max-w-2xl leading-relaxed font-light">
              Research, analyze, and discover insights from thousands of global news sources
              using LangGraph AI agents with human-in-the-loop intelligence.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-4 justify-center mt-4">
              <Link
                href="/agent"
                className="group flex items-center gap-3 min-w-[210px] justify-center rounded-xl h-14 px-8 bg-blue-600 text-white text-lg font-bold shadow-lg shadow-blue-600/40 hover:scale-105 hover:shadow-cyan-500/30 active:scale-95 transition-all"
              >
                Launch News Agent
                <ArrowRight className="size-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-3 min-w-[180px] justify-center rounded-xl h-14 px-8 bg-white/5 text-white text-lg font-bold border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all"
              >
                View Dashboard
              </Link>
            </div>
          </div>
        </section>

        {/* ── Agent Pipeline Section ───────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 py-32">
          <div className="flex flex-col lg:flex-row items-center gap-16">

            {/* Left — Pipeline terminal mockup */}
            <div className="w-full lg:w-3/5">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-2xl opacity-20 blur-xl group-hover:opacity-40 transition-opacity" />
                <div className="relative bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden shadow-2xl">

                  {/* Terminal title bar */}
                  <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="size-3 rounded-full bg-[#ff5f56]" />
                        <div className="size-3 rounded-full bg-[#ffbd2e]" />
                        <div className="size-3 rounded-full bg-[#27c93f]" />
                      </div>
                      <span className="ml-4 text-xs font-mono text-slate-400">datastraw — news-agent/pipeline</span>
                    </div>
                    <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-full px-3 py-1">
                      <div className="size-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(0,245,255,0.8)]" />
                      <div className="flex items-center gap-0.5 h-4 mx-1">
                        <div className="wave-bar" style={{ animationDelay: "0.1s" }} />
                        <div className="wave-bar" style={{ animationDelay: "0.3s" }} />
                        <div className="wave-bar" style={{ animationDelay: "0.2s" }} />
                        <div className="wave-bar" style={{ animationDelay: "0.4s" }} />
                      </div>
                      <span className="text-[10px] font-bold text-cyan-400 tracking-wider">AGENT RUNNING</span>
                    </div>
                  </div>

                  {/* Query input */}
                  <div className="px-6 py-4 border-b border-white/5 bg-[#1c2128]/50 flex items-center gap-3">
                    <Search className="size-4 text-cyan-400 flex-shrink-0" />
                    <p className="text-slate-300 font-mono italic text-sm">
                      &quot;Analyze AI regulation trends across global news sources&quot;
                    </p>
                  </div>

                  {/* Pipeline steps */}
                  <div className="p-6 space-y-3 font-mono text-sm">
                    {[
                      { node: "query_planner",    status: "done",    detail: "4 sub-queries generated" },
                      { node: "web_search",       status: "done",    detail: "28 sources retrieved" },
                      { node: "newsdata_fetch",   status: "done",    detail: "15 articles · credibility ≥ 0.8" },
                      { node: "source_validator", status: "done",    detail: "12 sources validated" },
                      { node: "insight_generator",status: "running", detail: "synthesizing insights…" },
                    ].map((step) => (
                      <div key={step.node} className="flex items-center gap-3">
                        <div
                          className={`size-2 rounded-full flex-shrink-0 ${
                            step.status === "done"
                              ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                              : "bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(0,245,255,0.6)]"
                          }`}
                        />
                        <span className={step.status === "done" ? "text-emerald-400" : "text-cyan-400"}>
                          {step.node}
                        </span>
                        <span className="text-slate-500 text-xs">→ {step.detail}</span>
                      </div>
                    ))}

                    {/* Sample insight output */}
                    <div className="mt-5 p-4 rounded-lg bg-blue-600/10 border border-blue-600/20">
                      <p className="text-[11px] text-slate-500 font-mono mb-1">insight[1] · confidence 0.88</p>
                      <p className="text-blue-200 text-xs font-mono leading-relaxed">
                        &quot;EU AI Act implementation creating regulatory fragmentation across member states,
                        with 73% of tech firms reporting compliance challenges as enforcement begins Q3 2025…&quot;
                      </p>
                    </div>
                  </div>

                  {/* Status bar */}
                  <div className="px-4 py-2 bg-[#161b22] border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-cyan-400">
                        <Bot className="size-3" />
                        LangGraph
                      </div>
                      <span>Groq · LLaMA-3.3-70b</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span>5 nodes</span>
                      <div className="flex items-center gap-1 text-emerald-400">
                        <span>✓</span>
                        <span>HITL Ready</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — feature descriptions */}
            <div className="w-full lg:w-2/5 flex flex-col gap-6">
              <h2 className="text-white text-4xl md:text-5xl font-bold tracking-tight">
                Intelligence at Scale
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                LangGraph-powered agents autonomously research, validate, and synthesize news
                from thousands of global sources — with human-in-the-loop control at every step.
              </p>
              <div className="flex flex-col gap-4 mt-4">
                <div className="flex gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors group">
                  <div className="size-12 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all flex-shrink-0">
                    <Zap className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold mb-1">Agentic Research Pipeline</h3>
                    <p className="text-slate-400 text-sm">
                      Multi-step agents that plan queries, validate sources, and generate
                      structured insights with confidence scores and bias analysis.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors group">
                  <div className="size-12 rounded-lg bg-cyan-400/20 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-400 group-hover:text-[#0a0f18] transition-all flex-shrink-0">
                    <FileSearch className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold mb-1">PDF + Web RAG</h3>
                    <p className="text-slate-400 text-sm">
                      Upload research documents and query them alongside live web search,
                      with FAISS vector retrieval and fully cited answers.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors group">
                  <div className="size-12 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-all flex-shrink-0">
                    <Shield className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold mb-1">Source Credibility Scoring</h3>
                    <p className="text-slate-400 text-sm">
                      Every source is scored for credibility, bias, and political lean
                      before contributing to your research output.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Platform Stats ───────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 py-20 border-t border-white/10">
          <div className="flex items-center gap-3 mb-10">
            <TrendingUp className="size-5 text-blue-400" />
            <h2 className="text-white text-2xl font-bold">Platform Intelligence</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { label: "Articles Analyzed",        value: "50K+",     change: "+18%" },
              { label: "News Sources Tracked",      value: "1,200+",   change: "+34%" },
              { label: "AI Insights Generated",     value: "10K+ /day",change: "+47%" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col gap-4 rounded-2xl p-8 border border-white/5 bg-white/5 backdrop-blur-sm hover:border-white/10 transition-colors"
              >
                <p className="text-slate-400 font-medium">{stat.label}</p>
                <div className="flex items-end justify-between">
                  <p className="text-white text-4xl font-bold tracking-tight">{stat.value}</p>
                  <span className="flex items-center text-emerald-400 text-sm font-bold bg-emerald-500/10 px-2 py-1 rounded">
                    <TrendingUp className="size-3.5 mr-1" />
                    {stat.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Navigation Cards ─────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-6 py-20 border-t border-white/10">
          <h2 className="text-white text-2xl font-bold mb-2 text-center">Explore the Platform</h2>
          <p className="text-slate-500 text-center mb-10">Four powerful tools, one unified intelligence platform.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { href: "/dashboard", Icon: BarChart2,  iconColor: "text-blue-400",   hoverBg: "group-hover:bg-blue-600",    bg: "bg-blue-600/10",   title: "Dashboard",  desc: "Analytics & sentiment trends"  },
              { href: "/news",      Icon: Newspaper,  iconColor: "text-emerald-400", hoverBg: "group-hover:bg-emerald-500", bg: "bg-emerald-500/10",title: "News Feed",  desc: "Browse & search all articles"  },
              { href: "/agent",     Icon: Zap,        iconColor: "text-yellow-400",  hoverBg: "group-hover:bg-yellow-500",  bg: "bg-yellow-500/10", title: "News Agent", desc: "AI research assistant"         },
              { href: "/rag",       Icon: FileSearch, iconColor: "text-purple-400",  hoverBg: "group-hover:bg-purple-500",  bg: "bg-purple-500/10", title: "RAG Agent",  desc: "PDF + web research"            },
            ].map(({ href, Icon, iconColor, hoverBg, bg, title, desc }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-center gap-3 rounded-xl border border-white/5 bg-white/5 p-6 hover:border-white/20 hover:bg-white/10 transition-all"
              >
                <div className={`size-12 rounded-xl ${bg} ${hoverBg} flex items-center justify-center transition-all`}>
                  <Icon className={`size-6 ${iconColor} group-hover:text-white transition-colors`} />
                </div>
                <span className="font-semibold text-slate-200">{title}</span>
                <span className="text-xs text-slate-500 text-center">{desc}</span>
              </Link>
            ))}
          </div>
        </section>

      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-black/50 border-t border-white/5 py-12 px-6 md:px-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="size-6 bg-blue-600/20 rounded-md flex items-center justify-center">
              <Globe2 className="size-4 text-blue-400" />
            </div>
            <span className="text-white font-bold tracking-tight">Datastraw</span>
          </div>
          <div className="flex flex-wrap gap-8 text-sm font-medium text-slate-400">
            <Link href="/dashboard" className="hover:text-blue-400 transition-colors">Dashboard</Link>
            <Link href="/news"      className="hover:text-blue-400 transition-colors">News Feed</Link>
            <Link href="/agent"     className="hover:text-blue-400 transition-colors">News Agent</Link>
            <Link href="/rag"       className="hover:text-blue-400 transition-colors">RAG Agent</Link>
          </div>
          <p className="text-slate-600 text-sm">
            © 2026 Datastraw Technologies. All rights reserved.
          </p>
        </div>
      </footer>

    </div>
  );
}

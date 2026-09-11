import { motion, useInView } from "framer-motion";
import { ArrowRight, ShieldAlert, Landmark, FileText, PhoneCall } from "lucide-react";
import { useRef } from "react";

/* ---------------- WordsPullUp ---------------- */
interface WordsPullUpProps {
  text: string;
  className?: string;
  showAsterisk?: boolean;
  style?: React.CSSProperties;
}

export const WordsPullUp = ({ text, className = "", showAsterisk = false, style }: WordsPullUpProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const words = text.split(" ");

  return (
    <div ref={ref} className={`inline-flex flex-wrap ${className}`} style={style}>
      {words.map((word, i) => {
        const isLast = i === words.length - 1;
        return (
          <motion.span
            key={i}
            initial={{ y: 24, opacity: 0 }}
            animate={isInView ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.65, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="inline-block relative"
            style={{ marginRight: isLast ? 0 : "0.22em" }}
          >
            {word}
            {showAsterisk && isLast && (
              <span className="absolute top-[0.62em] -right-[0.32em] text-[0.32em] text-[#f59e0b]">*</span>
            )}
          </motion.span>
        );
      })}
    </div>
  );
};

/* ---------------- ChronicAI Hero ---------------- */
const navItems = [
  { label: "Overview", href: "#overview" },
  { label: "Report Issue", href: "/html/report-problem.html" },
  { label: "Live Disaster Map", href: "#homepageMapTitle" },
  { label: "Government EOC", href: "/html/admin-login.html" },
  { label: "Resource Center", href: "/html/resource-center.html" },
];

export const ChronicHero = () => {
  return (
    <section className="min-h-screen w-full p-2 sm:p-4 md:p-6 bg-[#0c131d]">
      <div className="relative min-h-[92vh] w-full overflow-hidden rounded-2xl md:rounded-[2rem] border border-white/10 shadow-2xl flex flex-col justify-between">
        
        {/* Background video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4"
        />

        {/* Atmospheric noise & gradient overlays */}
        <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] mix-blend-overlay" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a1420] via-black/40 to-black/70" />

        {/* Floating Capsule Navbar */}
        <header className="relative z-20 w-full pt-3 px-4 flex justify-center">
          <nav className="flex items-center gap-2 sm:gap-4 md:gap-8 rounded-full bg-black/85 backdrop-blur-md px-4 py-2 border border-white/15 shadow-xl">
            <a href="/" className="font-serif font-bold text-white tracking-tight text-xs sm:text-sm mr-2 flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#1B3A6B] text-white text-[10px]">C</span>
              ChronicAI
            </a>
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-[11px] sm:text-xs md:text-sm font-medium transition-colors text-[#e1e0cc]/80 hover:text-[#fde68a]"
              >
                {item.label}
              </a>
            ))}
            <a
              href="/html/login.html"
              className="ml-2 text-xs font-semibold px-3 py-1 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all"
            >
              Sign In
            </a>
          </nav>
        </header>

        {/* Hero Bottom Layout */}
        <div className="relative z-10 px-6 sm:px-10 md:px-14 pb-10 sm:pb-14 pt-28">
          <div className="grid grid-cols-12 items-end gap-6">
            
            {/* Gigantic Display Typography */}
            <div className="col-span-12 lg:col-span-8">
              <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[#93c5fd] mb-3 px-3 py-1 rounded bg-white/5 border border-white/10">
                <ShieldAlert className="w-3.5 h-3.5 text-[#f59e0b]" /> Autonomous Civic & Emergency Response
              </span>
              <h1
                className="font-bold leading-[0.84] tracking-[-0.06em] text-[20vw] sm:text-[18vw] md:text-[16vw] lg:text-[13vw] text-[#E1E0CC]"
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              >
                <WordsPullUp text="ChronicAI" showAsterisk />
              </h1>
            </div>

            {/* Right Action Column */}
            <div className="col-span-12 flex flex-col gap-5 pb-2 lg:col-span-4">
              
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm sm:text-base text-[#d1d5db] font-sans leading-relaxed"
              >
                A unified civic infrastructure and emergency triage platform connecting citizens, disaster response fleets, and municipal authorities to coordinate real-time resolution.
              </motion.p>

              <div className="flex flex-wrap items-center gap-3">
                {/* Primary CTA */}
                <motion.a
                  href="/html/report-problem.html"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
                  className="group inline-flex items-center gap-3 rounded-full bg-[#fde047] py-1.5 pl-6 pr-1.5 text-sm font-bold text-black transition-all hover:bg-[#fef08a] hover:gap-4 shadow-lg shadow-yellow-500/20"
                >
                  Report Incident
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black transition-transform group-hover:scale-110">
                    <ArrowRight className="h-4 w-4 text-[#fde047]" />
                  </span>
                </motion.a>

                {/* Secondary Authority Link */}
                <motion.a
                  href="/html/admin-login.html"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.75, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-xs font-semibold text-white/90 hover:bg-white/10 transition-all"
                >
                  <Landmark className="w-3.5 h-3.5 text-[#93c5fd]" /> Authority Access
                </motion.a>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

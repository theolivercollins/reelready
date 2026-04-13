import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Play, DollarSign, Clock, Film, Upload, Sparkles, Download, ChevronDown, Plus, Minus, Mail, CheckCircle, Loader2 } from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import heroVideo from "@/assets/hero-video-loop.mp4.asset.json";
import heroBg from "@/assets/hero-bg.jpg";
import interior1 from "@/assets/interior-1.jpg";
import exterior1 from "@/assets/exterior-1.jpg";
import kitchen1 from "@/assets/kitchen-1.jpg";
import bathroom1 from "@/assets/bathroom-1.jpg";
import aerial1 from "@/assets/aerial-1.jpg";
import showcaseInterior from "@/assets/showcase-interior.mp4.asset.json";
import showcaseKitchen from "@/assets/showcase-kitchen.mp4.asset.json";
import showcaseBathroom from "@/assets/showcase-bathroom.mp4.asset.json";
import showcaseAerial from "@/assets/showcase-aerial.mp4.asset.json";
import showcaseExterior from "@/assets/showcase-exterior.mp4.asset.json";
import showcaseBeach from "@/assets/showcase-beach.mp4.asset.json";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-foreground/10">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-6 text-left group"
      >
        <span className="font-display text-base md:text-lg font-medium text-foreground pr-8">{question}</span>
        <div className="shrink-0 h-8 w-8 rounded-full border border-foreground/20 flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-all">
          {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </div>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden"
      >
        <p className="text-sm text-muted-foreground leading-relaxed pb-6 max-w-2xl">{answer}</p>
      </motion.div>
    </div>
  );
};

const Index = () => {
  const { user, profile } = useAuth();
  const accountHref = profile?.role === "admin" ? "/dashboard" : "/account";
  const accountLabel = profile?.role === "admin" ? "Dashboard" : "Account";
  const navigate = useNavigate();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  // Auth modal state
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authFirst, setAuthFirst] = useState("");
  const [authLast, setAuthLast] = useState("");
  const [authBrokerage, setAuthBrokerage] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const openAuth = (tab: "signin" | "signup") => {
    setAuthTab(tab);
    setAuthEmail("");
    setAuthFirst("");
    setAuthLast("");
    setAuthBrokerage("");
    setAuthSent(false);
    setAuthError("");
    setAuthOpen(true);
  };

  const handleGetStarted = () => {
    if (user) {
      navigate("/upload");
    } else {
      openAuth("signup");
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const metadata = authTab === "signup"
        ? { first_name: authFirst, last_name: authLast, brokerage: authBrokerage }
        : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: metadata,
        },
      });
      if (error) throw error;
      setAuthSent(true);
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAuthLoading(false);
    }
  };

  const faqs = [
    { question: "How many photos do I need to submit?", answer: "We require a minimum of 10 and accept up to 60 high-quality property photos. The more photos you provide, the more diverse and cinematic your final video will be. We recommend including a mix of exterior, interior, and detail shots." },
    { question: "What is the turnaround time?", answer: "Standard delivery is within 72 hours of submission. Our AI-powered pipeline processes your photos through multiple stages — scene planning, video generation, quality control, and final assembly — to ensure a polished, cinematic result." },
    { question: "What video formats do I receive?", answer: "You can choose vertical (9:16 for Instagram Reels, TikTok), horizontal (16:9 for YouTube, MLS), or both formats. Each video includes professional transitions, music, and optional AI voiceover narration." },
    { question: "Can I request revisions?", answer: "Yes. If you're not satisfied with your video, we offer one round of revisions at no additional cost. Simply provide feedback through your status page and we'll make adjustments within 48 hours." },
    { question: "How does pricing compare to traditional videography?", answer: "Traditional real estate videography typically costs $500–$2,000+ per property and takes 1–2 weeks. Listing Elevate starts at just $75 with 72-hour delivery, saving you up to 85% while delivering cinematic quality." },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="absolute top-0 left-0 right-0 z-30 px-8 md:px-16 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5">
          <span className="font-display text-2xl font-semibold tracking-tight text-white">Listing Elevate</span>
        </Link>
        <div className="flex items-center gap-8">
          {user && (
            <>
              <Link to={accountHref} className="hidden md:inline text-[11px] tracking-[0.25em] uppercase text-white/80 hover:text-white transition-colors font-medium">
                {accountLabel}
              </Link>
              <Link to="/upload" className="hidden md:inline text-[11px] tracking-[0.25em] uppercase text-white/80 hover:text-white transition-colors font-medium">
                Upload
              </Link>
            </>
          )}
          {!user && (
            <button onClick={() => openAuth("signin")} className="hidden md:inline text-[11px] tracking-[0.25em] uppercase text-white/80 hover:text-white transition-colors font-medium">
              Sign In
            </button>
          )}
          <Button size="sm" className="tracking-[0.2em] uppercase text-[11px] px-7 rounded-none font-medium bg-white text-foreground hover:bg-white/90" onClick={handleGetStarted}>
            Get Started
          </Button>
        </div>
      </nav>

      {/* Hero — full-bleed cinematic video */}
      <section ref={heroRef} className="relative h-screen w-full flex items-center justify-center overflow-hidden">
        <motion.div style={{ scale: heroScale }} className="absolute inset-0">
          <video
            autoPlay
            loop
            muted
            playsInline
            poster={heroBg}
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src={heroVideo.url} type="video/mp4" />
          </video>
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/70 backdrop-blur-[2px]" />
        <div className="absolute inset-0" style={{ boxShadow: "inset 0 120px 140px -40px rgba(0,0,0,0.5), inset 0 -120px 140px -40px rgba(0,0,0,0.5)" }} />

        <motion.div
          style={{ opacity: heroOpacity }}
          className="relative z-10 text-center max-w-3xl px-8"
        >
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-[11px] tracking-[0.4em] uppercase text-white/70 font-medium block mb-6"
          >
            Cinematic Real Estate Video
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.05] tracking-tight text-white"
          >
            Every Listing Deserves
            <br />
            <em className="italic text-accent">a Premiere.</em>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="text-sm md:text-base text-white/70 max-w-md mx-auto leading-relaxed mt-6"
          >
            Upload your property photos and receive stunning, cinematic listing videos — crafted by AI, delivered in hours.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="flex items-center justify-center gap-4 mt-10"
          >
            <Button size="lg" className="px-10 tracking-[0.15em] uppercase text-[11px] rounded-none font-medium bg-white text-foreground hover:bg-white/90" onClick={handleGetStarted}>
              Upload Photos <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
            {!user && (
              <Button size="lg" variant="outline" className="px-10 tracking-[0.15em] uppercase text-[11px] rounded-none font-medium border-white text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm" onClick={() => openAuth("signin")}>
                <Play className="mr-2 h-3.5 w-3.5" /> Sign In
              </Button>
            )}
          </motion.div>
        </motion.div>

        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10"
        >
          <ChevronDown className="h-6 w-6 text-white/50" />
        </motion.div>
      </section>

      {/* How It Works */}
      <section className="px-8 md:px-16 py-24 md:py-32">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center mb-20"
          >
            <motion.span variants={fadeUp} custom={0} className="text-[11px] tracking-[0.35em] uppercase text-muted-foreground font-medium">
              The Process
            </motion.span>
            <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl md:text-5xl font-semibold text-foreground mt-4">
              Three Simple Steps
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-muted-foreground mt-4 max-w-lg mx-auto">
              From photos to premiere-ready video in 72 hours. No filming crew, no scheduling, no hassle.
            </motion.p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {[
              {
                icon: <Upload className="h-6 w-6" />,
                step: "01",
                title: "Upload Photos",
                desc: "Submit 10–60 high-quality property photos through our premium upload portal. Select your video type, duration, and format.",
                image: kitchen1,
              },
              {
                icon: <Sparkles className="h-6 w-6" />,
                step: "02",
                title: "AI Production",
                desc: "Our cinematic AI pipeline analyzes each photo, plans the shot sequence, generates smooth camera movements, and assembles your video.",
                image: bathroom1,
              },
              {
                icon: <Download className="h-6 w-6" />,
                step: "03",
                title: "Download & Share",
                desc: "Receive your polished listing video within 72 hours. Download in vertical, horizontal, or both formats — ready for every platform.",
                image: aerial1,
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={fadeUp}
                custom={i}
                className="relative group"
              >
                <div className="relative h-[320px] overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    width={800}
                    height={600}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute top-6 left-6">
                    <span className="font-mono text-white/50 text-sm">{item.step}</span>
                  </div>
                  <div className="absolute bottom-6 left-6 right-6">
                    <div className="h-10 w-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white mb-3">
                      {item.icon}
                    </div>
                    <h3 className="font-display text-xl font-semibold text-white">{item.title}</h3>
                    <p className="text-sm text-white/70 mt-2 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Video Showcase */}
      <section className="px-8 md:px-16 py-20 md:py-28 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.span variants={fadeUp} custom={0} className="text-[11px] tracking-[0.35em] uppercase text-muted-foreground font-medium">
              From Photos to Film
            </motion.span>
            <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl md:text-5xl font-semibold text-foreground mt-4">
              AI-Generated Showcase
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-muted-foreground mt-4 max-w-lg mx-auto text-sm">
              See what our AI pipeline produces — every video below was generated entirely from property photos.
            </motion.p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {[
              { src: showcaseInterior.url, poster: interior1, label: "Interior", desc: "Living & Bedroom", span: "md:col-span-2 md:row-span-2" },
              { src: showcaseKitchen.url, poster: kitchen1, label: "Kitchen", desc: "Gourmet Spaces", span: "" },
              { src: showcaseBathroom.url, poster: bathroom1, label: "Bathroom", desc: "Spa & Bath", span: "" },
              { src: showcaseBeach.url, poster: aerial1, label: "Beach", desc: "Coastal Areas", span: "" },
              { src: showcaseExterior.url, poster: exterior1, label: "Exterior", desc: "Curb Appeal", span: "" },
              { src: showcaseAerial.url, poster: aerial1, label: "Aerial", desc: "Drone Views", span: "" },
            ].map((vid, i) => (
              <motion.div
                key={vid.label}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i * 0.5}
                className={`relative overflow-hidden group rounded-sm ${vid.span}`}
              >
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster={vid.poster}
                  className={`w-full ${vid.span ? "h-full min-h-[300px] md:min-h-[500px]" : "h-[200px] md:h-[240px]"} object-cover transition-transform duration-700 group-hover:scale-105`}
                >
                  <source src={vid.src} type="video/mp4" />
                </video>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <span className="text-[10px] tracking-[0.25em] uppercase text-white/60 font-medium block">{vid.desc}</span>
                  <span className="font-display text-sm font-semibold text-white">{vid.label}</span>
                </div>
                <div className="absolute top-3 right-3 h-6 w-6 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <Play className="h-3 w-3 text-white" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison stats */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={stagger}
        className="px-8 md:px-16 py-24 md:py-32"
      >
        <div className="max-w-5xl mx-auto">
          <motion.div variants={fadeUp} custom={0} className="text-center mb-16">
            <span className="text-[11px] tracking-[0.35em] uppercase text-muted-foreground font-medium">
              The Advantage
            </span>
            <h2 className="font-display text-3xl md:text-5xl font-semibold text-foreground mt-4">
              Why Listing Elevate?
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 border-t border-foreground/10">
            {[
              {
                icon: <DollarSign className="h-4 w-4 text-accent" />,
                label: "Cost",
                ours: "$75",
                oursSub: "Listing Elevate",
                theirs: "$500+",
                theirsSub: "Traditional",
              },
              {
                icon: <Clock className="h-4 w-4 text-accent" />,
                label: "Turnaround",
                ours: "72 hrs",
                oursSub: "Listing Elevate",
                theirs: "1–2 wks",
                theirsSub: "Traditional",
              },
              {
                icon: <Film className="h-4 w-4 text-accent" />,
                label: "Output",
                ours: "Both Formats",
                oursSub: "Vertical + Horizontal included",
                theirs: null,
                theirsSub: "Traditional — extra charge per format",
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                variants={fadeUp}
                custom={i + 1}
                className={`py-10 ${i === 0 ? "md:pr-12 md:border-r" : i === 1 ? "md:px-12 md:border-r border-t md:border-t-0" : "md:pl-12 border-t md:border-t-0"} border-foreground/10`}
              >
                <div className="flex items-center gap-2 mb-5">
                  {stat.icon}
                  <span className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground font-medium">{stat.label}</span>
                </div>
                <div className="flex items-baseline gap-4">
                  <div>
                    <div className="font-display text-3xl md:text-4xl font-semibold text-foreground">{stat.ours}</div>
                    <div className="text-[11px] text-muted-foreground mt-1.5 tracking-wide uppercase">{stat.oursSub}</div>
                  </div>
                  {stat.theirs && (
                    <>
                      <span className="text-muted-foreground/30 text-xs">vs</span>
                      <div>
                        <div className="font-display text-3xl md:text-4xl font-semibold text-muted-foreground/25 line-through">{stat.theirs}</div>
                        <div className="text-[11px] text-muted-foreground mt-1.5 tracking-wide uppercase">{stat.theirsSub}</div>
                      </div>
                    </>
                  )}
                </div>
                {!stat.theirs && (
                  <div className="mt-3">
                    <span className="text-[11px] text-muted-foreground tracking-wide">{stat.theirsSub}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Full-bleed CTA image */}
      <section className="relative h-[50vh] md:h-[60vh] overflow-hidden">
        <motion.img
          src={aerial1}
          alt="Aerial estate view"
          className="w-full h-full object-cover"
          loading="lazy"
          width={1920}
          height={768}
          initial={{ scale: 1.1 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="absolute inset-0 bg-black/40" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-8"
        >
          <h2 className="font-display text-3xl md:text-5xl font-semibold text-white max-w-2xl">
            Ready to Elevate Your Listings?
          </h2>
          <p className="text-white/70 mt-4 max-w-md text-sm">
            Join hundreds of agents using Listing Elevate to create cinematic listing videos in a fraction of the time and cost.
          </p>
          <Button size="lg" className="mt-8 px-12 tracking-[0.15em] uppercase text-[11px] rounded-none font-medium bg-white text-foreground hover:bg-white/90" onClick={handleGetStarted}>
            Start Your First Video <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="px-8 md:px-16 py-24 md:py-32">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="mb-16"
          >
            <motion.span variants={fadeUp} custom={0} className="text-[11px] tracking-[0.35em] uppercase text-muted-foreground font-medium">
              Common Questions
            </motion.span>
            <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl md:text-5xl font-semibold text-foreground mt-4">
              FAQ
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            {faqs.map((faq, i) => (
              <motion.div key={i} variants={fadeUp} custom={i}>
                <FAQItem question={faq.question} answer={faq.answer} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Auth Modal */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="max-w-md p-0 gap-0 rounded-none overflow-hidden">
          {authSent ? (
            <div className="p-8 text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
              <h2 className="font-display text-xl font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a magic link to <span className="font-medium text-foreground">{authEmail}</span>. Click the link to {authTab === "signup" ? "create your account" : "sign in"}.
              </p>
              <button
                onClick={() => { setAuthSent(false); setAuthEmail(""); }}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex border-b border-border">
                <button
                  onClick={() => setAuthTab("signin")}
                  className={`flex-1 py-3.5 text-[11px] tracking-[0.15em] uppercase font-medium transition-colors ${
                    authTab === "signin"
                      ? "text-foreground border-b-2 border-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setAuthTab("signup")}
                  className={`flex-1 py-3.5 text-[11px] tracking-[0.15em] uppercase font-medium transition-colors ${
                    authTab === "signup"
                      ? "text-foreground border-b-2 border-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="p-6 space-y-4">
                {authTab === "signup" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">First Name</Label>
                        <Input
                          value={authFirst}
                          onChange={(e) => setAuthFirst(e.target.value)}
                          placeholder="Jane"
                          required
                          className="rounded-none h-10"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Last Name</Label>
                        <Input
                          value={authLast}
                          onChange={(e) => setAuthLast(e.target.value)}
                          placeholder="Smith"
                          required
                          className="rounded-none h-10"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Brokerage</Label>
                      <Input
                        value={authBrokerage}
                        onChange={(e) => setAuthBrokerage(e.target.value)}
                        placeholder="e.g. Compass, Keller Williams"
                        required
                        className="rounded-none h-10"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label className="text-[11px] tracking-[0.1em] uppercase text-muted-foreground">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoFocus
                      className="rounded-none h-10 pl-10"
                    />
                  </div>
                </div>

                {authError && (
                  <p className="text-sm text-red-500">{authError}</p>
                )}

                <Button type="submit" className="w-full h-11 rounded-none tracking-[0.15em] uppercase text-[11px] font-medium" disabled={authLoading || !authEmail}>
                  {authLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {authTab === "signup" ? "Create Account" : "Send Magic Link"}
                      <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>

                <p className="text-center text-[11px] text-muted-foreground">
                  {authTab === "signin" ? (
                    <>Don't have an account?{" "}
                      <button type="button" onClick={() => setAuthTab("signup")} className="text-foreground underline underline-offset-2">Create one</button>
                    </>
                  ) : (
                    <>Already have an account?{" "}
                      <button type="button" onClick={() => setAuthTab("signin")} className="text-foreground underline underline-offset-2">Sign in</button>
                    </>
                  )}
                </p>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-foreground/10 px-8 md:px-16 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-1.5 mb-4">
                <span className="font-display text-xl font-semibold tracking-tight text-foreground">Listing Elevate</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Cinematic real estate videos powered by AI. Transform your property photos into stunning listing videos in 72 hours.
              </p>
            </div>
            <div>
              <h4 className="text-[11px] tracking-[0.25em] uppercase font-medium text-foreground mb-4">Platform</h4>
              <div className="space-y-3">
                <Link to="/upload" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Upload Photos</Link>
                <Link to="/dashboard" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
                <Link to="/presets" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Presets</Link>
              </div>
            </div>
            <div>
              <h4 className="text-[11px] tracking-[0.25em] uppercase font-medium text-foreground mb-4">Support</h4>
              <div className="space-y-3">
                <span className="block text-sm text-muted-foreground">help@listingelevate.com</span>
              </div>
            </div>
          </div>
          <div className="border-t border-foreground/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-[11px] text-muted-foreground tracking-wide">© 2026 Listing Elevate. All rights reserved.</span>
            <div className="flex gap-6">
              <span className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer tracking-wide">Privacy</span>
              <span className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer tracking-wide">Terms</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

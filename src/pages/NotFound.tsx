import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { motion, type Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 1.1, delay: i * 0.08, ease: EASE },
  }),
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.12 } },
};

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-background px-8 py-20 md:px-12">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="mx-auto flex max-w-2xl flex-col items-start"
      >
        <motion.span variants={fadeUp} className="label text-muted-foreground">
          — Error 404
        </motion.span>
        <motion.h1
          variants={fadeUp}
          className="display-xl tabular mt-8 text-foreground"
        >
          404
        </motion.h1>
        <motion.h2 variants={fadeUp} className="display-md mt-6 text-foreground">
          Lost the trail.
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground"
        >
          The page you were looking for doesn't exist — or it moved. Head back
          to the home page and start again.
        </motion.p>
        <motion.div variants={fadeUp} className="mt-12">
          <Button asChild size="lg" variant="outline">
            <Link to="/">
              Return home
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default NotFound;

import { motion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  label: string;
  animate: boolean;
  delayMs?: number;
}

export function AnimatedNumber({ value, label, animate, delayMs = 0 }: AnimatedNumberProps) {
  if (!animate) {
    return <span>{label}</span>;
  }
  return (
    <motion.span
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: delayMs / 1000, ease: [0.16, 1, 0.3, 1] }}
    >
      {label}
    </motion.span>
  );
}

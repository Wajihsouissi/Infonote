"use client";

import { motion } from "motion/react";

import { cn } from "../../lib/utils";

interface BlurInProps {
    word: string;
    className?: string;
    variant?: {
        hidden: { filter: string; opacity: number };
        visible: { filter: string; opacity: number };
    };
    duration?: number;
}

export default function BlurIn({
    word,
    className,
    variant,
    duration = 1,
}: BlurInProps) {
    const defaultVariants = {
        hidden: { filter: "blur(10px)", opacity: 0 },
        visible: { filter: "blur(0px)", opacity: 1 },
    };
    const combinedVariants = variant || defaultVariants;

    return (
        <motion.h1
            initial="hidden"
            animate="visible"
            transition={{ duration }}
            variants={combinedVariants}
            className={cn(
                "font-display text-center text-4xl font-bold tracking-[-0.02em] ",
                className,
            )}
        >
            {word}
        </motion.h1>
    );
}

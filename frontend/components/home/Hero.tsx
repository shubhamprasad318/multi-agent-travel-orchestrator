"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Globe, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Hero() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  const floatingAnimation = {
    y: [0, -20, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut" as const,
    },
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-32 pb-32">
      {/* Background - dark blue-gray gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-gray-900 to-black" />
      {/* Subtle radial gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.05),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(255,255,255,0.03),transparent)]" />
      
      {/* Large blurred orb shadows - elegant gold tints */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gradient-to-tr from-yellow-600 via-yellow-500 to-yellow-400 opacity-30 blur-3xl animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-96 h-96 rounded-full bg-gradient-to-br from-yellow-700 via-yellow-600 to-yellow-500 opacity-20 blur-3xl animate-pulse animate-delay-1500" />
      
      {/* Pattern overlay */}
      <div className="absolute inset-0 bg-[url('/pattern.svg')] opacity-10" />

      {/* Floating icons */}
      <motion.div
        animate={floatingAnimation}
        className="absolute top-24 left-16 hidden lg:block"
      >
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-tr from-yellow-600 to-yellow-400 rounded-3xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
          <div className="relative bg-gray-800/70 p-8 rounded-3xl border border-yellow-500 shadow-lg group-hover:shadow-yellow-400 transition-shadow transform group-hover:scale-105">
            <Globe className="text-yellow-400 w-12 h-12" />
          </div>
        </div>
      </motion.div>

      <motion.div
        animate={{ ...floatingAnimation, transition: { ...floatingAnimation.transition, delay: 1 } }}
        className="absolute top-40 right-20 hidden lg:block"
      >
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-tr from-yellow-700 to-yellow-500 rounded-3xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
          <div className="relative bg-gray-800/70 p-8 rounded-3xl border border-yellow-500 shadow-lg group-hover:shadow-yellow-400 transition-shadow transform group-hover:scale-105">
            <Calendar className="text-yellow-400 w-12 h-12" />
          </div>
        </div>
      </motion.div>

      <motion.div
        animate={{ ...floatingAnimation, transition: { ...floatingAnimation.transition, delay: 2 } }}
        className="absolute bottom-32 left-20 hidden lg:block"
      >
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-tr from-yellow-500 to-yellow-300 rounded-3xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity" />
          <div className="relative bg-gray-800/70 p-8 rounded-3xl border border-yellow-400 shadow-lg group-hover:shadow-yellow-300 transition-shadow transform group-hover:scale-105">
            <Sparkles className="text-yellow-300 w-12 h-12" />
          </div>
        </div>
      </motion.div>

      {/* Main content */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="container relative z-10 mx-auto px-4 text-center max-w-5xl"
      >
        {/* Badge */}
        <motion.div variants={itemVariants} className="inline-block mb-12">
          <div className="inline-flex items-center gap-3 bg-yellow-600 bg-opacity-30 backdrop-blur rounded-full px-8 py-3 shadow-md text-yellow-100 font-semibold tracking-wider">
            <Sparkles className="w-6 h-6 animate-pulse" />
            Powered by 6 AI Agents
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={itemVariants}
          className="text-6xl font-extrabold leading-tight tracking-tight text-white drop-shadow-lg"
        >
          Plan Your <br />
          Dream Trip
          <span className="block mt-6 text-yellow-400 tracking-wide drop-shadow text-5xl font-semibold">
            With AI Magic
          </span>
        </motion.h1>

        {/* Description */}
        <motion.p
          variants={itemVariants}
          className="mt-8 mb-20 max-w-3xl mx-auto text-lg text-gray-300 tracking-wide font-light"
        >
          Let our <span className="font-semibold text-yellow-400">multi-agent AI system</span> orchestrate the perfect itinerary,
          bookings, and experiences tailored just for you.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row justify-center gap-8 px-6"
        >
          <Link href="/plan" passHref>
            <Button className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-full px-20 py-6 text-2xl shadow-lg hover:shadow-yellow-500 transition-shadow duration-300 transform hover:scale-105">
              Start Planning
              <ArrowRight className="inline-block ml-4 w-8 h-8" />
            </Button>
          </Link>

          <Button className="bg-transparent border border-yellow-500 text-yellow-400 hover:bg-yellow-500 hover:text-gray-900 rounded-full px-20 py-6 text-2xl transition-colors duration-300">
            Watch Demo
          </Button>
        </motion.div>
      </motion.div>
    </section>
  )
}

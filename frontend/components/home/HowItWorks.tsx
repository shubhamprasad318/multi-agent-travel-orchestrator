"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Search, Wand2, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  const steps = [
    {
      icon: Search,
      title: "Tell Us Your Dreams",
      description: "Share your destination, dates, budget, and preferences",
      number: "01",
    },
    {
      icon: Wand2,
      title: "AI Agents Work Magic",
      description: "6 specialized agents research, plan, and optimize your trip",
      number: "02",
    },
    {
      icon: CheckCircle2,
      title: "Get Your Perfect Plan",
      description: "Receive a complete itinerary with bookings and recommendations",
      number: "03",
    },
  ];

  return (
    <section
      ref={ref}
      className="py-32 bg-gradient-to-br from-blue-950 via-blue-900 to-gray-950 relative overflow-hidden"
      id="how-it-works"
    >
      {/* Modern gold/amber radial overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#ffd70022,transparent_70%)] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-yellow-500/10 to-yellow-400/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-gradient-to-br from-yellow-400/15 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-20"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="inline-block mb-4"
          >
            <span className="bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent font-bold text-sm tracking-widest uppercase">
              Process
            </span>
          </motion.div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 leading-tight text-white">
            How It <span className="bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-600 bg-clip-text text-transparent">Works</span>
          </h2>
          <p className="text-lg md:text-xl text-blue-100 max-w-3xl mx-auto leading-relaxed font-light">
            From dream to departure in three simple steps
          </p>
        </motion.div>

        <div className="relative max-w-4xl mx-auto">
          {/* Modern Connection Lines */}
          <div className="hidden lg:block absolute top-24 left-0 right-0 h-1">
            <div className="absolute left-[15%] right-[15%] h-full">
              <div className="w-full h-full bg-gradient-to-r from-yellow-400/30 via-yellow-300/20 to-yellow-600/30 rounded-full blur-sm" />
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-600 rounded-full animate-pulse" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: index * 0.3 }}
                whileHover={{ y: -8, scale: 1.04 }}
                className="relative group"
              >
                <div className="relative">
                  {/* Gold Glow Effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-yellow-200/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  {/* Card - elegant blue-gray glass with gold border */}
                  <Card className="relative p-8 text-center bg-white/5 backdrop-blur-xl border border-yellow-200/40 hover:border-yellow-400/80 transition-all duration-500 shadow-xl hover:shadow-yellow-200/30 rounded-2xl overflow-hidden max-w-sm mx-auto">
                    {/* Step Number */}
                    <div className="absolute top-6 right-6 text-5xl font-black text-yellow-100/30 group-hover:text-yellow-200/50 transition-colors duration-300 select-none pointer-events-none">
                      {step.number}
                    </div>
                    <div className="relative z-10">
                      {/* Icon */}
                      <div className="flex justify-center mb-6">
                        <div className="relative">
                          {/* Gold Icon Glow */}
                          <div className="absolute inset-0 bg-gradient-to-tr from-yellow-400 to-yellow-600 rounded-full blur-md opacity-40" />
                          <div className="relative w-16 h-16 bg-gradient-to-tr from-yellow-500 via-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center shadow-xl">
                            <step.icon className="w-8 h-8 text-white" />
                          </div>
                        </div>
                      </div>
                      {/* Title and Description */}
                      <h3 className="text-xl font-bold mb-4 text-white group-hover:bg-gradient-to-r group-hover:from-yellow-400 group-hover:to-yellow-600 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
                        {step.title}
                      </h3>
                      <p className="text-blue-100 text-base leading-relaxed font-light">{step.description}</p>
                    </div>
                  </Card>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

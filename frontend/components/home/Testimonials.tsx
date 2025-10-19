"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Star, Quote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Testimonials() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "Travel Enthusiast",
      avatar: "",
      rating: 5,
      text: "The AI planned a perfect 10-day trip across Europe. Every detail was impeccable!",
    },
    {
      name: "Michael Chen",
      role: "Business Traveler",
      avatar: "",
      rating: 5,
      text: "Saved me countless hours with precise, optimized itineraries.",
    },
    {
      name: "Emily Rodriguez",
      role: "Adventure Seeker",
      avatar: "",
      rating: 5,
      text: "Discovered hidden gems and unforgettable experiences!",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.3 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
  };

  return (
    <section ref={ref} className="py-32 bg-gradient-to-br from-gray-100 via-white to-gray-100" id="testimonials">
      <div className="container mx-auto px-4 max-w-6xl">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={containerVariants}
          className="text-center mb-20"
        >
          <motion.h2
            variants={itemVariants}
            className="text-5xl font-extrabold text-gray-900 mb-4"
          >
            What Our <span className="text-indigo-600">Travelers Say</span>
          </motion.h2>
          <motion.p
            variants={itemVariants}
            className="text-gray-700 max-w-3xl mx-auto leading-relaxed"
          >
            Our AI-powered trip planner has delighted people worldwide.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {testimonials.map(({ name, role, rating, text }, i) => (
            <motion.div 
              key={i} 
              variants={itemVariants}
              whileHover={{ scale: 1.03, y: -5 }}
              className="group cursor-default"
            >
              <Card className="p-8 rounded-3xl bg-white shadow-lg border border-gray-200 hover:shadow-indigo-400">
                <div className="flex flex-col items-center">
                  <Avatar className="mb-4 w-20 h-20 shadow-md border border-indigo-500">
                    <AvatarFallback className="bg-indigo-600 text-white text-2xl font-black">
                      {name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  
                  <h3 className="text-xl font-semibold mb-1 text-gray-900 group-hover:text-indigo-600">{name}</h3>
                  <span className="text-gray-600 mb-4 uppercase tracking-wider">{role}</span>
                  
                  <div className="flex mb-4">
                    {[...Array(rating)].map((_, idx) => (
                      <Star key={idx} className="w-5 h-5 text-yellow-400 mx-0.5" />
                    ))}
                  </div>
                  
                  <p className="text-gray-700 italic text-center leading-relaxed">{text}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { Plane, Github, Twitter, Linkedin } from "lucide-react";

// Elegant deep blue and gold
export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-gray-950 text-white py-20 border-t border-blue-900">
      {/* Gold ambient background accents */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#ffd70017,transparent_70%)]" />
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-gradient-to-br from-yellow-500/10 to-yellow-400/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-gradient-to-br from-yellow-400/15 to-transparent rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-16">
          <div className="md:col-span-1">
            <div className="flex items-center space-x-4 mb-8">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-2xl blur-md opacity-50" />
                <div className="relative bg-gradient-to-r from-yellow-500 to-yellow-400 p-3 rounded-2xl shadow-xl">
                  <Plane className="w-8 h-8 text-white" />
                </div>
              </div>
              <span className="text-2xl font-black bg-gradient-to-r from-white to-yellow-300 bg-clip-text text-transparent">
                TravelOrchestrator
              </span>
            </div>
            <p className="text-blue-100 text-base leading-relaxed mb-6">
              AI-powered travel planning with multi-agent orchestration. Plan your perfect trip in minutes with our intelligent system.
            </p>
            <div className="flex space-x-3">
              <a href="#" className="w-11 h-11 bg-white/5 border border-yellow-200/40 rounded-xl flex items-center justify-center hover:bg-yellow-400/10 hover:border-yellow-300 transition-all transform hover:scale-110">
                <Github className="w-5 h-5 text-yellow-300" />
              </a>
              <a href="#" className="w-11 h-11 bg-white/5 border border-yellow-200/40 rounded-xl flex items-center justify-center hover:bg-yellow-400/10 hover:border-yellow-300 transition-all transform hover:scale-110">
                <Twitter className="w-5 h-5 text-yellow-300" />
              </a>
              <a href="#" className="w-11 h-11 bg-white/5 border border-yellow-200/40 rounded-xl flex items-center justify-center hover:bg-yellow-400/10 hover:border-yellow-300 transition-all transform hover:scale-110">
                <Linkedin className="w-5 h-5 text-yellow-300" />
              </a>
            </div>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { href: "/#features", label: "Features" },
              { href: "/#how-it-works", label: "How It Works" },
              { href: "/plan", label: "Start Planning" },
            ]}
          />

          <FooterColumn
            title="Company"
            links={[
              { href: "#", label: "About" },
              { href: "#", label: "Blog" },
              { href: "#", label: "Careers" },
            ]}
          />

          <FooterColumn
            title="Support"
            links={[
              { href: "#", label: "Help Center" },
              { href: "#", label: "Contact Us" },
              { href: "#", label: "Privacy Policy" },
            ]}
          />
        </div>

        <div className="border-t border-blue-900 mt-16 pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-blue-200 text-base">
              &copy; 2025 TravelOrchestrator. Built with
              <span className="text-yellow-400 font-bold mx-1">Next.js</span> &
              <span className="text-yellow-300 font-bold mx-1">AI Magic</span> ✨
            </p>
            <div className="flex items-center gap-6 text-blue-200 text-sm">
              <span>Made with <span className="text-yellow-300">❤️</span> for travelers</span>
              <span>•</span>
              <span>Powered by 6 AI Agents</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Helper for DRY columns with gold hover bullets
function FooterColumn({ title, links }: { title: string, links: { href: string, label: string }[] }) {
  return (
    <div>
      <h4 className="font-bold text-xl mb-8 text-white">{title}</h4>
      <ul className="space-y-4 text-blue-100">
      {links.map(({ href, label }, idx) => (
          <li key={href !== "#" ? href : `${href}-${label.replace(/\s/g, "")}-${idx}`}>
            <Link href={href} className="hover:text-yellow-400 transition-colors text-base font-medium flex items-center group">
              <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

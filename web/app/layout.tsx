import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       'AutoOrg Dashboard',
  description: 'You write the mission. The agents run the company.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen font-mono">
        <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
          <span className="text-cyan-400 font-bold text-lg">🔬 AutoOrg</span>
          <span className="text-gray-500 text-sm">Autonomous Research Organization Engine</span>
          <nav className="ml-auto flex gap-6 text-sm">
            <a href="/"           className="text-gray-400 hover:text-cyan-400 transition-colors">Dashboard</a>
            <a href="/graph"      className="text-gray-400 hover:text-cyan-400 transition-colors">Knowledge Graph</a>
            <a href="/interview"    className="text-gray-400 hover:text-cyan-400 transition-colors">Interview</a>
            <a href="/benchmarks"   className="text-cyan-400 font-bold hover:text-cyan-300 transition-colors">Benchmarks</a>
            <a href="/leaderboard"  className="text-cyan-400 font-bold hover:text-cyan-300 transition-colors">Leaderboard</a>
            <a href="/portfolio"    className="text-purple-400 font-bold hover:text-purple-300 transition-colors">Portfolio</a>
            <a href="/swarm"        className="text-purple-400 font-bold hover:text-purple-300 transition-colors">Swarm</a>
            <a href="/agents"       className="text-orange-400 font-bold hover:text-orange-300 transition-colors">Agents</a>
            <a href="/workspaces"   className="text-orange-400 font-bold hover:text-orange-300 transition-colors">Workspaces</a>
          </nav>
        </header>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}

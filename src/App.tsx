import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useNavigate,
} from "react-router-dom";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, loginWithGoogle, logout } from "./lib/firebase";
import { Home } from "./pages/Home";
import { Upload } from "./pages/Upload";
import { AdminDashboard } from "./pages/AdminDashboard";
import { NewsArchive } from "./pages/NewsArchive";
import { Profile } from "./pages/Profile";
import { Curiosities } from "./pages/Curiosities";
import { About } from "./pages/About";
import { CronistaChat } from "./pages/CronistaChat";
import { Efemerides } from "./pages/Efemerides";
import { NotFound } from "./pages/NotFound";
import {
  Search,
  ImagePlus,
  LogOut,
  LogIn,
  Menu,
  X,
  Landmark,
  ShieldCheck,
  Newspaper,
  UserCircle,
  MessageCircleQuestion,
  Info,
  Sparkles,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./lib/utils";
import { Role } from "./types";

export function Navigation({
  user,
  onLogout,
  userRole,
}: {
  user: FirebaseUser | null;
  onLogout: () => void;
  userRole: Role;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin =
    user?.email === "mikeldiaz0@gmail.com" ||
    user?.email === "estellaescapecity@gmail.com" ||
    userRole === "admin";

  const navLinks = [
    { to: "/", label: "Explorar", icon: Search, color: "hover:text-[#5A5A40]" },
    { to: "/efemerides", label: "Efemérides", icon: History, color: "hover:text-amber-800" },
    { to: "/news", label: "Hemeroteca", icon: Newspaper, color: "hover:text-[#5A5A40]" },
    { to: "/cronista", label: "Cronista IA", icon: Sparkles, color: "hover:text-amber-700" },
    { to: "/curiosities", label: "Curiosidades", icon: MessageCircleQuestion, color: "hover:text-purple-600" },
    { to: "/about", label: "Proyecto", icon: Info, color: "hover:text-teal-600" },
  ];

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-[#e8e8e6] sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20 gap-4">
          <div className="flex items-center shrink-0">
            <Link to="/" className="flex-shrink-0 flex items-center gap-3">
              <div className="bg-[#5A5A40] p-2.5 rounded-2xl shadow-sm rotate-3 group-hover:rotate-0 transition-transform">
                <Landmark className="w-6 h-6 text-[#f5f5f0]" />
              </div>
              <div className="flex flex-col">
                <span className="font-serif font-bold text-lg sm:text-xl text-gray-900 tracking-tight leading-none whitespace-nowrap">
                  Archivo Histórico
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#5A5A40] font-bold opacity-80 whitespace-nowrap">
                  Estella - Lizarra
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Nav */}
          <div className="hidden xl:flex xl:items-center xl:space-x-1 shrink-0">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "px-3 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 transition-all duration-200 whitespace-nowrap",
                  "text-gray-600 hover:bg-[#eae8e3]/50",
                  link.color
                )}
              >
                <link.icon className="w-4 h-4 shrink-0" />
                <span>{link.label}</span>
              </Link>
            ))}

            {isAdmin && (
              <Link
                to="/admin"
                className="text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 transition-all whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" /> Admin
              </Link>
            )}
            
            <div className="h-5 w-px bg-gray-200 mx-2 shrink-0" />

            <Link
              to="/upload"
              className="bg-[#5A5A40] hover:bg-[#4a4a30] text-[#f5f5f0] px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm hover:shadow-md active:scale-95 whitespace-nowrap shrink-0"
            >
              <ImagePlus className="w-4 h-4 shrink-0" />
              <span>Subir Foto</span>
            </Link>

            {user ? (
              <div className="flex items-center gap-2 ml-1 group shrink-0">
                <Link to="/profile" className="relative" title="Mi Perfil">
                  <img
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`}
                    alt="Avatar"
                    className="w-9 h-9 rounded-full border-2 border-transparent group-hover:border-[#5A5A40] transition-all shadow-xs"
                  />
                </Link>
                <button
                  onClick={onLogout}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="ml-2 text-[#8c1c24] hover:bg-red-50 font-bold px-4 py-2 rounded-full text-sm flex items-center gap-1.5 transition-all border border-red-100 whitespace-nowrap shrink-0"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span>Acceder</span>
              </button>
            )}
          </div>

          {/* Mobile & Tablet menu button */}
          <div className="flex items-center xl:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2.5 rounded-2xl text-gray-500 hover:text-gray-800 hover:bg-[#eae8e3]/50 transition-all focus:outline-none"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="xl:hidden border-t border-[#e8e8e6] bg-white overflow-hidden shadow-xl rounded-b-3xl"
          >
            <div className="pt-4 pb-6 space-y-1 px-4">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-base font-medium text-gray-700 hover:bg-[#eae8e3]/40 transition-colors"
                >
                  <link.icon className="w-5 h-5 opacity-70" /> {link.label}
                </Link>
              ))}
              
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-base font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  <ShieldCheck className="w-5 h-5 opacity-70" /> Admin
                </Link>
              )}

              <Link
                to="/upload"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-base font-bold text-white bg-[#5A5A40] mt-4 mb-2 shadow-sm"
              >
                <ImagePlus className="w-5 h-5" /> Subir Foto
              </Link>
            </div>
            
            <div className="pt-6 pb-8 border-t border-gray-100 px-6">
              {user ? (
                <div className="flex items-center gap-4">
                  <Link 
                    to="/profile" 
                    onClick={() => setIsOpen(false)} 
                    className="flex items-center gap-3 group"
                  >
                    <img
                      className="h-12 w-12 rounded-full border-2 border-[#5A5A40]"
                      src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`}
                      alt=""
                    />
                    <div>
                      <div className="text-sm font-bold text-gray-900 line-clamp-1">
                        {user.displayName || user.email}
                      </div>
                      <div className="text-xs text-[#5A5A40] font-medium">Ver mi perfil &rarr;</div>
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onLogout();
                    }}
                    className="ml-auto bg-red-50 p-3 rounded-2xl text-red-500 hover:bg-red-100 transition-colors"
                  >
                    <LogOut className="h-6 w-6" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    loginWithGoogle();
                  }}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl text-base font-bold text-[#8c1c24] bg-red-50 border border-red-100 hover:bg-red-100 transition-all"
                >
                  <LogIn className="w-5 h-5" /> Acceder con Google
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

function SpaRedirectHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const redirect = sessionStorage.getItem("spa_redirect_path");
    if (redirect) {
      sessionStorage.removeItem("spa_redirect_path");
      navigate(redirect, { replace: true });
    }
  }, [navigate]);
  return null;
}

export function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userRole, setUserRole] = useState<Role>("user");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) {
            const data = snap.data();
            if (data.role) setUserRole(data.role);
            else if (data.isAdmin) setUserRole("admin");
            else setUserRole("user");
          }
        } catch (e) {
          console.error("Error fetching user role", e);
          setUserRole("user");
        }
      } else {
        setUserRole("user");
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <SpaRedirectHandler />
      <div className="min-h-screen bg-[#f5f5f0] flex flex-col font-sans">
        <Navigation user={user} onLogout={logout} userRole={userRole} />
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Routes>
            <Route path="/" element={<Home user={user} userRole={userRole} />} />
            <Route path="/efemerides" element={<Efemerides user={user} />} />
            <Route path="/news" element={<NewsArchive user={user} />} />
            <Route path="/cronista" element={<CronistaChat user={user} />} />
            <Route path="/curiosities" element={<Curiosities user={user} />} />
            <Route path="/about" element={<About />} />
            <Route path="/upload" element={<Upload user={user} />} />
            <Route path="/profile" element={<Profile user={user} userRole={userRole} />} />
            <Route
              path="/admin"
              element={<AdminDashboard user={user} userRole={userRole} />}
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        {/* Floating "Preguntar al Cronista" AI button */}
        <Link
          to="/cronista"
          className="fixed bottom-6 right-6 z-40 bg-[#5A5A40] hover:bg-[#4a4a30] text-white pl-4 pr-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2 group active:scale-95 border border-[#6b6b4d]"
          title="Preguntar al Cronista de Estella"
        >
          <Sparkles className="w-5 h-5 text-amber-300 group-hover:rotate-12 transition-transform" />
          <span className="text-xs sm:text-sm font-semibold tracking-wide">El Cronista IA</span>
        </Link>

        <footer className="bg-white border-t border-[#e8e8e6] pt-12 pb-8 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-10">
              {/* Col 1 */}
              <div className="space-y-4 text-center md:text-left">
                <h3 className="font-serif text-xl text-[#3A3A28] font-bold">
                  Archivo Histórico de Estella
                </h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto md:mx-0">
                  Un proyecto de memoria gráfica colectiva para preservar y descubrir las historias que esconden las calles y fotografías de Estella-Lizarra.
                </p>
              </div>

              {/* Col 2 */}
              <div className="space-y-4 text-center">
                <h4 className="font-medium text-gray-900 uppercase tracking-widest text-xs">Aviso Legal y Enlaces</h4>
                <ul className="space-y-2 text-sm text-gray-500">
                  <li><Link to="/about" className="hover:text-teal-600 transition-colors">Sobre el proyecto</Link></li>
                  <li><a href="#" className="hover:text-teal-600 transition-colors">Política de Privacidad</a></li>
                  <li><a href="#" className="hover:text-teal-600 transition-colors">Términos de Uso</a></li>
                </ul>
              </div>

              {/* Col 3 - Sponsors / Created by */}
              <div className="space-y-4 text-center md:text-right flex flex-col items-center md:items-end">
                <h4 className="font-medium text-gray-900 uppercase tracking-widest text-xs">Un proyecto desarrollado por</h4>
                <a 
                  href="https://estellaescapecity.com" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="group block relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100"></div>
                  <div className="relative bg-white border border-[#e8e8e6] p-4 rounded-2xl shadow-sm group-hover:shadow-md transition-all flex flex-col items-center gap-3 w-56">
                     <img 
                       src="/logo.png" 
                       alt="Logo Estella Escape City" 
                       className="h-24 w-auto object-contain"
                       onError={(e) => {
                         e.currentTarget.style.display = 'none';
                         e.currentTarget.nextElementSibling?.classList.remove('hidden');
                       }}
                     />
                     <div className="hidden font-serif font-bold text-[#8c1c24] text-center leading-tight">
                       Estella-Lizarra<br/>
                       <span className="text-xs uppercase tracking-widest text-gray-500">Escape City</span>
                     </div>
                     <span className="text-xs text-gray-500 font-medium group-hover:text-[#8c1c24] transition-colors">Visitar web oficial &rarr;</span>
                  </div>
                </a>
              </div>
            </div>
            
            <div className="border-t border-[#e8e8e6] pt-8 text-center text-xs text-gray-400">
              <p>&copy; {new Date().getFullYear()} Archivo Histórico de Estella-Lizarra. Colaboran los ciudadanos de la ciudad.</p>
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
